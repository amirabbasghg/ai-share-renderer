import test from "node:test";
import assert from "node:assert/strict";
import {
  isChatGptShareUrl,
  resolveChatGptShare,
} from "../src/chatgpt/resolveShare.js";
import {
  cleanChatGptText,
  extractMessagesFromLegacyPayload,
  parseTurboStreamHtml,
} from "../src/chatgpt/parse.js";
import { extractChatGpt } from "../src/chatgpt/extract.js";
import { renderConversationHtml } from "../src/rendering/conversation.js";

function encodeTurboStreamHtml(data) {
  const pool = [];
  function add(value) {
    const idx = pool.length;
    pool.push(null);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const encoded = {};
      for (const [key, child] of Object.entries(value)) {
        const keyIdx = add(String(key));
        const childIdx = add(child);
        encoded[`_${keyIdx}`] = childIdx;
      }
      pool[idx] = encoded;
      return idx;
    }
    if (Array.isArray(value)) {
      pool[idx] = value.map((child) => add(child));
      return idx;
    }
    pool[idx] = value;
    return idx;
  }

  add(data);
  const encoded = JSON.stringify(JSON.stringify(pool));
  return `<script>window.__reactRouterContext.streamController.enqueue(${encoded});</script>`;
}

test("isChatGptShareUrl & resolveChatGptShare validate hosts, paths, and share IDs", () => {
  assert.equal(
    isChatGptShareUrl("https://chatgpt.com/share/6b02f5a6-8cc8-83ed-b0d4-83f4b7662d81"),
    true
  );
  assert.equal(
    isChatGptShareUrl("https://chat.openai.com/share/6b02f5a6-8cc8-83ed-b0d4-83f4b7662d81"),
    true
  );
  assert.equal(
    isChatGptShareUrl("https://chatgpt.com/s/t_69b1f761e57c81919921439ae31c0a40"),
    true
  );
  assert.equal(isChatGptShareUrl("https://chatgpt.com/c/12345678"), false);
  assert.equal(isChatGptShareUrl("https://gemini.google.com/share/abc12345"), false);
  assert.equal(isChatGptShareUrl("javascript:alert(1)"), false);

  const resolved = resolveChatGptShare(
    "https://chat.openai.com/share/6b02f5a6-8cc8-83ed-b0d4-83f4b7662d81"
  );
  assert.equal(resolved.platform, "chatgpt");
  assert.equal(resolved.shareType, "share");
  assert.equal(resolved.shareId, "6b02f5a6-8cc8-83ed-b0d4-83f4b7662d81");
  assert.equal(
    resolved.canonicalUrl,
    "https://chatgpt.com/share/6b02f5a6-8cc8-83ed-b0d4-83f4b7662d81"
  );

  assert.throws(() => resolveChatGptShare("https://chatgpt.com/share/bad"));
});

test("cleanChatGptText decodes entity/url markers and strips cite markers", () => {
  const input =
    'سلام \ue200entity\ue202["people","Alice"]\ue201 لینک: \ue200url\ue202GitHub\ue202https://github.com/wuaishare/sharextract\ue201 \ue200cite\ue202turn0search0\ue202turn0search1\ue201';
  assert.equal(
    cleanChatGptText(input),
    "سلام Alice لینک: [GitHub](https://github.com/wuaishare/sharextract)"
  );
});

test("parseTurboStreamHtml hydrates React Router turbo-stream and filters non-dialogue nodes", () => {
  const html = encodeTurboStreamHtml({
    title: "ساخت بات پیش‌نمایش",
    linear_conversation: [
      {
        message: {
          author: { role: "system" },
          content: { content_type: "text", parts: ["internal system prompt"] },
        },
      },
      {
        message: {
          author: { role: "user" },
          recipient: "all",
          content: { content_type: "text", parts: ["سلام چت‌جی‌پی‌تی"] },
          create_time: 1700000001,
        },
      },
      {
        message: {
          author: { role: "assistant" },
          recipient: "web.run",
          content: { content_type: "text", parts: ['{"search_query":"test"}'] },
        },
      },
      {
        message: {
          author: { role: "assistant" },
          recipient: "all",
          content: { content_type: "thoughts", parts: ["secret thinking"] },
        },
      },
      {
        message: {
          author: { role: "assistant" },
          recipient: "all",
          content: {
            content_type: "text",
            parts: ["سلام! پاسخ نهایی اینجاست.\ue200cite\ue202turn0search0\ue201"],
          },
          create_time: 1700000002,
        },
      },
    ],
  });

  const parsed = parseTurboStreamHtml(html);
  assert.ok(parsed);
  assert.equal(parsed.title, "ساخت بات پیش‌نمایش");
  assert.equal(parsed.messages.length, 2);
  assert.equal(parsed.messages[0].role, "user");
  assert.equal(parsed.messages[0].text, "سلام چت‌جی‌پی‌تی");
  assert.equal(parsed.messages[1].role, "assistant");
  assert.equal(parsed.messages[1].text, "سلام! پاسخ نهایی اینجاست.");
});

test("extractMessagesFromLegacyPayload traverses mapping parent chain in order", () => {
  const messages = extractMessagesFromLegacyPayload({
    title: "Legacy Share",
    current_node: "node2",
    mapping: {
      node1: {
        id: "node1",
        parent: null,
        message: {
          author: { role: "user" },
          content: { content_type: "text", parts: ["First"] },
          create_time: 100,
        },
      },
      node2: {
        id: "node2",
        parent: "node1",
        message: {
          author: { role: "assistant" },
          content: { content_type: "text", parts: ["Second"] },
          create_time: 200,
        },
      },
    },
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[0].text, "First");
  assert.equal(messages[1].text, "Second");
});

test("extractChatGpt falls back to turbo-stream HTML when backend JSON fails", async () => {
  const html = encodeTurboStreamHtml({
    title: "Fallback Share",
    messages: [
      {
        author: { role: "user" },
        content: { content_type: "text", parts: ["Question"] },
      },
      {
        author: { role: "assistant" },
        content: { content_type: "text", parts: ["Answer"] },
      },
    ],
  });

  const mockFetch = async (url) => {
    if (String(url).includes("/backend-api/share/")) {
      return new Response("Not Found", { status: 404 });
    }
    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  };

  const result = await extractChatGpt(
    "https://chatgpt.com/share/6b02f5a6-8cc8-83ed-b0d4-83f4b7662d81",
    { fetchImpl: mockFetch }
  );

  assert.equal(result.platform, "chatgpt");
  assert.equal(result.extractionMethod, "first_party_embedded_turbo_stream");
  assert.equal(result.title, "Fallback Share");
  assert.equal(result.messages.length, 2);

  const rendered = renderConversationHtml(result);
  assert.ok(rendered.includes("🤖 ChatGPT"));
  assert.ok(rendered.includes("ChatGPT shared conversation"));
});
