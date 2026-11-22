const GEMINI_RENDERER =
  "https://gemini-renderer.hsynysydamyrbas.workers.dev";

const GEMINI_RHASH =
  "3486ceebe3928a";

const RHASH_MAP = {
  "filmzi.com": "05f5de27e9bb44",
  "zoomg.ir": "3bfd60cb9c4468",
  "zoomit.ir": "90574c27dd262d",
};

const DEFAULT_VIDEO_PROMPT =
  "این رو جمله به جمله انگلیسی و فارسی بگو";

const TRANSLATION_SYSTEM_INSTRUCTION = `You are an expert English-to-Persian audiovisual translator.
Transcribe and translate the spoken content sentence-by-sentence.

Strict Formatting Rules:
1. Break the speech down into natural, complete sentences.
2. For each sentence, write the exact English transcription in bold on its own line: **[English Sentence]**
3. Leave one blank line, then write the natural, idiomatic Persian translation on its own line.
4. If the sentence contains important idioms, phrasal verbs, or slang, add a short Persian bullet point below the translation explaining it.
5. Separate each sentence pair with a horizontal rule (---).
6. Output ONLY the bilingual sentences with no introductory or concluding text.`;

const AI_SHARE_URL_RE =
  /https?:\/\/(?:share\.gemini\.google\/[^\s<>()"']+|gemini\.google\.com\/share\/[^\s<>()"']+|g\.co\/gemini\/share\/[^\s<>()"']+|(?:chatgpt\.com|chat\.openai\.com)\/(?:share|s)\/[^\s<>()"']+)/i;

const GENERIC_URL_RE = /https?:\/\/[^\s<>()"']+/i;
const CHAT_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("OK");
    }

    try {
      const update = await request.json();

      if (update.callback_query) {
        await handleCallbackQuery(update.callback_query, env);
        return new Response("OK");
      }

      if (update.message) {
        await handleMessage(update.message, env);
      }

      return new Response("OK");
    } catch (error) {
      console.error("Bot error:", error);
      return new Response("OK");
    }
  },
};

/*
 * Telegram message
 */

async function handleMessage(message, env) {
  const chatId = message.chat.id;

  // ۱. بررسی پیام‌های ویدیویی یا صوتی
  const media = extractMediaInfo(message);
  if (media) {
    await handleMediaMessage(media, message.caption, chatId, env);
    return;
  }

  if (!message.text) {
    return;
  }

  const text = message.text.trim();

  if (text === "/start" || text === "/help") {
    await sendMessage(
      chatId,
      [
        "🤖 <b>AI Share Renderer Bot</b>",
        "",
        "لینک عمومی مکالمات <b>Gemini</b> یا <b>ChatGPT</b> را بفرست تا خروجی <b>Instant View</b> یا <b>PDF</b> تحویل بگیری.",
        "",
        "🔗 لینک‌های پشتیبانی‌شده:",
        "• <code>https://chatgpt.com/share/...</code> / <code>/s/...</code>",
        "• <code>https://gemini.google.com/share/...</code>",
        "• <code>https://share.gemini.google/...</code>",
        "• <code>https://g.co/gemini/share/...</code>",
        "",
        "🎬 همچنین می‌توانی ویدیو یا ویس بفرستی تا ترجمه جمله‌به‌جمله انگلیسی و فارسی برایت ساخته شود.",
      ].join("\n"),
      env
    );
    return;
  }

  // ۲. بررسی لینک‌های اشتراک‌گذاری Gemini و ChatGPT (حتی اگر همراه متن ارسال شوند)
  const shareUrl = extractAiShareUrl(text);
  if (shareUrl) {
    await handleAiShare(shareUrl, chatId, env);
    return;
  }

  // ۳. سایت‌های خبری دارای RHASH
  const newsUrl = extractNewsUrl(text);
  if (newsUrl) {
    const rhash = findRhash(newsUrl);
    if (rhash) {
      const ivUrl = buildInstantViewUrl(newsUrl, rhash);
      await sendMessage(
        chatId,
        `⚡ <a href="${escapeAttr(ivUrl)}">Instant View</a> | 🔗 <a href="${escapeAttr(newsUrl)}">Source</a>`,
        env
      );
    }
  }
}

/*
 * Gemini & ChatGPT Share
 */

function stripTrailingPunctuation(url) {
  return url.replace(/[.,!?;:)\]]+$/, "");
}

function extractAiShareUrl(text) {
  const match = text.match(AI_SHARE_URL_RE);
  if (!match) return null;
  const candidate = stripTrailingPunctuation(match[0]);
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function extractNewsUrl(text) {
  const match = text.match(GENERIC_URL_RE);
  if (!match) return null;
  const candidate = stripTrailingPunctuation(match[0]);
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function rendererFetch(url, init, env) {
  if (env?.GEMINI_RENDERER && typeof env.GEMINI_RENDERER.fetch === "function") {
    return env.GEMINI_RENDERER.fetch(url, init);
  }
  return fetch(url, init);
}

async function handleAiShare(shareUrl, chatId, env) {
  const isChatGpt =
    shareUrl.includes("chatgpt.com/") || shareUrl.includes("chat.openai.com/");
  const platformLabel = isChatGpt ? "ChatGPT" : "Gemini";

  const statusMsg = await sendMessage(
    chatId,
    `⏳ در حال استخراج مکالمه ${platformLabel}...`,
    env
  );
  const statusMsgId = statusMsg.result.message_id;

  try {
    const result = await extractAiChat(shareUrl, env);
    const rendererChatId = extractRendererChatId(result.chatUrl);

    const detectedLabel =
      result.platform === "chatgpt" ? "🤖 ChatGPT" : "🤖 Gemini";
    const titleLine = result.title
      ? `${detectedLabel} — <b>${escapeHtml(result.title)}</b>\n\n`
      : `${detectedLabel}\n\n`;

    await telegramRequest(
      "editMessageText",
      {
        chat_id: chatId,
        message_id: statusMsgId,
        text: `${titleLine}فرمت خروجی را انتخاب کنید:`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "📄 PDF",
                callback_data: `pdf:${rendererChatId}`,
              },
              {
                text: "⚡ Instant View",
                callback_data: `iv:${rendererChatId}`,
              },
            ],
          ],
        },
      },
      env
    );
  } catch (error) {
    console.error("AI Share error:", error);

    await editMessage(
      chatId,
      statusMsgId,
      `❌ خطا در پردازش لینک ${platformLabel}:\n\n${escapeHtml(error.message)}`,
      env
    );
  }
}

async function extractAiChat(shareUrl, env) {
  const workerUrl = `${GEMINI_RENDERER}/?url=${encodeURIComponent(shareUrl)}`;

  const response = await rendererFetch(workerUrl, { method: "GET" }, env);
  const responseText = await response.text();

  if (!response.ok) {
    let errMsg = responseText;
    try {
      const parsed = JSON.parse(responseText);
      if (parsed?.error) errMsg = parsed.error;
    } catch {
      // keep raw text
    }
    throw new Error(`Worker returned ${response.status}: ${errMsg}`);
  }

  const result = JSON.parse(responseText);

  if (!result.success || !result.chatUrl) {
    throw new Error(`Invalid Worker response: ${responseText}`);
  }

  return result;
}

/*
 * Video / Audio -> Bilingual Transcript -> Instant View
 */

function extractMediaInfo(message) {
  if (message.video) {
    return {
      fileId: message.video.file_id,
      fileSize: message.video.file_size || 0,
      mimeType: message.video.mime_type || "video/mp4",
      fileName: message.video.file_name || "video.mp4",
    };
  }
  if (message.video_note) {
    return {
      fileId: message.video_note.file_id,
      fileSize: message.video_note.file_size || 0,
      mimeType: "video/mp4",
      fileName: "video_note.mp4",
    };
  }
  if (message.voice) {
    return {
      fileId: message.voice.file_id,
      fileSize: message.voice.file_size || 0,
      mimeType: message.voice.mime_type || "audio/ogg",
      fileName: "voice.ogg",
    };
  }
  if (message.audio) {
    return {
      fileId: message.audio.file_id,
      fileSize: message.audio.file_size || 0,
      mimeType: message.audio.mime_type || "audio/mpeg",
      fileName: message.audio.file_name || "audio.mp3",
    };
  }
  if (
    message.document &&
    (message.document.mime_type?.startsWith("video/") ||
      message.document.mime_type?.startsWith("audio/"))
  ) {
    return {
      fileId: message.document.file_id,
      fileSize: message.document.file_size || 0,
      mimeType: message.document.mime_type,
      fileName: message.document.file_name || "media",
    };
  }
  return null;
}

async function handleMediaMessage(media, caption, chatId, env) {
  const MAX_TG_BYTES = 20 * 1024 * 1024;
  if (media.fileSize > MAX_TG_BYTES) {
    await sendMessage(
      chatId,
      "❌ حجم فایل بیشتر از ۲۰ مگابایت است و طبق محدودیت تلگرام امکان دانلود مستقیم توسط بات وجود ندارد.",
      env
    );
    return;
  }

  const statusMsg = await sendMessage(
    chatId,
    "⏳ در حال دریافت فایل و پردازش جمله‌به‌جمله با Gemini...",
    env
  );
  const statusMsgId = statusMsg.result.message_id;

  let uploadedFileName = null;

  try {
    if (!env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY در تنظیمات ورکر بات تعریف نشده است.");
    }
    if (!env.RENDER_TOKEN) {
      throw new Error("RENDER_TOKEN در تنظیمات ورکر بات تعریف نشده است.");
    }

    // ۱. دریافت فایل از تلگرام
    const fileRes = await telegramRequest(
      "getFile",
      { file_id: media.fileId },
      env
    );
    const tgFilePath = fileRes.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${tgFilePath}`;
    const mediaResponse = await fetch(downloadUrl);

    if (!mediaResponse.ok) {
      throw new Error(`خطا در دانلود فایل از تلگرام: ${mediaResponse.status}`);
    }
    const fileBuffer = await mediaResponse.arrayBuffer();

    // ۲. آپلود در Gemini File API
    const uploadedFile = await uploadToGeminiFileApi(
      fileBuffer,
      media.mimeType,
      media.fileName,
      env.GEMINI_API_KEY
    );
    uploadedFileName = uploadedFile.name;

    const activeFile = await waitForGeminiFileActive(
      uploadedFile,
      env.GEMINI_API_KEY
    );

    // ۳. تولید خروجی جمله‌به‌جمله
    const userPrompt = (caption && caption.trim()) || DEFAULT_VIDEO_PROMPT;
    const markdownResult = await generateBilingualTranscript(
      activeFile.uri,
      activeFile.mimeType,
      userPrompt,
      env.GEMINI_API_KEY
    );

    // ۴. ارسال به روت /render در gemini-renderer
    const rendered = await sendToRenderer(
      {
        title: "ترجمه جمله‌به‌جمله ویدیو",
        prompt: userPrompt,
        markdown: markdownResult,
        turns: [
          { role: "user", text: userPrompt },
          { role: "model", text: markdownResult },
        ],
      },
      env
    );

    const rendererChatId = extractRendererChatId(rendered.chatUrl);
    const publicChatUrl = `${GEMINI_RENDERER}/chat/${rendererChatId}`;
    const ivUrl = buildInstantViewUrl(publicChatUrl, GEMINI_RHASH);

    await telegramRequest(
      "editMessageText",
      {
        chat_id: chatId,
        message_id: statusMsgId,
        text: `⚡ <a href="${escapeAttr(ivUrl)}">Instant View</a> | 🔗 <a href="${escapeAttr(publicChatUrl)}">Source</a>`,
        parse_mode: "HTML",
        disable_web_page_preview: false,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "📄 PDF",
                callback_data: `pdf:${rendererChatId}`,
              },
            ],
          ],
        },
      },
      env
    );
  } catch (error) {
    console.error("Media processing error:", error);
    await editMessage(
      chatId,
      statusMsgId,
      `❌ خطا در پردازش ویدیو:\n\n${escapeHtml(error.message)}`,
      env
    );
  } finally {
    if (uploadedFileName && env.GEMINI_API_KEY) {
      await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${uploadedFileName}?key=${env.GEMINI_API_KEY}`,
        { method: "DELETE" }
      ).catch(() => {});
    }
  }
}

async function uploadToGeminiFileApi(fileBuffer, mimeType, displayName, apiKey) {
  const boundary = `----GeminiBoundary${crypto.randomUUID().replace(/-/g, "")}`;
  const encoder = new TextEncoder();

  const metadataPart = encoder.encode(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify({ file: { display_name: displayName } })}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`
  );
  const closingPart = encoder.encode(`\r\n--${boundary}--`);
  const fileBytes = new Uint8Array(fileBuffer);

  const combined = new Uint8Array(
    metadataPart.byteLength + fileBytes.byteLength + closingPart.byteLength
  );
  combined.set(metadataPart, 0);
  combined.set(fileBytes, metadataPart.byteLength);
  combined.set(closingPart, metadataPart.byteLength + fileBytes.byteLength);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=multipart&key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: combined,
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini File Upload failed (${res.status}): ${errText}`);
  }

  const json = await res.json();
  return json.file;
}

async function waitForGeminiFileActive(file, apiKey) {
  let current = file;
  for (let i = 0; i < 15; i++) {
    if (current.state === "ACTIVE") {
      return current;
    }
    if (current.state === "FAILED") {
      throw new Error("پردازش فایل ویدیویی توسط Gemini ناموفق بود.");
    }
    await new Promise((r) => setTimeout(r, 2000));
    const checkRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${current.name}?key=${apiKey}`
    );
    if (checkRes.ok) {
      current = await checkRes.json();
    }
  }
  throw new Error("زمان پردازش ویدیو در سرور Gemini به پایان رسید.");
}

async function generateBilingualTranscript(fileUri, mimeType, prompt, apiKey) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: TRANSLATION_SYSTEM_INSTRUCTION }],
        },
        contents: [
          {
            role: "user",
            parts: [
              { fileData: { mimeType, fileUri } },
              { text: prompt },
            ],
          },
        ],
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini GenerateContent failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const outputText = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || "")
    .join("")
    .trim();

  if (!outputText) {
    throw new Error("پاسخ متنی از مدل دریافت نشد.");
  }

  return outputText;
}

async function sendToRenderer(payload, env) {
  const response = await rendererFetch(
    `${GEMINI_RENDERER}/render`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RENDER_TOKEN}`,
      },
      body: JSON.stringify(payload),
    },
    env
  );

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Renderer /render returned ${response.status}: ${responseText}`
    );
  }

  const result = JSON.parse(responseText);
  if (!result.success || !result.chatUrl) {
    throw new Error(`Invalid /render response: ${responseText}`);
  }

  return result;
}

/*
 * Helpers & Callbacks
 */

function extractRendererChatId(chatUrl) {
  const url = new URL(
    chatUrl.replace("https://gemini-renderer", GEMINI_RENDERER),
    GEMINI_RENDERER
  );

  const parts = url.pathname.split("/").filter(Boolean);

  if (parts.length < 2 || parts[0] !== "chat" || !CHAT_ID_RE.test(parts[1])) {
    throw new Error("Invalid rendered chat URL.");
  }

  return parts[1];
}

function findRhash(urlStr) {
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    for (const [domain, rhash] of Object.entries(RHASH_MAP)) {
      if (host === domain || host.endsWith(`.${domain}`)) {
        return rhash;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function buildInstantViewUrl(url, rhash) {
  return (
    `https://t.me/iv?url=` +
    `${encodeURIComponent(url)}` +
    `&rhash=${rhash}`
  );
}

async function handleCallbackQuery(callbackQuery, env) {
  const callbackId = callbackQuery.id;
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data || "";

  await answerCallbackQuery(callbackId, env);

  if (data.startsWith("iv:")) {
    await handleInstantViewCallback(data, chatId, messageId, env);
    return;
  }

  if (data.startsWith("pdf:")) {
    await handlePdfCallback(data, chatId, messageId, env);
  }
}

async function handleInstantViewCallback(data, chatId, messageId, env) {
  const rendererChatId = data.slice(3).trim();
  if (!CHAT_ID_RE.test(rendererChatId)) {
    await editMessage(chatId, messageId, "❌ شناسه مکالمه نامعتبر است.", env);
    return;
  }

  const publicChatUrl = `${GEMINI_RENDERER}/chat/${rendererChatId}`;
  const ivUrl = buildInstantViewUrl(publicChatUrl, GEMINI_RHASH);

  await editMessage(
    chatId,
    messageId,
    `⚡ <a href="${escapeAttr(ivUrl)}">Instant View</a> | 🔗 <a href="${escapeAttr(publicChatUrl)}">Source</a>`,
    env
  );
}

async function handlePdfCallback(data, chatId, messageId, env) {
  const rendererChatId = data.slice(4).trim();
  if (!CHAT_ID_RE.test(rendererChatId)) {
    await editMessage(chatId, messageId, "❌ شناسه مکالمه نامعتبر است.", env);
    return;
  }

  const publicChatUrl = `${GEMINI_RENDERER}/chat/${rendererChatId}`;

  await editMessage(chatId, messageId, "📄 در حال ساخت PDF...", env);

  try {
    const { pdf, fileName } = await fetchPdf(rendererChatId, env);
    await sendPdf(chatId, fileName, pdf, env);

    await editMessage(
      chatId,
      messageId,
      `✅ فایل PDF آماده و ارسال شد.\n🔗 <a href="${escapeAttr(publicChatUrl)}">Source</a>`,
      env
    );
  } catch (error) {
    console.error("PDF error:", error);
    await editMessage(
      chatId,
      messageId,
      `❌ خطا در ساخت PDF:\n\n${escapeHtml(error.message)}`,
      env
    );
  }
}

function extractFilenameFromHeader(disposition) {
  if (!disposition) return null;

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match && utf8Match[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const regularMatch = disposition.match(/filename="?([^";]+)"?/i);
  if (regularMatch && regularMatch[1]) {
    return regularMatch[1].trim();
  }

  return null;
}

function sanitizeFilename(name, fallbackId) {
  if (!name) return `chat-${fallbackId}.pdf`;
  let clean = name.replace(/[/\\?%*:|"<>]/g, "_").trim();
  if (!clean.toLowerCase().endsWith(".pdf")) {
    clean += ".pdf";
  }
  return clean;
}

async function fetchPdf(rendererChatId, env) {
  const pdfUrl = `${GEMINI_RENDERER}/pdf/${rendererChatId}`;
  const response = await rendererFetch(
    pdfUrl,
    {
      method: "GET",
      headers: { Accept: "application/pdf" },
    },
    env
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PDF server returned ${response.status}: ${errorText}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/pdf")) {
    throw new Error(`Unexpected PDF content-type: ${contentType || "unknown"}`);
  }

  const disposition =
    response.headers.get("content-disposition") ||
    response.headers.get("Content-Disposition");

  const customTitle =
    response.headers.get("x-chat-title") ||
    response.headers.get("x-title");

  let fileName = extractFilenameFromHeader(disposition);
  if (!fileName && customTitle) {
    fileName = `${customTitle}.pdf`;
  }

  fileName = sanitizeFilename(fileName, rendererChatId);
  const pdf = await response.arrayBuffer();

  return { pdf, fileName };
}

async function sendPdf(chatId, fileName, pdf, env) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append(
    "document",
    new Blob([pdf], { type: "application/pdf" }),
    fileName
  );

  const response = await fetch(
    `https://api.telegram.org/bot${env.BOT_TOKEN}/sendDocument`,
    {
      method: "POST",
      body: form,
    }
  );

  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(`Telegram sendDocument failed: ${JSON.stringify(result)}`);
  }
}

/*
 * Telegram API
 */

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, "&quot;");
}

async function answerCallbackQuery(callbackId, env) {
  await telegramRequest(
    "answerCallbackQuery",
    { callback_query_id: callbackId },
    env
  );
}

async function editMessage(chatId, messageId, text, env) {
  await telegramRequest(
    "editMessageText",
    {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    },
    env
  );
}

async function sendMessage(chatId, text, env) {
  return telegramRequest(
    "sendMessage",
    {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    },
    env
  );
}

async function telegramRequest(method, body, env) {
  const response = await fetch(
    `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    throw new Error(`Telegram API ${method} failed: HTTP ${response.status}`);
  }

  const result = await response.json();
  if (!result.ok) {
    throw new Error(`Telegram API ${method} failed: ${JSON.stringify(result)}`);
  }

  return result;
}
