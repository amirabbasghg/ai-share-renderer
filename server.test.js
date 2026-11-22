import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createAppServer } from "./server.js";

async function startTestServer(options = {}) {
  const { server, env } = createAppServer(options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    server,
    env,
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

test("GET / returns HTML landing page for browsers and 400 usage text for API clients", async () => {
  const app = await startTestServer();
  try {
    const htmlRes = await fetch(`${app.baseUrl}/`, {
      headers: { Accept: "text/html" },
    });
    assert.equal(htmlRes.status, 200);
    const html = await htmlRes.text();
    assert.ok(html.includes("<title>Gemini &amp; ChatGPT Share Renderer</title>"));
    assert.ok(html.includes('name="url"'));
    assert.ok(html.includes("/chat/demo"));
    assert.ok(html.includes("/chat/demo-chatgpt"));

    const apiRes = await fetch(`${app.baseUrl}/`, {
      headers: { Accept: "application/json" },
    });
    assert.equal(apiRes.status, 400);
    const text = await apiRes.text();
    assert.ok(text.includes("Use: /?url="));
  } finally {
    await app.close();
  }
});

test("GET /chat/demo and /chat/demo-chatgpt serve seeded RTL conversations and missing returns 404", async () => {
  const app = await startTestServer();
  try {
    const res = await fetch(`${app.baseUrl}/chat/demo`);
    assert.equal(res.status, 200);
    assert.ok((res.headers.get("content-type") || "").includes("text/html"));
    const html = await res.text();
    assert.ok(html.includes('dir="rtl"'));
    assert.ok(html.includes("Vazirmatn"));
    assert.ok(html.includes("math-display"));
    assert.ok(html.includes("solveQuadratic"));

    const gptRes = await fetch(`${app.baseUrl}/chat/demo-chatgpt`);
    assert.equal(gptRes.status, 200);
    const gptHtml = await gptRes.text();
    assert.ok(gptHtml.includes("🤖 ChatGPT"));
    assert.ok(gptHtml.includes("ChatGPT shared conversation"));

    const missing = await fetch(`${app.baseUrl}/chat/does-not-exist`);
    assert.equal(missing.status, 404);
  } finally {
    await app.close();
  }
});

test("GET /pdf/demo supports ?format=html, browser print toolbar, and 501 for binary PDF API clients", async () => {
  const app = await startTestServer();
  try {
    const htmlRes = await fetch(`${app.baseUrl}/pdf/demo?format=html`);
    assert.equal(htmlRes.status, 200);
    const html = await htmlRes.text();
    assert.ok(html.includes("<math"));
    assert.ok(html.includes("pdf-math-display"));
    assert.ok(html.includes("<base href="));

    const browserPdfRes = await fetch(`${app.baseUrl}/pdf/demo-chatgpt`, {
      headers: { Accept: "text/html" },
    });
    assert.equal(browserPdfRes.status, 200);
    const browserPdfHtml = await browserPdfRes.text();
    assert.ok(browserPdfHtml.includes("Print / Save as PDF"));
    assert.ok(browserPdfHtml.includes("<math"));

    const binaryRes = await fetch(`${app.baseUrl}/pdf/demo`, {
      headers: { Accept: "application/pdf" },
    });
    assert.equal(binaryRes.status, 501);
  } finally {
    await app.close();
  }
});

test("GET /image validates URLs, blocks local/private hosts, and returns 1x1 PNG fallback for placeholders", async () => {
  const app = await startTestServer();
  try {
    const invalidRes = await fetch(`${app.baseUrl}/image?url=not-a-url`);
    assert.equal(invalidRes.status, 400);

    const loopbackRes = await fetch(
      `${app.baseUrl}/image?url=${encodeURIComponent("http://127.0.0.1:3000/health")}`
    );
    assert.equal(loopbackRes.status, 400);

    const metadataRes = await fetch(
      `${app.baseUrl}/image?url=${encodeURIComponent("http://169.254.169.254/latest/meta-data/")}`
    );
    assert.equal(metadataRes.status, 400);

    const placeholderRes = await fetch(
      `${app.baseUrl}/image?url=${encodeURIComponent("http://googleusercontent.com/lmdx_image/12345")}`
    );
    assert.equal(placeholderRes.status, 200);
    assert.equal(placeholderRes.headers.get("content-type"), "image/png");
    const bytes = new Uint8Array(await placeholderRes.arrayBuffer());
    assert.equal(bytes[0], 0x89);
    assert.equal(bytes[1], 0x50);
    assert.equal(bytes[2], 0x4e);
    assert.equal(bytes[3], 0x47);
  } finally {
    await app.close();
  }
});

test("POST /api/gemini-rpc validates HTTP method and shareId", async () => {
  const app = await startTestServer();
  try {
    const getRes = await fetch(`${app.baseUrl}/api/gemini-rpc`);
    assert.equal(getRes.status, 405);

    const badRes = await fetch(`${app.baseUrl}/api/gemini-rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareId: "bad" }),
    });
    assert.equal(badRes.status, 400);
    const payload = await badRes.json();
    assert.equal(payload.success, false);
  } finally {
    await app.close();
  }
});

test("GET /?url=... extracts Gemini conversation via RPC proxy, stores HTML in KV, and serves it at chatUrl", async () => {
  const shareId = "abc123XYZ789";
  const mockRpcServer = http.createServer((req, res) => {
    const nestedConversation = [
      [
        null,
        [
          [
            ["conv1", "resp1"],
            null,
            [["Hello Gemini!"]],
            [[[null, ["Hello! Here is $E = mc^2$."]]]],
            [1700000000, 0],
          ],
        ],
        [null, "Mocked Gemini Share"],
        shareId,
      ],
    ];
    const outer = [["wrb.fr", "ujx1Bf", JSON.stringify(nestedConversation)]];
    const body = `)]}'\n\n${JSON.stringify(outer)}\n`;

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: true, status: 200, location: null, body }));
  });

  await new Promise((resolve) => mockRpcServer.listen(0, "127.0.0.1", resolve));
  const rpcPort = mockRpcServer.address().port;

  const app = await startTestServer({
    rpcProxyUrl: `http://127.0.0.1:${rpcPort}/api/gemini-rpc`,
  });

  try {
    const res = await fetch(
      `${app.baseUrl}/?url=${encodeURIComponent(`https://gemini.google.com/share/${shareId}`)}`
    );
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.platform, "gemini");
    assert.equal(json.shareId, shareId);
    assert.equal(json.title, "Mocked Gemini Share");
    assert.equal(json.messages.length, 2);
    assert.ok(json.chatUrl.startsWith(`${app.baseUrl}/chat/`));
    assert.ok(json.pdfUrl.startsWith(`${app.baseUrl}/pdf/`));

    const storedRes = await fetch(json.chatUrl);
    assert.equal(storedRes.status, 200);
    const storedHtml = await storedRes.text();
    assert.ok(storedHtml.includes("Mocked Gemini Share"));
    assert.ok(storedHtml.includes("Hello Gemini!"));
  } finally {
    await app.close();
    await new Promise((resolve) => mockRpcServer.close(resolve));
  }
});

test("GET /?url=https://chatgpt.com/share/... extracts ChatGPT conversation for Instant View and PDF", async () => {
  const shareId = "6b02f5a6-8cc8-83ed-b0d4-83f4b7662d81";
  const mockFetch = async () =>
    new Response(
      JSON.stringify({
        title: "گفتگوی تست چت‌جی‌پی‌تی",
        linear_conversation: [
          {
            message: {
              author: { role: "user" },
              recipient: "all",
              content: { content_type: "text", parts: ["سلام چت‌جی‌پی‌تی"] },
              create_time: 1700000010,
            },
          },
          {
            message: {
              author: { role: "assistant" },
              recipient: "all",
              content: {
                content_type: "text",
                parts: ["سلام! فرمول: $a^2 + b^2 = c^2$ \ue200cite\ue202turn0search0\ue201"],
              },
              create_time: 1700000012,
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  const app = await startTestServer({ fetchImpl: mockFetch });

  try {
    const shareUrl = `https://chatgpt.com/share/${shareId}`;
    const res = await fetch(
      `${app.baseUrl}/?url=${encodeURIComponent(shareUrl)}`
    );
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.platform, "chatgpt");
    assert.equal(json.shareId, shareId);
    assert.equal(json.title, "گفتگوی تست چت‌جی‌پی‌تی");
    assert.equal(json.messages.length, 2);
    assert.ok(!json.messages[1].text.includes("\ue200"));

    const chatRes = await fetch(json.chatUrl);
    assert.equal(chatRes.status, 200);
    const chatHtml = await chatRes.text();
    assert.ok(chatHtml.includes("🤖 ChatGPT"));
    assert.ok(chatHtml.includes("گفتگوی تست چت‌جی‌پی‌تی"));

    const pdfRedirectRes = await fetch(
      `${app.baseUrl}/?url=${encodeURIComponent(shareUrl)}&format=pdf`,
      { redirect: "manual" }
    );
    assert.equal(pdfRedirectRes.status, 302);
    assert.ok((pdfRedirectRes.headers.get("location") || "").startsWith("/pdf/"));
  } finally {
    await app.close();
  }
});

test("POST /render enforces Bearer RENDER_TOKEN and stores rendered turns", async () => {
  const noTokenApp = await startTestServer({ renderToken: "" });
  try {
    const res = await fetch(`${noTokenApp.baseUrl}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test", turns: [{ role: "user", text: "Hi" }] }),
    });
    assert.equal(res.status, 503);
  } finally {
    await noTokenApp.close();
  }

  const app = await startTestServer({ renderToken: "secret-test-token" });
  try {
    const unauth = await fetch(`${app.baseUrl}/render`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer wrong-token",
      },
      body: JSON.stringify({ title: "Test", turns: [{ role: "user", text: "Hi" }] }),
    });
    assert.equal(unauth.status, 401);

    const okRes = await fetch(`${app.baseUrl}/render`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-test-token",
      },
      body: JSON.stringify({
        title: "ترجمه جمله‌به‌جمله ویدیو",
        turns: [
          { role: "user", text: "ترجمه کن" },
          { role: "model", text: "**Hello world**\n\nسلام دنیا" },
        ],
      }),
    });
    assert.equal(okRes.status, 200);
    const json = await okRes.json();
    assert.equal(json.success, true);
    assert.ok(json.chatUrl.startsWith(`${app.baseUrl}/chat/`));

    const htmlRes = await fetch(json.chatUrl);
    assert.equal(htmlRes.status, 200);
    const html = await htmlRes.text();
    assert.ok(html.includes("ترجمه جمله‌به‌جمله ویدیو"));
    assert.ok(html.includes("Hello world"));
  } finally {
    await app.close();
  }
});

test("Telegram bot worker handles ChatGPT share URL inside text and iv:/pdf: callbacks", async () => {
  const { default: botWorker } = await import("./telegram-bot/src/index.js");

  const telegramCalls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const urlStr = String(url);
    if (urlStr.startsWith("https://api.telegram.org/botTEST_TOKEN/")) {
      const method = urlStr.split("/").pop();
      const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : null;
      telegramCalls.push({ method, body });
      return new Response(
        JSON.stringify({ ok: true, result: { message_id: 99 } }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return originalFetch(url, init);
  };

  try {
    const fakeEnv = {
      BOT_TOKEN: "TEST_TOKEN",
      GEMINI_RENDERER: {
        async fetch(url) {
          const parsed = new URL(url);
          if (parsed.pathname === "/") {
            const target = parsed.searchParams.get("url");
            assert.equal(
              target,
              "https://chatgpt.com/share/6b02f5a6-8cc8-83ed-b0d4-83f4b7662d81"
            );
            return Response.json({
              success: true,
              platform: "chatgpt",
              title: "ساخت بات پیش‌نمایش",
              chatId: "abcd1234efgh5678",
              chatUrl: "https://gemini-renderer.hsynysydamyrbas.workers.dev/chat/abcd1234efgh5678",
            });
          }
          return new Response("Not Found", { status: 404 });
        },
      },
    };

    const req = new Request("https://bot.example.com/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          chat: { id: 12345 },
          text: "ببین اینو تبدیل کن https://chatgpt.com/share/6b02f5a6-8cc8-83ed-b0d4-83f4b7662d81.",
        },
      }),
    });

    const res = await botWorker.fetch(req, fakeEnv);
    assert.equal(res.status, 200);
    assert.equal(telegramCalls.length, 2);
    assert.equal(telegramCalls[0].method, "sendMessage");
    assert.ok(telegramCalls[0].body.text.includes("ChatGPT"));
    assert.equal(telegramCalls[1].method, "editMessageText");
    assert.ok(telegramCalls[1].body.text.includes("ساخت بات پیش‌نمایش"));
    assert.equal(
      telegramCalls[1].body.reply_markup.inline_keyboard[0][0].callback_data,
      "pdf:abcd1234efgh5678"
    );
    assert.equal(
      telegramCalls[1].body.reply_markup.inline_keyboard[0][1].callback_data,
      "iv:abcd1234efgh5678"
    );

    // Test invalid callback_data guard
    telegramCalls.length = 0;
    const badCbReq = new Request("https://bot.example.com/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query: {
          id: "cb1",
          data: "pdf:../../etc/passwd",
          message: { chat: { id: 12345 }, message_id: 99 },
        },
      }),
    });
    await botWorker.fetch(badCbReq, fakeEnv);
    assert.equal(telegramCalls[1].method, "editMessageText");
    assert.ok(telegramCalls[1].body.text.includes("نامعتبر"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
