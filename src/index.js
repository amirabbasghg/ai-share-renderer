import { marked } from "marked";
import katex from "katex";

const RPC_ID = "ujx1Bf";
const GEMINI_HOST = "gemini.google.com";

marked.setOptions({
  gfm: true,
  breaks: false,
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /*
     * =========================================
     * GET /image?url=...
     * Proxy Gemini images
     * =========================================
     */

    if (url.pathname === "/image") {
      const imageUrl =
        url.searchParams.get("url");

      if (
        !imageUrl ||
        !/^https?:\/\//i.test(imageUrl)
      ) {
        return new Response(
          "Invalid image URL.",
          { status: 400 }
        );
      }

      try {
        const imageResponse =
          await fetch(imageUrl, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",

              "Referer":
                "https://gemini.google.com/",
            },
          });

        if (!imageResponse.ok) {
          return new Response(
            "Image could not be fetched.",
            {
              status:
                imageResponse.status,
            }
          );
        }

        const headers =
          new Headers();

        headers.set(
          "Content-Type",
          imageResponse.headers.get(
            "Content-Type"
          ) || "image/jpeg"
        );

        headers.set(
          "Cache-Control",
          "public, max-age=86400"
        );

        return new Response(
          imageResponse.body,
          {
            status: 200,
            headers,
          }
        );

      } catch (error) {
        return new Response(
          "Image proxy failed.",
          { status: 502 }
        );
      }
    }

    /*
     * =========================================
     * GET /chat/{id}
     * =========================================
     */

    if (url.pathname.startsWith("/chat/")) {
      const chatId =
        url.pathname
          .slice("/chat/".length)
          .trim();

      if (!chatId) {
        return new Response(
          "Chat ID is required.",
          { status: 400 }
        );
      }

      const html =
        await env.GEMINI_CHATS.get(chatId);

      if (!html) {
        return new Response(
          "Chat not found.",
          { status: 404 }
        );
      }

      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type":
            "text/html; charset=UTF-8",

          "Cache-Control":
            "public, max-age=3600",
        },
      });
    }

    /*
     * =========================================
     * GET /?url=...
     * =========================================
     */

    const targetUrl =
      url.searchParams.get("url");

    if (!targetUrl) {
      return new Response(
        "Use: /?url=https://share.gemini.google/...",
        { status: 400 }
      );
    }

    try {
      /*
       * استخراج مکالمه از Gemini
       */
      const result =
        await extractGemini(targetUrl);

      /*
       * ساخت HTML نهایی
       */
      const html =
        renderConversationHtml(result);

      /*
       * ساخت ID مستقل
       */
      const chatId =
        crypto.randomUUID()
          .replaceAll("-", "")
          .slice(0, 16);

      /*
       * ذخیره در KV
       */
      await env.GEMINI_CHATS.put(
        chatId,
        html
      );

      /*
       * حالت تست HTML
       */
      if (
        url.searchParams.get("format") ===
        "html"
      ) {
        return new Response(html, {
          status: 200,
          headers: {
            "Content-Type":
              "text/html; charset=UTF-8",
          },
        });
      }

      /*
       * لینک عمومی
       */
      const chatUrl =
        `${url.origin}/chat/${chatId}`;

      /*
       * پاسخ JSON
       */
      return Response.json({
        success: true,

        chatId,

        chatUrl,

        sourceUrl:
          result.sourceUrl,

        canonicalUrl:
          result.canonicalUrl,

        shareId:
          result.shareId,

        title:
          result.title,

        messages:
          result.messages,

        media:
          result.media,
      });

    } catch (error) {
      return Response.json(
        {
          success: false,

          error:
            error instanceof Error
              ? error.message
              : String(error),
        },
        { status: 500 }
      );
    }
  },
};


/* =========================================================
   GEMINI EXTRACTION
   ========================================================= */


async function extractGemini(sourceUrl) {
  const { shareId, canonicalUrl } =
    await resolveShareId(sourceUrl);

  const innerRequest = JSON.stringify(
    [null, shareId, [4]]
  );

  const fReq = JSON.stringify([
    [[RPC_ID, innerRequest, null, "generic"]]
  ]);

  const query = new URLSearchParams({
    rpcids: RPC_ID,
    "source-path": `/share/${shareId}`,
    hl: "en-US",
    rt: "c",
  });

  const endpoint =
    `https://${GEMINI_HOST}/_/BardChatUi/data/batchexecute?${query}`;

  const response = await fetch(endpoint, {
    method: "POST",

    headers: {
      "Content-Type":
        "application/x-www-form-urlencoded;charset=UTF-8",

      "Accept":
        "application/json",

      "X-Same-Domain":
        "1",

      "Referer":
        `https://${GEMINI_HOST}/`,

      "User-Agent":
        "ShareXtract/0.23.0 (+https://github.com/wuaishare/sharextract)",
    },

    body: new URLSearchParams({
      "f.req": fReq,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Gemini RPC failed: HTTP ${response.status}`
    );
  }

  const responseText =
    await response.text();

  const payload =
    decodeBatchExecute(responseText);

  const root =
    conversationRoot(payload);

  const conversation =
    extractTurns(root);

  if (
    conversation.messages.length === 0
  ) {
    throw new Error(
      "Gemini public share returned no readable messages."
    );
  }

  const title =
    safeString(nested(root, 2, 1)) ||
    "Gemini shared conversation";

  const returnedShareId =
    safeString(nested(root, 3));

  if (
    returnedShareId &&
    returnedShareId !== shareId
  ) {
    throw new Error(
      "Gemini share response ID did not match the requested share."
    );
  }

  return {
    sourceUrl,
    canonicalUrl,
    shareId,
    title,
    messages:
      conversation.messages,
    turns:
      conversation.turnMetadata,
    media:
      conversation.media,
  };
}


async function resolveShareId(url) {
  const parsed = new URL(url);

  const host =
    parsed.hostname.toLowerCase();

  const parts =
    parsed.pathname
      .split("/")
      .filter(Boolean);

  let shareId;

  if (
    host === GEMINI_HOST &&
    parts.length >= 2 &&
    parts[0] === "share"
  ) {
    shareId = parts[1];

  } else if (
    host === "g.co" &&
    parts.length >= 3 &&
    parts[0] === "gemini" &&
    parts[1] === "share"
  ) {
    shareId = parts[2];

  } else if (
    host === "share.gemini.google"
  ) {

    const response = await fetch(url, {
      redirect: "follow",

      headers: {
        "Accept":
          "text/html",

        "Referer":
          `https://${GEMINI_HOST}/`,
      },
    });

    const resolvedUrl =
      response.url;

    const resolved =
      new URL(resolvedUrl);

    const resolvedParts =
      resolved.pathname
        .split("/")
        .filter(Boolean);

    if (
      resolved.hostname.toLowerCase() !==
        GEMINI_HOST ||
      resolvedParts.length < 2 ||
      resolvedParts[0] !== "share"
    ) {
      throw new Error(
        "Gemini short link did not resolve to a public share page."
      );
    }

    shareId =
      resolvedParts[1];

  } else {
    throw new Error(
      "Unsupported Gemini share URL."
    );
  }

  if (
    !/^[A-Za-z0-9_-]{6,128}$/.test(
      shareId
    )
  ) {
    throw new Error(
      "Gemini share ID is malformed."
    );
  }

  return {
    shareId,

    canonicalUrl:
      `https://${GEMINI_HOST}/share/${shareId}`,
  };
}


/* =========================================================
   GEMINI RPC PARSING
   ========================================================= */


function decodeBatchExecute(text) {
  for (
    const rawLine of text.split(/\r?\n/)
  ) {
    const line =
      rawLine.trim();

    if (
      !line.startsWith("[[")
    ) {
      continue;
    }

    let outer;

    try {
      outer =
        JSON.parse(line);
    } catch {
      continue;
    }

    if (
      !Array.isArray(outer)
    ) {
      continue;
    }

    for (
      const row of outer
    ) {
      if (
        Array.isArray(row) &&
        row.length >= 3 &&
        row[0] === "wrb.fr" &&
        row[1] === RPC_ID &&
        typeof row[2] === "string"
      ) {
        try {
          return JSON.parse(row[2]);
        } catch {
          throw new Error(
            "Gemini share RPC contained invalid nested JSON."
          );
        }
      }
    }
  }

  throw new Error(
    "Gemini share RPC response did not contain the expected payload."
  );
}


function conversationRoot(payload) {
  const root =
    nested(payload, 0);

  if (
    !Array.isArray(root) ||
    root.length < 4
  ) {
    throw new Error(
      "Gemini public share payload shape is unsupported."
    );
  }

  if (
    !Array.isArray(
      nested(root, 1)
    )
  ) {
    throw new Error(
      "Gemini public share payload contained no turns."
    );
  }

  return root;
}


/* =========================================================
   TURNS
   ========================================================= */


function extractTurns(root) {
  const messages = [];
  const turnMetadata = [];
  const media = [];
  const seenMedia = new Set();

  const turns =
    nested(root, 1);

  if (
    !Array.isArray(turns)
  ) {
    return {
      messages,
      turnMetadata,
      media,
    };
  }

  for (
    let turnIndex = 0;
    turnIndex < turns.length;
    turnIndex++
  ) {
    const turn =
      turns[turnIndex];

    if (
      !Array.isArray(turn)
    ) {
      continue;
    }

    const ids =
      nested(turn, 0);

    const conversationId =
      safeString(
        nested(ids, 0)
      );

    const responseId =
      safeString(
        nested(ids, 1)
      );

    const createdAt =
      timestamp(
        nested(turn, 4)
      );

    /*
     * =========================================
     * Media متعلق به همین turn
     * =========================================
     */

    const turnMedia = [];
    const seenTurnMedia = new Set();

    for (
      const item of mediaFromValue(turn)
    ) {
      if (
        !seenTurnMedia.has(item.url)
      ) {
        seenTurnMedia.add(item.url);
        turnMedia.push(item);
      }

      if (
        !seenMedia.has(item.url)
      ) {
        seenMedia.add(item.url);
        media.push(item);
      }
    }

    /*
     * =========================================
     * User
     * =========================================
     */

    const prompt =
      nested(turn, 2);

    const userText =
      joinTextParts(
        nested(prompt, 0)
      );

    if (userText) {
      messages.push({
        role: "user",

        text:
          cleanText(userText),

        createdAt,

        media: [],
      });
    }

    /*
     * =========================================
     * Gemini
     * =========================================
     */

    const response =
      nested(turn, 3);

    const assistantText =
      assistantTextFromResponse(
        response
      );

    if (assistantText) {
      messages.push({
        role: "assistant",

        text:
          cleanText(
            assistantText
          ),

        createdAt,

        /*
         * عکس‌های همین turn
         * داخل خود پیام Gemini قرار می‌گیرند.
         */
        media:
          turnMedia,
      });
    } else if (
      turnMedia.length > 0 &&
      userText
    ) {
      /*
       * اگر پاسخ متنی Gemini نداشت،
       * عکس را به User متصل می‌کنیم.
       */
      const lastMessage =
        messages[messages.length - 1];

      if (
        lastMessage &&
        lastMessage.role === "user"
      ) {
        lastMessage.media =
          turnMedia;
      }
    }

    turnMetadata.push({
      index: turnIndex,

      conversationId,

      responseId,

      createdAt,

      media:
        turnMedia,
    });
  }

  return {
    messages,
    turnMetadata,
    media,
  };
}


function assistantTextFromResponse(
  response
) {
  const candidates =
    nested(response, 0);

  if (
    !Array.isArray(candidates)
  ) {
    return "";
  }

  for (
    const candidate of candidates
  ) {
    if (
      !Array.isArray(candidate)
    ) {
      continue;
    }

    const parts =
      nested(candidate, 1);

    const value =
      joinTextParts(parts);

    if (value) {
      return value;
    }
  }

  return "";
}


function joinTextParts(value) {
  if (
    typeof value === "string"
  ) {
    return value.trim();
  }

  if (
    !Array.isArray(value)
  ) {
    return "";
  }

  const parts = [];

  for (
    const item of value
  ) {
    if (
      typeof item === "string" &&
      item.trim()
    ) {
      parts.push(
        item.trim()
      );
    }
  }

  return parts.join("\n\n");
}


function cleanText(value) {
  return value
    .replace(/\u200b/g, "")
    .trim();
}


function timestamp(value) {
  if (
    !Array.isArray(value) ||
    value.length === 0
  ) {
    return null;
  }

  const seconds =
    value[0];

  const nanos =
    value.length > 1
      ? value[1]
      : 0;

  if (
    typeof seconds !== "number"
  ) {
    return null;
  }

  const milliseconds =
    seconds * 1000 +
    (
      typeof nanos === "number"
        ? nanos / 1_000_000
        : 0
    );

  try {
    return new Date(
      milliseconds
    ).toISOString();
  } catch {
    return null;
  }
}


function mediaFromValue(value) {
  const found = [];

  function visit(node) {
    if (
      Array.isArray(node)
    ) {
      for (
        const child of node
      ) {
        visit(child);
      }

      return;
    }

    if (
      node !== null &&
      typeof node === "object"
    ) {
      for (
        const child of Object.values(node)
      ) {
        visit(child);
      }

      return;
    }

    if (
      typeof node !== "string" ||
      !node.startsWith("http")
    ) {
      return;
    }

    const lowered =
      node.toLowerCase();

    if (
      lowered.includes(
        "googleusercontent.com"
      ) ||
      /\.(png|jpe?g|webp|gif)([?#]|$)/i.test(
        node
      )
    ) {
      found.push({
        type: "image",
        url: node,
      });

    } else if (
      /\.(mp4|webm)([?#]|$)/i.test(node)
    ) {
      found.push({
        type: "video",
        url: node,
      });
    }
  }

  visit(value);

  return found;
}


function safeString(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}


function nested(value, ...indexes) {
  let current = value;

  for (
    const index of indexes
  ) {
    if (
      !Array.isArray(current) ||
      index < 0 ||
      index >= current.length
    ) {
      return null;
    }

    current =
      current[index];
  }

  return current;
}


/* =========================================================
   HTML RENDERING
   ========================================================= */


function renderConversationHtml(result) {
  const title =
    escapeHtml(result.title);

  const sourceUrl =
    escapeAttribute(result.sourceUrl);

  const canonicalUrl =
    escapeAttribute(result.canonicalUrl);

  const messagesHtml =
    result.messages
      .map((message) =>
        renderMessage(message)
      )
      .join("\n");

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>

  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <title>${title}</title>

  <meta
    name="description"
    content="${escapeAttribute(
      createDescription(result)
    )}"
  >

  <meta
    property="og:title"
    content="${title}"
  >

  <meta
    property="og:type"
    content="article"
  >

  <meta
    property="og:url"
    content="${canonicalUrl}"
  >

  <style>

    * {
      box-sizing: border-box;
    }

    html {
      background: #ffffff;
    }

    body {
      margin: 0;
      padding: 0;

      background: #ffffff;

      color: #202124;

      font-family:
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;

      line-height: 1.8;
    }

    article {
      width: min(900px, 100%);

      margin: 0 auto;

      padding:
        32px 20px 60px;
    }

    header {
      margin-bottom: 36px;

      padding-bottom: 20px;

      border-bottom:
        1px solid #e5e7eb;
    }

    h1 {
      margin:
        0 0 10px;

      font-size: 2rem;

      line-height: 1.4;
    }

    .source {
      font-size: 0.85rem;

      color: #6b7280;

      direction: ltr;

      text-align: left;

      overflow-wrap: anywhere;
    }


    /*
     * =========================================
     * Conversation messages
     * =========================================
     */

    .message {
      position: relative;

      margin: 34px 0;

      padding: 0;

      overflow: visible;
    }

    .message-label {
      display: inline-flex;

      align-items: center;

      margin-bottom: 0;

      padding:
        6px 13px;

      border-radius: 999px;

      font-size: 0.82rem;

      font-weight: 800;

      line-height: 1.4;

      position: relative;

      z-index: 2;
    }

    .message-content {
      margin-top: -1px;

      padding:
        22px 22px 20px;

      border-radius: 14px;

      overflow-wrap: anywhere;

      line-height: 1.9;
    }


    /*
     * =========================================
     * USER
     * =========================================
     */

    .message.user {
      padding-right: 10px;

      border-right:
        5px solid #3b82f6;
    }

    .message.user .message-label {
      color: #ffffff;

      background: #2563eb;

      box-shadow:
        0 2px 6px
        rgba(37, 99, 235, 0.18);
    }

    .message.user .message-content {
      background: #eff6ff;

      border:
        1px solid #bfdbfe;

      border-radius:
        0 14px 14px 14px;
    }


    /*
     * =========================================
     * GEMINI
     * =========================================
     */

    .message.assistant {
      padding-right: 10px;

      border-right:
        5px solid #16a34a;
    }

    .message.assistant .message-label {
      color: #ffffff;

      background: #16a34a;

      box-shadow:
        0 2px 6px
        rgba(22, 163, 74, 0.18);
    }

    .message.assistant .message-content {
      background: #f0fdf4;

      border:
        1px solid #bbf7d0;

      border-radius:
        0 14px 14px 14px;
    }


    /*
     * =========================================
     * Content
     * =========================================
     */

    .message-content > :first-child {
      margin-top: 0;
    }

    .message-content > :last-child {
      margin-bottom: 0;
    }

    h2,
    h3,
    h4 {
      line-height: 1.5;

      margin-top: 1.5em;
    }

    p {
      margin:
        0 0 1em;
    }

    ul,
    ol {
      padding-right: 1.7em;

      margin-top: 0.6em;

      margin-bottom: 1em;
    }

    blockquote {
      margin:
        1em 0;

      padding:
        8px 16px;

      border-right:
        4px solid #d1d5db;

      color: #4b5563;
    }

    code {
      direction: ltr;

      unicode-bidi: embed;

      font-family:
        "Cascadia Code",
        "Fira Code",
        Consolas,
        monospace;

      background: #f3f4f6;

      padding:
        2px 5px;

      border-radius: 5px;

      font-size: 0.9em;
    }

    pre {
      direction: ltr;

      text-align: left;

      overflow-x: auto;

      padding: 16px;

      margin:
        18px 0;

      background: #f6f8fa;

      border-radius: 10px;

      line-height: 1.55;
    }

    pre code {
      background: transparent;

      padding: 0;

      border-radius: 0;

      font-size: 0.88rem;
    }

    table {
      width: 100%;

      border-collapse: collapse;

      margin: 20px 0;

      overflow-x: auto;

      display: block;
    }

    th,
    td {
      border:
        1px solid #d1d5db;

      padding:
        8px 12px;

      text-align: right;

      vertical-align: top;
    }

    th {
      background: #f3f4f6;

      font-weight: 700;
    }

    a {
      color: #2563eb;

      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }


    /*
     * =========================================
     * Images
     * =========================================
     */

    .media {
      display: block;

      margin:
        24px 0 6px;

      padding: 10px;

      text-align: center;

      background: #ffffff;

      border:
        1px solid #e5e7eb;

      border-radius: 14px;
    }

    .media-image {
      display: block;

      width: auto;

      max-width: 100%;

      height: auto;

      margin: 0 auto;

      border-radius: 10px;
    }

    .media-video {
      display: block;

      width: 100%;

      max-width: 100%;

      height: auto;

      margin: 0 auto;

      border-radius: 10px;
    }

    .message-content img {
      display: block;

      max-width: 100%;

      height: auto;

      margin:
        20px auto;

      border-radius: 10px;
    }


    /*
     * =========================================
     * Math / KaTeX
     * =========================================
     */

    .math-display {
      direction: ltr;

      text-align: center;

      overflow-x: auto;

      overflow-y: hidden;

      margin: 1.4em 0;

      padding:
        0.4em 0;
    }

    .math-inline {
      direction: ltr;

      unicode-bidi: isolate;

      white-space: nowrap;
    }

    .katex {
      font-size: 1.05em;
    }

    .katex-display {
      margin: 0;

      overflow-x: auto;

      overflow-y: hidden;

      padding:
        4px 0;
    }

  </style>

</head>

<body>

<article>

  <header>

    <h1>${title}</h1>

    <div class="source">

      <a
        href="${sourceUrl}"
        rel="nofollow"
      >
        Gemini shared conversation
      </a>

    </div>

  </header>

  <main>

    ${messagesHtml}

  </main>

</article>

</body>

</html>`;
}


/* =========================================================
   MESSAGE RENDERING
   ========================================================= */


function renderMessage(message) {
  const isUser =
    message.role === "user";

  const label =
    isUser
      ? "👤 User"
      : "🤖 Gemini";

  const className =
    isUser
      ? "user"
      : "assistant";

  /*
   * Markdown + LaTeX
   */
  const prepared =
    prepareMarkdown(message.text);

  const html =
    marked.parse(
      prepared.markdown
    );

  const withMath =
    restoreMath(
      html,
      prepared.math
    );

  const safeHtml =
    sanitizeGeneratedHtml(
      withMath
    );

  /*
   * Media متعلق به همین پیام
   */
  const mediaHtml =
    renderMedia(message.media);

  return `
<section class="message ${className}">

  <div class="message-label">
    ${label}
  </div>

  <div class="message-content">

    ${safeHtml}

    ${mediaHtml}

  </div>

</section>`;
}


/* =========================================================
   MEDIA RENDERING
   ========================================================= */


function renderMedia(media) {
  if (
    !Array.isArray(media) ||
    media.length === 0
  ) {
    return "";
  }

  const unique = [];
  const seen = new Set();

  for (const item of media) {
    if (
      !item ||
      typeof item.url !== "string"
    ) {
      continue;
    }

    if (
      !/^https?:\/\//i.test(item.url)
    ) {
      continue;
    }

    if (
      seen.has(item.url)
    ) {
      continue;
    }

    seen.add(item.url);

    unique.push(item);
  }

  if (unique.length === 0) {
    return "";
  }

  return unique
    .map((item) => {
      if (
        item.type === "image"
      ) {
        const proxyUrl =
          `/image?url=${encodeURIComponent(
            item.url
          )}`;

        return `
<div class="media">

  <img
    class="media-image"
    src="${escapeAttribute(proxyUrl)}"
    alt="Gemini image"
    loading="lazy"
  >

</div>`;
      }

      if (
        item.type === "video"
      ) {
        return `
<div class="media">

  <video
    class="media-video"
    controls
    preload="metadata"
    src="${escapeAttribute(
      item.url
    )}"
  ></video>

</div>`;
      }

      return "";
    })
    .join("\n");
}


/* =========================================================
   MARKDOWN + LATEX
   ========================================================= */


function prepareMarkdown(markdown) {
  const codeBlocks = [];
  const math = [];

  /*
   * =========================================
   * Protect code blocks
   * =========================================
   */

  let protectedMarkdown =
    markdown.replace(
      /```[\s\S]*?```/g,
      (block) => {
        const token =
          `CODEBLOCKTOKEN${codeBlocks.length}X`;

        codeBlocks.push({
          token,
          block,
        });

        return token;
      }
    );


  /*
   * =========================================
   * Display math: $$ ... $$
   * =========================================
   */

  protectedMarkdown =
    protectedMarkdown.replace(
      /\$\$([\s\S]*?)\$\$/g,
      (_, expression) => {
        const token =
          `MATHDISPLAYTOKEN${math.length}X`;

        math.push({
          token,

          expression:
            expression.trim(),

          display: true,
        });

        return `\n\n${token}\n\n`;
      }
    );


  /*
   * =========================================
   * Display math: \[ ... \]
   * =========================================
   */

  protectedMarkdown =
    protectedMarkdown.replace(
      /\\\[([\s\S]*?)\\\]/g,
      (_, expression) => {
        const token =
          `MATHDISPLAYTOKEN${math.length}X`;

        math.push({
          token,

          expression:
            expression.trim(),

          display: true,
        });

        return `\n\n${token}\n\n`;
      }
    );


  /*
   * =========================================
   * Inline math: \( ... \)
   * =========================================
   */

  protectedMarkdown =
    protectedMarkdown.replace(
      /\\\(([\s\S]*?)\\\)/g,
      (_, expression) => {
        const token =
          `MATHINLINETOKEN${math.length}X`;

        math.push({
          token,

          expression:
            expression.trim(),

          display: false,
        });

        return token;
      }
    );


  /*
   * =========================================
   * Inline math: $ ... $
   * =========================================
   */

  protectedMarkdown =
    protectedMarkdown.replace(
      /(?<!\$)\$([^\$\n]+?)\$(?!\$)/g,
      (_, expression) => {
        const token =
          `MATHINLINETOKEN${math.length}X`;

        math.push({
          token,

          expression:
            expression.trim(),

          display: false,
        });

        return token;
      }
    );


  /*
   * =========================================
   * Implicit math:
   *
   * e_1
   * x_2
   * A_1
   * B_12
   *
   * بدون نیاز به $...$
   *
   * این قسمت بعد از محافظت از code blockها
   * اجرا می‌شود.
   * =========================================
   */

  protectedMarkdown =
    protectedMarkdown.replace(
      /(?<![A-Za-z0-9\\])([A-Za-z])_([A-Za-z0-9]+)(?![A-Za-z0-9])/g,
      (_, base, subscript) => {
        const token =
          `MATHINLINETOKEN${math.length}X`;

        math.push({
          token,

          expression:
            `${base}_{${subscript}}`,

          display: false,
        });

        return token;
      }
    );


  /*
   * =========================================
   * حذف componentهای Gemini
   * =========================================
   */

  protectedMarkdown =
    protectedMarkdown.replace(
      /<ElicitationsGroup\b[^>]*>[\s\S]*?<\/ElicitationsGroup>/gi,
      ""
    );

  protectedMarkdown =
    protectedMarkdown.replace(
      /<Elicitation\b[^>]*\/?>/gi,
      ""
    );


  /*
   * =========================================
   * حذف HTML خام
   * =========================================
   */

  protectedMarkdown =
    protectedMarkdown.replace(
      /<\/?[a-zA-Z][^>]*>/g,
      ""
    );


  /*
   * =========================================
   * Restore code blocks
   *
   * این کار عمداً بعد از implicit math انجام
   * می‌شود تا e_1 داخل code block تبدیل نشود.
   * =========================================
   */

  for (
    const item of codeBlocks
  ) {
    protectedMarkdown =
      protectedMarkdown.replace(
        item.token,
        item.block
      );
  }

  return {
    markdown:
      protectedMarkdown.trim(),

    math,
  };
}


/*
 * =========================================
 * KaTeX
 * =========================================
 */

function restoreMath(
  html,
  mathItems
) {
  let result = html;

  for (
    const item of mathItems
  ) {
    let rendered;

    try {
      rendered =
        katex.renderToString(
          item.expression,
          {
            displayMode:
              item.display,

            throwOnError:
              false,

            strict:
              false,

            output:
              "html",
          }
        );

    } catch {
      rendered =
        `<code class="${
          item.display
            ? "math-display"
            : "math-inline"
        }">${escapeHtml(
          item.expression
        )}</code>`;
    }

    const wrapped =
      item.display
        ? `<div class="math-display">${rendered}</div>`
        : `<span class="math-inline">${rendered}</span>`;

    result =
      result.replaceAll(
        item.token,
        wrapped
      );
  }

  return result;
}


/* =========================================================
   HTML SANITIZATION
   ========================================================= */


function sanitizeGeneratedHtml(html) {
  return html

    /*
     * =========================================
     * لینک‌ها
     * =========================================
     */

    .replace(
      /href\s*=\s*["']([^"']*)["']/gi,
      (full, href) => {

        if (
          /^https?:\/\//i.test(href) ||
          /^mailto:/i.test(href) ||
          href.startsWith("#")
        ) {
          return `href="${escapeAttribute(
            href
          )}"`;
        }

        return 'href="#"';
      }
    )

    /*
     * =========================================
     * تصاویر
     * =========================================
     */

    .replace(
      /src\s*=\s*["']([^"']*)["']/gi,
      (full, src) => {

        /*
         * اگر قبلاً proxy خودمان است،
         * دوباره proxy نکن.
         */

        if (
          /^\/image\?url=/i.test(src)
        ) {
          return `src="${escapeAttribute(
            src
          )}"`;
        }

        /*
         * URL داخلی معتبر
         */

        if (
          src.startsWith("/")
        ) {
          return `src="${escapeAttribute(
            src
          )}"`;
        }

        /*
         * فقط URLهای http/https
         */

        if (
          !/^https?:\/\//i.test(src)
        ) {
          return 'src=""';
        }

        /*
         * Proxy کردن تصویر خارجی
         */

        const proxyUrl =
          `/image?url=${encodeURIComponent(
            src
          )}`;

        return `src="${escapeAttribute(
          proxyUrl
        )}"`;
      }
    );
}


/* =========================================================
   DESCRIPTION
   ========================================================= */


function createDescription(result) {
  const firstAssistant =
    result.messages.find(
      (message) =>
        message.role === "assistant"
    );

  if (!firstAssistant) {
    return result.title;
  }

  return firstAssistant.text
    .replace(/\s+/g, " ")
    .replace(/[`*_#]/g, "")
    .replace(/\$\$?[\s\S]*?\$\$?/g, "")
    .slice(0, 250);
}


/* =========================================================
   ESCAPING
   ========================================================= */


function escapeHtml(value) {
  return String(value)
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}


function escapeAttribute(value) {
  return escapeHtml(value);
}