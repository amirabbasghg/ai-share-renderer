const STREAM_RE = /streamController\.enqueue\((".*?")\);<\/script>/gs;

const VISIBLE_CONTENT_TYPES = new Set(["text", "multimodal_text"]);

const ENTITY_MARKER_RE = /\ue200entity\ue202(\[[\s\S]*?\])\ue201/g;
const URL_MARKER_RE = /\ue200url\ue202([^\ue201\ue202]+)\ue202(https?:\/\/[^\ue201\ue202]+)\ue201/g;
const GENERIC_PUA_MARKER_RE = /\ue200[\s\S]*?\ue201/g;

export function cleanChatGptText(value) {
  let text = String(value || "");

  // Decode entity markers: \ue200entity\ue202["type","Display Label"]\ue201 -> Display Label
  text = text.replace(ENTITY_MARKER_RE, (_, jsonArray) => {
    try {
      const parsed = JSON.parse(jsonArray);
      if (Array.isArray(parsed)) {
        for (let i = parsed.length - 1; i >= 0; i--) {
          if (typeof parsed[i] === "string" && parsed[i].trim()) {
            return parsed[i].trim();
          }
        }
      }
    } catch {
      // ignore malformed entity marker
    }
    return "";
  });

  // Decode inline URL markers: \ue200url\ue202Label\ue202https://...\ue201 -> [Label](https://...)
  text = text.replace(URL_MARKER_RE, (_, label, href) => {
    const cleanLabel = label.trim().replace(/[\[\]]/g, "");
    const cleanHref = href.trim();
    if (!/^https?:\/\//i.test(cleanHref)) {
      return cleanLabel;
    }
    if (!cleanLabel || cleanLabel === cleanHref) {
      return cleanHref;
    }
    return `[${cleanLabel}](${cleanHref})`;
  });

  // Strip internal citation / navigation markers (\ue200cite\ue202turn0search0\ue201, etc.)
  text = text.replace(GENERIC_PUA_MARKER_RE, "");

  return text
    .replace(/\u200b/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function toIsoTimestamp(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  try {
    return new Date(value * 1000).toISOString();
  } catch {
    return null;
  }
}

function extractMediaFromPart(part) {
  if (!part || typeof part !== "object") {
    return null;
  }

  const candidateUrl =
    typeof part.url === "string"
      ? part.url
      : typeof part.image_url === "string"
        ? part.image_url
        : typeof part.image_url?.url === "string"
          ? part.image_url.url
          : null;

  if (!candidateUrl || !/^https?:\/\//i.test(candidateUrl)) {
    return null;
  }

  const normalized = candidateUrl.replace(/^http:\/\//i, "https://");
  if (/\.(mp4|webm)([?#]|$)/i.test(normalized)) {
    return { type: "video", url: normalized };
  }

  return { type: "image", url: normalized };
}

export function normalizeChatGptMessage(message) {
  if (!message || typeof message !== "object") {
    return null;
  }

  const author = message.author;
  const rawRole =
    author && typeof author === "object"
      ? String(author.role || "")
      : String(message.role || "");
  const role = rawRole.toLowerCase();

  // Only export public user & assistant dialogue turns
  if (role !== "user" && role !== "assistant") {
    return null;
  }

  if (message.metadata?.is_visually_hidden_from_conversation === true) {
    return null;
  }

  // Filter out internal tool-call messages directed to web/python/functions/etc.
  if (
    typeof message.recipient === "string" &&
    message.recipient.length > 0 &&
    message.recipient !== "all"
  ) {
    return null;
  }

  const content = message.content;
  const contentType =
    content && typeof content === "object" && typeof content.content_type === "string"
      ? content.content_type
      : null;

  if (contentType && !VISIBLE_CONTENT_TYPES.has(contentType)) {
    return null;
  }

  const textParts = [];
  const media = [];
  const seenMedia = new Set();

  if (content && typeof content === "object") {
    if (Array.isArray(content.parts)) {
      for (const part of content.parts) {
        if (typeof part === "string") {
          const cleaned = cleanChatGptText(part);
          if (cleaned) textParts.push(cleaned);
        } else if (part && typeof part === "object") {
          if (typeof part.text === "string") {
            const cleaned = cleanChatGptText(part.text);
            if (cleaned) textParts.push(cleaned);
          }
          const mediaItem = extractMediaFromPart(part);
          if (mediaItem && !seenMedia.has(mediaItem.url)) {
            seenMedia.add(mediaItem.url);
            media.push(mediaItem);
          }
        }
      }
    } else if (typeof content.text === "string") {
      const cleaned = cleanChatGptText(content.text);
      if (cleaned) textParts.push(cleaned);
    }
  } else if (typeof content === "string") {
    const cleaned = cleanChatGptText(content);
    if (cleaned) textParts.push(cleaned);
  }

  const text = textParts.join("\n\n").trim();
  if (!text && media.length === 0) {
    return null;
  }

  return {
    role,
    text,
    createdAt: toIsoTimestamp(message.create_time),
    media,
  };
}

export function hydrateTurboPool(pool, index, depth = 0) {
  if (
    depth > 100 ||
    typeof index !== "number" ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= pool.length
  ) {
    return null;
  }

  const value = pool[index];

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const result = {};
    for (const [encodedKey, childIndex] of Object.entries(value)) {
      if (!encodedKey.startsWith("_") || !/^\d+$/.test(encodedKey.slice(1))) {
        continue;
      }
      const keyIndex = Number(encodedKey.slice(1));
      const key =
        keyIndex >= 0 && keyIndex < pool.length ? pool[keyIndex] : null;
      if (typeof key === "string") {
        result[key] = hydrateTurboPool(pool, childIndex, depth + 1);
      }
    }
    return result;
  }

  if (Array.isArray(value)) {
    // React Router turbo-stream uses string-leading arrays for typed markers
    // (Date, Promise, Map, etc.) rather than regular JSON arrays.
    if (value.length > 0 && typeof value[0] === "string") {
      return null;
    }
    return value.map((child) => hydrateTurboPool(pool, child, depth + 1));
  }

  return value;
}

function findKey(value, targetKey, depth = 0) {
  if (depth > 40 || value === null || value === undefined || typeof value !== "object") {
    return null;
  }

  if (!Array.isArray(value)) {
    if (Object.prototype.hasOwnProperty.call(value, targetKey)) {
      return value[targetKey];
    }
    for (const child of Object.values(value)) {
      const found = findKey(child, targetKey, depth + 1);
      if (found !== null) return found;
    }
  } else {
    for (const child of value) {
      const found = findKey(child, targetKey, depth + 1);
      if (found !== null) return found;
    }
  }

  return null;
}

function collectConversationMessages(data) {
  const linear = findKey(data, "linear_conversation");
  if (Array.isArray(linear) && linear.length > 0) {
    return linear.map((node) =>
      node && typeof node === "object" ? node.message : null
    );
  }

  const messages = findKey(data, "messages");
  if (Array.isArray(messages) && messages.length > 0) {
    return messages;
  }

  return null;
}

export function parseTurboStreamHtml(pageHtml) {
  if (typeof pageHtml !== "string" || !pageHtml) {
    return null;
  }

  STREAM_RE.lastIndex = 0;
  let match;
  while ((match = STREAM_RE.exec(pageHtml)) !== null) {
    let pool;
    try {
      const decodedString = JSON.parse(match[1]);
      pool = JSON.parse(decodedString);
    } catch {
      continue;
    }

    if (!Array.isArray(pool) || pool.length === 0) {
      continue;
    }

    const data = hydrateTurboPool(pool, 0);
    const rawMessages = collectConversationMessages(data);
    if (!rawMessages) {
      continue;
    }

    const messages = [];
    for (const item of rawMessages) {
      const normalized = normalizeChatGptMessage(item);
      if (normalized) {
        messages.push(normalized);
      }
    }

    const title = findKey(data, "title");
    return {
      title: typeof title === "string" ? title.trim() : "",
      messages,
    };
  }

  return null;
}

function messageCreateTime(message) {
  if (!message || typeof message !== "object") return 0;
  const num = Number(message.create_time);
  return Number.isFinite(num) ? num : 0;
}

export function extractMessagesFromLegacyPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  if (Array.isArray(payload.linear_conversation) && payload.linear_conversation.length > 0) {
    const out = [];
    for (const node of payload.linear_conversation) {
      const normalized = normalizeChatGptMessage(node?.message);
      if (normalized) out.push(normalized);
    }
    if (out.length > 0) {
      return out;
    }
  }

  if (Array.isArray(payload.messages) && payload.messages.length > 0) {
    const out = [];
    for (const item of payload.messages) {
      const normalized = normalizeChatGptMessage(item);
      if (normalized) out.push(normalized);
    }
    if (out.length > 0) {
      return out;
    }
  }

  const mapping = payload.mapping;
  if (!mapping || typeof mapping !== "object") {
    return [];
  }

  const current = payload.current_node;
  let orderedNodes = [];

  if (typeof current === "string" && Object.prototype.hasOwnProperty.call(mapping, current)) {
    const seen = new Set();
    let cursor = current;
    while (cursor && !seen.has(cursor) && Object.prototype.hasOwnProperty.call(mapping, cursor)) {
      seen.add(cursor);
      const node = mapping[cursor];
      if (!node || typeof node !== "object") break;
      orderedNodes.push(node);
      cursor = typeof node.parent === "string" ? node.parent : null;
    }
    orderedNodes.reverse();
  } else {
    orderedNodes = Object.values(mapping).filter(
      (node) => node && typeof node === "object"
    );
    orderedNodes.sort((a, b) => {
      const diff = messageCreateTime(a.message) - messageCreateTime(b.message);
      if (diff !== 0) return diff;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
  }

  const out = [];
  for (const node of orderedNodes) {
    const normalized = normalizeChatGptMessage(node.message);
    if (normalized) out.push(normalized);
  }
  return out;
}

export function collectUniqueMedia(messages) {
  const media = [];
  const seen = new Set();
  for (const message of messages) {
    for (const item of message.media || []) {
      if (!seen.has(item.url)) {
        seen.add(item.url);
        media.push(item);
      }
    }
  }
  return media;
}
