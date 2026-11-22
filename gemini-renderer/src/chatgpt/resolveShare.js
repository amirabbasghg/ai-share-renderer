const CHATGPT_HOSTS = new Set(["chatgpt.com", "chat.openai.com"]);
const SHARE_ID_RE = /^[A-Za-z0-9_-]{8,256}$/;

export function isChatGptShareUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    if (!CHATGPT_HOSTS.has(host)) {
      return false;
    }

    const parts = parsed.pathname.split("/").filter(Boolean);
    return (
      parts.length >= 2 &&
      (parts[0] === "share" || parts[0] === "s") &&
      Boolean(parts[1])
    );
  } catch {
    return false;
  }
}

export function resolveChatGptShare(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid ChatGPT share URL.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only http and https URLs are supported.");
  }

  const host = parsed.hostname.toLowerCase();
  if (!CHATGPT_HOSTS.has(host)) {
    throw new Error("Unsupported ChatGPT share host.");
  }

  const parts = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });

  if (parts.length < 2 || (parts[0] !== "share" && parts[0] !== "s")) {
    throw new Error("Unsupported ChatGPT share URL.");
  }

  const shareType = parts[0];
  const shareId = parts[1].trim();

  if (!SHARE_ID_RE.test(shareId)) {
    throw new Error("ChatGPT share ID is malformed.");
  }

  return {
    platform: "chatgpt",
    shareType,
    shareId,
    canonicalUrl: `https://chatgpt.com/${shareType}/${shareId}`,
  };
}
