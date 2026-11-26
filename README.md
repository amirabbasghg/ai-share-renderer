# AI Share Renderer

A distributed service and Telegram bot for extracting, parsing, and rendering shared AI conversations (**ChatGPT** and **Google Gemini**) into clean, readable web views (Telegram Instant View), high-resolution images, and PDF documents.

🤖 **Live Telegram Bot:** [@Instant_View_bot](https://t.me/Instant_View_bot)

---

## Features

- **Multi-Platform Link Resolution:** Extracts and normalizes shared conversation threads from both **ChatGPT** and **Google Gemini**, preserving multi-turn structure and embedded media.
- **Rich Typography & Math Support:** Sanitizes HTML output and renders **Markdown**, code blocks, and **LaTeX mathematical equations** cleanly.
- **Multiple Export Formats:**
  - **Web / Instant View (`/render`):** Lightweight, distraction-free HTML optimized for fast reading and Telegram Instant View.
  - **Image Export (`/image`):** Renders conversations into shareable images.
  - **PDF Generation (`/pdf`):** Exports formatted threads into clean, downloadable PDF documents.
- **Telegram Bot Integration:** Send any supported AI share link to [@Instant_View_bot](https://t.me/Instant_View_bot) to receive instant previews and downloadable files directly in chat.
- **Edge-First Architecture:** Modular design deployed across **Cloudflare Workers**, **Vercel**, and **Node.js**.

---

## Project Structure

```text
ai-share-renderer/
├── gemini-renderer/           # Core Cloudflare Worker extraction & rendering engine
│   ├── src/
│   │   ├── chatgpt/           # ChatGPT share link resolver, extractor & parser
│   │   ├── gemini/            # Gemini share resolver, RPC client, turns & media handlers
│   │   ├── rendering/         # Sanitization, Markdown & LaTeX math rendering
│   │   ├── routes/            # HTTP endpoints (/chat, /gemini, /render, /image, /pdf)
│   │   └── utils/             # HTML escaping & nested payload helpers
│   ├── test/                  # Vitest unit & rendering tests
│   └── wrangler.jsonc         # Cloudflare Workers configuration
├── gemini-rpc-proxy/          # Vercel serverless proxy for Gemini RPC requests
│   ├── api/gemini-rpc.js      # RPC relay endpoint
│   └── vercel.json            # Vercel deployment configuration
├── telegram-bot/              # Telegram bot (@Instant_View_bot)
│   └── src/index.js           # Bot commands, link detection & media delivery
├── server.js                  # Main Node.js server entry point
├── server.test.js             # Server integration tests
├── package.json               # Root dependencies & scripts
└── .env.example               # Environment variables template
```

---

## API Endpoints

| Endpoint | Description |
| :--- | :--- |
| `/render` | Renders a shared conversation into clean HTML (Instant View compatible). |
| `/image` | Generates an image snapshot of the rendered conversation. |
| `/pdf` | Compiles and returns a formatted PDF document of the thread. |
| `/chat` | Parses and returns structured JSON data for a ChatGPT share link. |
| `/gemini` | Parses and returns structured JSON data for a Gemini share link. |

---

## Getting Started

### 1. Clone the Repository

```bash
git clone [https://github.com/amirabbasghg/ai-share-renderer.git](https://github.com/amirabbasghg/ai-share-renderer.git)
cd ai-share-renderer
```

### 2. Configure Environment Variables

Create a `.env` file from the provided template and fill in your credentials and service URLs:

```bash
cp .env.example .env
```

### 3. Install Dependencies

Using **Bun**:

```bash
bun install
```

Or using **npm**:

```bash
npm install
cd gemini-renderer && npm install
cd ../gemini-rpc-proxy && npm install
```

### 4. Run Locally & Test

```bash
# Start the main server
node server.js

# Run test suites
npm test
```

---

## Deployment

- **Renderer (`gemini-renderer/`):** Deploy to Cloudflare Workers via Wrangler:
  ```bash
  cd gemini-renderer
  npx wrangler deploy
  ```
- **RPC Proxy (`gemini-rpc-proxy/`):** Deploy directly to Vercel using the included `vercel.json` configuration.
- **Telegram Bot (`telegram-bot/`):** Run `telegram-bot/src/index.js` with your bot token and deployed renderer base URL configured in `.env`.

---

## Try It Now

Open [@Instant_View_bot](https://t.me/Instant_View_bot) on Telegram and send a shared ChatGPT or Gemini conversation link.
