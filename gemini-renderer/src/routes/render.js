import { renderConversationHtml } from "../rendering/conversation.js";

const MAX_BODY_BYTES = 1_000_000;

/*
 * POST /render
 * Authorization: Bearer <RENDER_TOKEN>
 * Body: { title?: string, messages: [{ role: "user"|"assistant", text: string }] }
 *
 * Renders arbitrary text (e.g. a Gemini answer produced by the Telegram bot)
 * with the same renderer as shared Gemini chats and stores it in KV.
 */
export async function handleRender(request, env) {
  if (request.method !== "POST") {
    return new Response("Use POST.", { status: 405 });
  }

  if (!env.RENDER_TOKEN) {
    return Response.json(
      { success: false, error: "RENDER_TOKEN is not configured." },
      { status: 500 }
    );
  }

  if (request.headers.get("Authorization") !== `Bearer ${env.RENDER_TOKEN}`) {
    return Response.json(
      { success: false, error: "Unauthorized." },
      { status: 401 }
    );
  }

  let body;

  try {
    const raw = await request.text();

    if (raw.length > MAX_BODY_BYTES) {
      return Response.json(
        { success: false, error: "Body too large." },
        { status: 413 }
      );
    }

    body = JSON.parse(raw);
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON." },
      { status: 400 }
    );
  }

  const messages = Array.isArray(body?.messages)
    ? body.messages
        .filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.text === "string" &&
            m.text.trim()
        )
        .map((m) => ({ role: m.role, text: m.text, media: [] }))
    : [];

  if (messages.length === 0) {
    return Response.json(
      { success: false, error: "messages must contain at least one text message." },
      { status: 400 }
    );
  }

  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, 200)
      : "Video transcript";

  const chatId = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
  const chatUrl = `${new URL(request.url).origin}/chat/${chatId}`;

  const html = renderConversationHtml({
    title,
    messages,
    media: [],
    sourceUrl: chatUrl,
    canonicalUrl: chatUrl,
  });

  await env.GEMINI_CHATS.put(chatId, html);

  return Response.json({ success: true, chatId, chatUrl, title });
}
