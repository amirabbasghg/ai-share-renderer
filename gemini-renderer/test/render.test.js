import test from "node:test";
import assert from "node:assert/strict";
import { renderConversationHtml } from "../src/rendering/conversation.js";

test("renderConversationHtml includes Vazirmatn and Fira Code fonts", () => {
  const mockResult = {
    title: "تست فونت فارسی",
    sourceUrl: "https://gemini.google.com/share/123",
    canonicalUrl: "https://example.com/chat/123",
    messages: [
      {
        role: "user",
        text: "سلام، این یک متن تست است.",
        media: [],
      },
      {
        role: "assistant",
        text: "سلام! این پاسخ مدل به زبان فارسی است.\n```js\nconsole.log('hello');\n```",
        media: [],
      },
    ],
  };

  const html = renderConversationHtml(mockResult);

  // Google Fonts link & import checks
  assert.ok(html.includes("fonts.googleapis.com"));
  assert.ok(html.includes("family=Vazirmatn"));
  assert.ok(html.includes("family=Fira+Code"));

  // Font-family declarations
  assert.ok(html.includes('"Vazirmatn"'));
  assert.ok(html.includes('"Fira Code"'));

  // Print & PDF media queries
  assert.ok(html.includes("@media print"));
});
