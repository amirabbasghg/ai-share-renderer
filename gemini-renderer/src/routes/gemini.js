import { extractGemini } from "../gemini/extract.js";
import { extractChatGpt } from "../chatgpt/extract.js";
import { isChatGptShareUrl } from "../chatgpt/resolveShare.js";
import { renderConversationHtml } from "../rendering/conversation.js";


export async function handleGemini(url, env) {
  const targetUrl =
    url.searchParams.get("url");

  if (!targetUrl) {
    return new Response(
      "Use: /?url=https://share.gemini.google/... or https://chatgpt.com/share/...",
      { status: 400 }
    );
  }

  try {
    /*
     * تشخیص پلتفرم و استخراج مکالمه (ChatGPT یا Gemini)
     */
    const result = isChatGptShareUrl(targetUrl)
      ? await extractChatGpt(targetUrl, env)
      : {
          platform: "gemini",
          ...(await extractGemini(targetUrl, env)),
        };

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

    const format =
      url.searchParams.get("format");

    /*
     * حالت Instant View / HTML مستقیم
     */
    if (format === "html") {
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type":
            "text/html; charset=UTF-8",
        },
      });
    }

    /*
     * حالت PDF (ریدایرکت به مسیر /pdf/{id})
     */
    if (format === "pdf") {
      return new Response(null, {
        status: 302,
        headers: {
          Location: `/pdf/${chatId}`,
        },
      });
    }

    /*
     * لینک‌های عمومی
     */
    const chatUrl =
      `${url.origin}/chat/${chatId}`;

    const pdfUrl =
      `${url.origin}/pdf/${chatId}`;

    /*
     * پاسخ JSON
     */
    return Response.json({
      success: true,

      platform:
        result.platform || "gemini",

      chatId,

      chatUrl,

      pdfUrl,

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
}
