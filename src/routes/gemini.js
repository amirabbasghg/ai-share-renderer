import { extractGemini } from "../gemini/extract.js";
import { renderConversationHtml } from "../rendering/conversation.js";


export async function handleGemini(url, env) {
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
}
