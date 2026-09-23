import { renderMessage } from "./message.js";
import {
  escapeHtml,
  escapeAttribute,
} from "../utils/escape.js";


export function renderConversationHtml(result) {
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
