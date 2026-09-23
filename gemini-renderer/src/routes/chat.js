export async function handleChat(url, env) {
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
