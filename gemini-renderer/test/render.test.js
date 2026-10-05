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
  // KaTeX CSS
  assert.ok(html.includes("katex.min.css"));
});

test("prepareMarkdown and restoreMath correctly extract and render matrix environments", async () => {
  const { prepareMarkdown } = await import("../src/rendering/markdown.js");
  const { restoreMath } = await import("../src/rendering/math.js");

  const input = "State n': \\begin{bmatrix} 1 & 2 & 3 \\\\ 4 & 5 & 6 \\\\ 7 & 8 & 6 \\end{bmatrix}";
  const { markdown, math } = prepareMarkdown(input);

  assert.equal(math.length, 1);
  assert.equal(math[0].display, true);
  assert.ok(math[0].expression.includes("bmatrix"));

  const restored = restoreMath(markdown, math);
  assert.ok(restored.includes("math-display"));
  assert.ok(restored.includes("<table"));
  assert.ok(restored.includes("["));
  assert.ok(restored.includes("]"));
});
