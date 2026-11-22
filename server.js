import http from "node:http";
import { pathToFileURL } from "node:url";
import worker from "./gemini-renderer/src/index.js";
import { renderConversationHtml } from "./gemini-renderer/src/rendering/conversation.js";
import { escapeHtml } from "./gemini-renderer/src/utils/escape.js";
import geminiRpcHandler from "./gemini-rpc-proxy/api/gemini-rpc.js";

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";

const DEMO_CONVERSATION = {
  platform: "gemini",
  title: "نمونه مکالمه رندر شده از Gemini",
  sourceUrl: "https://gemini.google.com/share/demo",
  canonicalUrl: "https://gemini.google.com/share/demo",
  shareId: "demo",
  messages: [
    {
      role: "user",
      text: "لطفاً فرمول معادله درجه دوم و یک مثال کوتاه جاوااسکریپت برای حل آن بنویس.",
      media: [],
    },
    {
      role: "assistant",
      text: [
        "برای معادله درجه دوم $ax^2 + bx + c = 0$ با شرط $a \\neq 0$، ریشه‌ها از فرمول زیر به دست می‌آیند:",
        "",
        "$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$",
        "",
        "در اینجا مقدار $\\Delta = b^2 - 4ac$ تعیین‌کننده نوع ریشه‌ها است:",
        "",
        "| وضعیت $\\Delta$ | تعداد ریشه‌های حقیقی |",
        "| --- | --- |",
        "| $\\Delta > 0$ | دو ریشه حقیقی متمایز |",
        "| $\\Delta = 0$ | یک ریشه حقیقی مضاعف |",
        "| $\\Delta < 0$ | بدون ریشه حقیقی |",
        "",
        "```js",
        "function solveQuadratic(a, b, c) {",
        "  const delta = b * b - 4 * a * c;",
        "  if (delta < 0) return [];",
        "  const sqrtDelta = Math.sqrt(delta);",
        "  return [(-b + sqrtDelta) / (2 * a), (-b - sqrtDelta) / (2 * a)];",
        "}",
        "```",
      ].join("\n"),
      media: [],
    },
  ],
  media: [],
};

const DEMO_CHATGPT_CONVERSATION = {
  platform: "chatgpt",
  title: "نمونه مکالمه رندر شده از ChatGPT",
  sourceUrl: "https://chatgpt.com/share/demo-chatgpt",
  canonicalUrl: "https://chatgpt.com/share/demo-chatgpt",
  shareId: "demo-chatgpt",
  messages: [
    {
      role: "user",
      text: "قانون فیثاغورس رو به زبان ساده توضیح بده و یک تابع پایتون برای محاسبه وتر بنویس.",
      media: [],
    },
    {
      role: "assistant",
      text: [
        "در هر مثلث قائم‌الزاویه با اضلاع قائمه $a$ و $b$ و وتر $c$، رابطه زیر برقرار است:",
        "",
        "$$c = \\sqrt{a^2 + b^2}$$",
        "",
        "```python",
        "import math",
        "",
        "def hypotenuse(a: float, b: float) -> float:",
        "    return math.hypot(a, b)",
        "```",
      ].join("\n"),
      media: [],
    },
  ],
  media: [],
};

export function createMemoryKv(initialEntries = []) {
  // In-memory KV stub replacing Cloudflare Workers KV (GEMINI_CHATS)
  const store = new Map(initialEntries);
  return {
    async get(key) {
      return store.get(key) ?? null;
    },
    async put(key, value) {
      store.set(key, value);
    },
    async delete(key) {
      store.delete(key);
    },
    size() {
      return store.size;
    },
  };
}

export function renderLandingPage(origin) {
  const safeOrigin = escapeHtml(origin);
  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gemini &amp; ChatGPT Share Renderer</title>
  <meta name="description" content="Renders public Gemini and ChatGPT shared conversations into Instant View HTML and KaTeX Print/PDF with Markdown, LaTeX math, and proxied images.">
  <meta property="og:title" content="Gemini &amp; ChatGPT Share Renderer">
  <meta property="og:description" content="Renders public Gemini and ChatGPT shared conversations into Instant View HTML and KaTeX Print/PDF with Markdown, LaTeX math, and proxied images.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&family=Vazirmatn:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #1f2937;
      font-family: "Vazirmatn", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
    }
    main {
      width: min(860px, 100%);
      margin: 0 auto;
      padding: 36px 20px 56px;
    }
    header {
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid #e5e7eb;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 1.85rem;
      line-height: 1.3;
    }
    header p {
      margin: 0;
      color: #4b5563;
      font-size: 0.96rem;
    }
    .panel {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 20px;
      margin-bottom: 24px;
    }
    label {
      display: block;
      font-weight: 600;
      font-size: 0.9rem;
      margin-bottom: 6px;
      color: #111827;
    }
    input[type="url"], select {
      width: 100%;
      padding: 10px 12px;
      font-size: 0.95rem;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      background: #ffffff;
      color: #1f2937;
      font-family: inherit;
    }
    input[type="url"]:focus, select:focus {
      outline: 2px solid #2563eb;
      outline-offset: 1px;
    }
    .form-row {
      display: grid;
      grid-template-columns: 1fr 200px;
      gap: 12px;
      align-items: end;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 14px;
      align-items: center;
    }
    button {
      background: #2563eb;
      color: #ffffff;
      border: none;
      border-radius: 10px;
      padding: 10px 18px;
      font-size: 0.95rem;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
    }
    button:hover { background: #1d4ed8; }
    .secondary-link {
      display: inline-block;
      padding: 9px 14px;
      border-radius: 10px;
      border: 1px solid #bbf7d0;
      background: #f0fdf4;
      color: #15803d;
      font-weight: 600;
      font-size: 0.9rem;
      text-decoration: none;
    }
    .secondary-link:hover { background: #dcfce7; }
    .endpoints {
      border-collapse: collapse;
      width: 100%;
      font-size: 0.9rem;
    }
    .endpoints th, .endpoints td {
      border: 1px solid #e5e7eb;
      padding: 10px 12px;
      text-align: left;
      vertical-align: top;
    }
    .endpoints th {
      background: #f3f4f6;
      font-weight: 600;
    }
    .route-cell code {
      white-space: nowrap;
    }
    code {
      font-family: "Fira Code", Consolas, Monaco, monospace;
      background: #f3f4f6;
      padding: 2px 6px;
      border-radius: 5px;
      font-size: 0.85em;
    }
    .note {
      font-size: 0.85rem;
      color: #6b7280;
      margin-top: 12px;
      margin-bottom: 0;
    }
    @media (max-width: 640px) {
      .form-row { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Gemini &amp; ChatGPT Share Renderer</h1>
      <p>Extract and render public Gemini or ChatGPT shared conversations into Instant View HTML and KaTeX Print/PDF with Markdown, LaTeX math, and proxied images.</p>
    </header>

    <section class="panel" aria-label="Render a Gemini or ChatGPT Share URL">
      <form method="GET" action="/">
        <div class="form-row">
          <div>
            <label for="share-url">Gemini or ChatGPT Share URL</label>
            <input
              id="share-url"
              name="url"
              type="url"
              required
              placeholder="https://chatgpt.com/share/... or https://gemini.google.com/share/..."
            >
          </div>
          <div>
            <label for="output-format">Output Format</label>
            <select id="output-format" name="format">
              <option value="html">Instant View (HTML)</option>
              <option value="pdf">PDF / Print View</option>
              <option value="json">JSON Metadata</option>
            </select>
          </div>
        </div>
        <div class="actions">
          <button type="submit">Render Conversation</button>
          <a class="secondary-link" href="/chat/demo-chatgpt">Sample ChatGPT Chat</a>
          <a class="secondary-link" href="/chat/demo">Sample Gemini Chat</a>
          <a class="secondary-link" href="/pdf/demo-chatgpt">Sample PDF / Print View</a>
        </div>
      </form>
      <p class="note">Supports <code>chatgpt.com/share/...</code>, <code>chatgpt.com/s/...</code>, <code>gemini.google.com/share/...</code>, <code>g.co/gemini/share/...</code>, and <code>share.gemini.google/...</code>. Local Gemini RPC proxy: <code>${safeOrigin}/api/gemini-rpc</code>.</p>
    </section>

    <section aria-label="API Endpoints">
      <h2>Endpoints</h2>
      <table class="endpoints">
        <thead>
          <tr>
            <th>Route</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="route-cell"><code>GET /?url=&lt;share_url&gt;</code></td>
            <td>Extracts a public ChatGPT or Gemini share, stores rendered HTML, and returns JSON metadata + <code>chatUrl</code> + <code>pdfUrl</code>.</td>
          </tr>
          <tr>
            <td class="route-cell"><code>GET /?url=&lt;share_url&gt;&amp;format=html</code></td>
            <td>Extracts and returns Instant View HTML directly.</td>
          </tr>
          <tr>
            <td class="route-cell"><code>GET /?url=&lt;share_url&gt;&amp;format=pdf</code></td>
            <td>Extracts, stores, and redirects to <code>/pdf/:id</code> for PDF / KaTeX print output.</td>
          </tr>
          <tr>
            <td class="route-cell"><code>GET /chat/:id</code></td>
            <td>Serves a stored rendered conversation (<a href="/chat/demo-chatgpt">/chat/demo-chatgpt</a> or <a href="/chat/demo">/chat/demo</a>).</td>
          </tr>
          <tr>
            <td class="route-cell"><code>GET /pdf/:id</code></td>
            <td>Generates PDF via Cloudflare Browser Rendering when available, or serves KaTeX MathML Print-to-PDF view in browsers (<code>?format=html</code> for raw print HTML).</td>
          </tr>
          <tr>
            <td class="route-cell"><code>GET /image?url=&lt;image_url&gt;</code></td>
            <td>Proxies external conversation images with a 1x1 transparent PNG fallback.</td>
          </tr>
          <tr>
            <td class="route-cell"><code>POST /api/gemini-rpc</code></td>
            <td>Integrated Gemini <code>batchexecute</code> RPC proxy accepting <code>{ "shareId": "..." }</code>.</td>
          </tr>
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handleRpcProxyRoute(req, res) {
  let body = undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const raw = (await readBody(req)).toString("utf8");
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=UTF-8");
        res.end(JSON.stringify({ success: false, error: "Invalid JSON body" }));
        return;
      }
    }
  }

  const fakeReq = {
    method: req.method,
    headers: req.headers,
    body,
  };

  let statusCode = 200;
  const fakeRes = {
    status(code) {
      statusCode = code;
      return fakeRes;
    },
    json(payload) {
      res.statusCode = statusCode;
      res.setHeader("Content-Type", "application/json; charset=UTF-8");
      res.end(JSON.stringify(payload));
      return fakeRes;
    },
  };

  await geminiRpcHandler(fakeReq, fakeRes);
}

function buildRequestUrl(req) {
  const protoHeader = req.headers["x-forwarded-proto"];
  const proto =
    typeof protoHeader === "string" && protoHeader.length > 0
      ? protoHeader.split(",")[0].trim()
      : "http";
  const host = req.headers.host || `127.0.0.1:${PORT}`;
  return new URL(req.url || "/", `${proto}://${host}`);
}

export function createEnv({ rpcProxyUrl, kv, fetchImpl, renderToken } = {}) {
  const demoHtml = renderConversationHtml(DEMO_CONVERSATION);
  const demoChatGptHtml = renderConversationHtml(DEMO_CHATGPT_CONVERSATION);
  const store =
    kv ||
    createMemoryKv([
      ["demo", demoHtml],
      ["demo-chatgpt", demoChatGptHtml],
    ]);

  return {
    GEMINI_CHATS: store,
    GEMINI_RPC_PROXY:
      rpcProxyUrl ||
      process.env.GEMINI_RPC_PROXY ||
      `http://127.0.0.1:${PORT}/api/gemini-rpc`,
    RENDER_TOKEN:
      renderToken !== undefined ? renderToken : process.env.RENDER_TOKEN || "",
    BROWSER: null,
    ...(fetchImpl ? { fetchImpl } : {}),
  };
}

export function createAppServer({ rpcProxyUrl, kv, fetchImpl, renderToken } = {}) {
  const env = createEnv({ rpcProxyUrl, kv, fetchImpl, renderToken });

  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = buildRequestUrl(req);

      if (requestUrl.pathname === "/health") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=UTF-8");
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (requestUrl.pathname === "/api/gemini-rpc") {
        await handleRpcProxyRoute(req, res);
        return;
      }

      const accept = String(req.headers.accept || "");
      if (
        req.method === "GET" &&
        requestUrl.pathname === "/" &&
        !requestUrl.searchParams.has("url") &&
        accept.includes("text/html")
      ) {
        const html = renderLandingPage(requestUrl.origin);
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=UTF-8");
        res.end(html);
        return;
      }

      const address = server.address();
      const dynamicRpcProxy =
        rpcProxyUrl ||
        process.env.GEMINI_RPC_PROXY ||
        (address && typeof address === "object"
          ? `http://127.0.0.1:${address.port}/api/gemini-rpc`
          : env.GEMINI_RPC_PROXY);

      const requestEnv = {
        ...env,
        GEMINI_RPC_PROXY: dynamicRpcProxy,
      };

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          for (const item of value) headers.append(key, item);
        } else {
          headers.set(key, value);
        }
      }

      const hasBody = req.method !== "GET" && req.method !== "HEAD";
      const bodyBuffer = hasBody ? await readBody(req) : undefined;

      const webRequest = new Request(requestUrl.toString(), {
        method: req.method,
        headers,
        body: bodyBuffer && bodyBuffer.length > 0 ? bodyBuffer : undefined,
      });

      const webResponse = await worker.fetch(webRequest, requestEnv);

      res.statusCode = webResponse.status;
      webResponse.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      const arrayBuffer = await webResponse.arrayBuffer();
      res.end(Buffer.from(arrayBuffer));
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=UTF-8");
      res.end(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }
  });

  return { server, env };
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const { server } = createAppServer();
  server.listen(PORT, HOST, () => {
    console.log(`Gemini Renderer listening on http://${HOST}:${PORT}`);
  });
}
