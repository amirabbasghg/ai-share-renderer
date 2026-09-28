import { resolveShareId } from "./resolveShare.js";
import {
  conversationRoot,
  fetchGeminiRpc,
} from "./rpc.js";
import { extractTurns } from "./turns.js";
import { nested, safeString } from "../utils/nested.js";


/*
 * تصاویر lmdx که Gemini فقط با host برهنهٔ
 * googleusercontent.com برمی‌گرداند، عملاً هیچ‌وقت سرو
 * نمی‌شوند (۴۰۴). اینها را از همان ابتدا علامت می‌زنیم تا
 * رندرکننده به‌جای لینک شکستنی، placeholder inline بگذارد.
 */

const NEVER_SERVED_LMDX_HOSTS = [
  "googleusercontent.com",
  "www.googleusercontent.com",
];

function isNeverServedLmdx(rawUrl) {
  try {
    const parsed = new URL(rawUrl);

    return (
      NEVER_SERVED_LMDX_HOSTS.includes(
        parsed.hostname.toLowerCase()
      ) &&
      /^\/lmdx_[a-z]+\//i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

export async function extractGemini(sourceUrl, env) {
  const {
    shareId,
    canonicalUrl,
  } = await resolveShareId(sourceUrl);

  const payload =
    await fetchGeminiRpc(shareId, env);

  const root =
    conversationRoot(payload);

  const conversation =
    extractTurns(root);

  /*
   * علامت‌گذاری تصاویری که هیچ‌وقت سرو نمی‌شوند
   * (lmdx با host برهنه) تا رندرکننده به‌جای لینک
   * شکستنی، placeholder inline استفاده کند.
   */

  for (const message of conversation.messages) {
    if (!Array.isArray(message.media)) {
      continue;
    }

    for (const item of message.media) {
      if (
        item.type === "image" &&
        isNeverServedLmdx(item.url)
      ) {
        item.unavailable = true;
      }
    }
  }

  for (const item of conversation.media) {
    if (
      item.type === "image" &&
      isNeverServedLmdx(item.url)
    ) {
      item.unavailable = true;
    }
  }

  if (
    conversation.messages.length === 0
  ) {
    throw new Error(
      "Gemini public share returned no readable messages."
    );
  }

  const title =
    safeString(
      nested(root, 2, 1)
    ) ||
    "Gemini shared conversation";

  const returnedShareId =
    safeString(
      nested(root, 3)
    );

  if (
    returnedShareId &&
    returnedShareId !== shareId
  ) {
    throw new Error(
      "Gemini share response ID did not match the requested share."
    );
  }

  return {
    sourceUrl,
    canonicalUrl,
    shareId,
    title,
    messages:
      conversation.messages,
    turns:
      conversation.turnMetadata,
    media:
      conversation.media,
  };
}
