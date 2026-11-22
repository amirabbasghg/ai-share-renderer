import { resolveChatGptShare } from "./resolveShare.js";
import {
  collectUniqueMedia,
  extractMessagesFromLegacyPayload,
  parseTurboStreamHtml,
} from "./parse.js";

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 25000;

async function fetchWithTimeout(fetchImpl, url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetchImpl(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function extractChatGpt(sourceUrl, env = {}) {
  const fetchImpl = typeof env?.fetchImpl === "function" ? env.fetchImpl : fetch;
  const { shareType, shareId, canonicalUrl } = resolveChatGptShare(sourceUrl);

  const defaultTitle =
    shareType === "share"
      ? "ChatGPT shared conversation"
      : "ChatGPT shared content";

  let jsonError = "";
  let pageError = "";

  // 1. Fast path for /share/<id>: first-party backend-api share JSON
  if (shareType === "share") {
    const jsonEndpoint =
      `https://chatgpt.com/backend-api/share/${encodeURIComponent(shareId)}`;
    try {
      const response = await fetchWithTimeout(fetchImpl, jsonEndpoint, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": BROWSER_USER_AGENT,
        },
        redirect: "follow",
      });

      if (!response.ok) {
        jsonError = `HTTP ${response.status}`;
      } else {
        const payload = await response.json();
        const messages = extractMessagesFromLegacyPayload(payload);
        if (messages.length > 0) {
          const title =
            (typeof payload?.title === "string" && payload.title.trim()) ||
            defaultTitle;

          return {
            platform: "chatgpt",
            sourceUrl,
            canonicalUrl,
            shareId,
            shareType,
            extractionMethod: "first_party_backend_json",
            title,
            messages,
            media: collectUniqueMedia(messages),
          };
        }
        jsonError = "JSON endpoint returned no readable user/assistant messages";
      }
    } catch (error) {
      jsonError = error instanceof Error ? error.message : String(error);
    }
  }

  // 2. Embedded React Router turbo-stream in the public HTML page (handles /s/ and fallback for /share/)
  try {
    const response = await fetchWithTimeout(fetchImpl, canonicalUrl, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": BROWSER_USER_AGENT,
      },
      redirect: "follow",
    });

    if (!response.ok) {
      pageError = `HTTP ${response.status}`;
    } else {
      const html = await response.text();
      const parsed = parseTurboStreamHtml(html);
      if (parsed && parsed.messages.length > 0) {
        return {
          platform: "chatgpt",
          sourceUrl,
          canonicalUrl: response.url || canonicalUrl,
          shareId,
          shareType,
          extractionMethod: "first_party_embedded_turbo_stream",
          title: parsed.title || defaultTitle,
          messages: parsed.messages,
          media: collectUniqueMedia(parsed.messages),
        };
      }
      pageError = parsed
        ? "public turbo-stream contained no extractable user/assistant messages"
        : "public turbo-stream payload was not found";
    }
  } catch (error) {
    pageError = error instanceof Error ? error.message : String(error);
  }

  if (shareType === "share") {
    throw new Error(
      `ChatGPT public share could not be decoded. JSON route: ${jsonError}. Page route: ${pageError}.`
    );
  }

  throw new Error(
    `ChatGPT public shared content could not be decoded from the page. ${pageError}`
  );
}
