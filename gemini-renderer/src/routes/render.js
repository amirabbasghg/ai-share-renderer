import { renderConversationHtml } from "../rendering/conversation.js";

function timingSafeStringEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  const encoder = new TextEncoder();
  const bytesA = encoder.encode(a);
  const bytesB = encoder.encode(b);
  const maxLen = Math.max(bytesA.length, bytesB.length);
  let diff = bytesA.length ^ bytesB.length;
  for (let i = 0; i < maxLen; i++) {
    diff |= (bytesA[i] || 0) ^ (bytesB[i] || 0);
  }
  return diff === 0;
}

function normalizeMessages(body) {
  const messages = [];

  if (Array.isArray(body?.turns) && body.turns.length > 0) {
    for (const turn of body.turns) {
      if (!turn || typeof turn !== "object") continue;
      const rawRole = String(turn.role || "").toLowerCase();
      const role = rawRole === "user" ? "user" : "assistant";
      const text = typeof turn.text === "string" ? turn.text.trim() : "";
      const media = Array.isArray(turn.media) ? turn.media : [];
      if (text || media.length > 0) {
        messages.push({ role, text, media });
      }
    }
    return messages;
  }

  if (Array.isArray(body?.messages) && body.messages.length > 0) {
    for (const msg of body.messages) {
      if (!msg || typeof msg !== "object") continue;
      const rawRole = String(msg.role || "").toLowerCase();
      const role = rawRole === "user" ? "user" : "assistant";
      const text = typeof msg.text === "string" ? msg.text.trim() : "";
      const media = Array.isArray(msg.media) ? msg.media : [];
      if (text || media.length > 0) {
        messages.push({ role, text, media });
      }
    }
    return messages;
  }

  if (typeof body?.prompt === "string" && body.prompt.trim()) {
    messages.push({ role: "user", text: body.prompt.trim(), media: [] });
  }
  if (typeof body?.markdown === "string" && body.markdown.trim()) {
    messages.push({ role: "assistant", text: body.markdown.trim(), media: [] });
  }

  return messages;
}

export async function handleRender(request, url, env) {
  if (request.method !== "POST") {
    return Response.json(
      { success: false, error: "Method not allowed" },
      { status: 405 }
    );
  }

  const expectedToken = env?.RENDER_TOKEN;
  if (!expectedToken || typeof expectedToken !== "string") {
    return Response.json(
      { success: false, error: "RENDER_TOKEN is not configured on the renderer." },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !timingSafeStringEqual(match[1].trim(), expectedToken)) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const messages = normalizeMessages(body);
  if (messages.length === 0) {
    return Response.json(
      { success: false, error: "At least one turn or markdown message is required." },
      { status: 400 }
    );
  }

  const title =
    (typeof body?.title === "string" && body.title.trim()) ||
    "Rendered Conversation";

  const platform =
    body?.platform === "chatgpt" ? "chatgpt" : "gemini";

  const sourceUrl =
    typeof body?.sourceUrl === "string" && /^https?:\/\//i.test(body.sourceUrl)
      ? body.sourceUrl
      : url.origin;

  const html = renderConversationHtml({
    platform,
    title,
    sourceUrl,
    canonicalUrl: sourceUrl,
    messages,
  });

  const chatId = crypto
    .randomUUID()
    .replaceAll("-", "")
    .slice(0, 16);

  await env.GEMINI_CHATS.put(chatId, html);

  const chatUrl = `${url.origin}/chat/${chatId}`;
  const pdfUrl = `${url.origin}/pdf/${chatId}`;

  return Response.json({
    success: true,
    platform,
    chatId,
    chatUrl,
    pdfUrl,
    title,
  });
}
