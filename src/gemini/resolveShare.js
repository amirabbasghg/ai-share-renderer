import { GEMINI_HOST } from "./rpc.js";

const SHORT_LINK_HOSTS = new Set([
  "share.gemini.google",
  "g.co",
]);

const HEADERS = {
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

  "Accept-Language":
    "en-US,en;q=0.9",

  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/140.0.0.0 Safari/537.36",

  "Referer":
    `https://${GEMINI_HOST}/`,
};

function isValidShareId(value) {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_-]{6,128}$/.test(value)
  );
}

function getShareIdFromGeminiUrl(value) {
  try {
    const parsed = new URL(value);

    if (
      parsed.hostname.toLowerCase() !==
      GEMINI_HOST
    ) {
      return null;
    }

    const parts =
      parsed.pathname
        .split("/")
        .filter(Boolean);

    if (
      parts.length >= 2 &&
      parts[0] === "share" &&
      isValidShareId(parts[1])
    ) {
      return parts[1];
    }

    return null;
  } catch {
    return null;
  }
}

function getShareIdFromText(text) {
  if (!text) {
    return null;
  }

  const patterns = [
    /https?:\/\/gemini\.google\.com\/share\/([A-Za-z0-9_-]{6,128})/i,

    /gemini\.google\.com\/share\/([A-Za-z0-9_-]{6,128})/i,

    /\/share\/([A-Za-z0-9_-]{6,128})/i,
  ];

  for (const pattern of patterns) {
    const match =
      text.match(pattern);

    if (
      match &&
      isValidShareId(match[1])
    ) {
      return match[1];
    }
  }

  return null;
}

async function followShortLink(url) {
  let currentUrl = url;

  for (let i = 0; i < 5; i++) {
    const response =
      await fetch(currentUrl, {
        redirect: "manual",
        headers: HEADERS,
      });

    const directShareId =
      getShareIdFromGeminiUrl(currentUrl);

    if (directShareId) {
      return directShareId;
    }

    const location =
      response.headers.get("Location");

    if (
      [301, 302, 303, 307, 308]
        .includes(response.status) &&
      location
    ) {
      currentUrl =
        new URL(
          location,
          currentUrl
        ).toString();

      const redirectedShareId =
        getShareIdFromGeminiUrl(
          currentUrl
        );

      if (redirectedShareId) {
        return redirectedShareId;
      }

      continue;
    }

    const finalUrl =
      response.url;

    const finalShareId =
      getShareIdFromGeminiUrl(
        finalUrl
      );

    if (finalShareId) {
      return finalShareId;
    }

    const text =
      await response.text();

    const htmlShareId =
      getShareIdFromText(text);

    if (htmlShareId) {
      return htmlShareId;
    }

    break;
  }

  return null;
}

export async function resolveShareId(url) {
  const parsed =
    new URL(url);

  const host =
    parsed.hostname.toLowerCase();

  const parts =
    parsed.pathname
      .split("/")
      .filter(Boolean);

  let shareId = null;

  // https://gemini.google.com/share/<id>
  if (
    host === GEMINI_HOST &&
    parts.length >= 2 &&
    parts[0] === "share"
  ) {
    shareId = parts[1];
  }

  // https://g.co/gemini/share/<id>
  else if (
    host === "g.co" &&
    parts.length >= 3 &&
    parts[0] === "gemini" &&
    parts[1] === "share"
  ) {
    shareId = parts[2];
  }

  // https://share.gemini.google/<token>
  else if (
    host === "share.gemini.google"
  ) {
    shareId =
      await followShortLink(url);
  }

  // Google AI Mode:
  // https://share.google/aimode/<id>
  else if (
    host === "share.google" &&
    parts.length >= 2 &&
    parts[0] === "aimode"
  ) {
    throw new Error(
      "Google AI Mode share links are not supported by the Gemini renderer."
    );
  }

  else {
    throw new Error(
      "Unsupported Gemini share URL."
    );
  }

  if (
    !isValidShareId(shareId)
  ) {
    throw new Error(
      "Gemini short link did not resolve to a public share page."
    );
  }

  return {
    shareId,

    canonicalUrl:
      `https://${GEMINI_HOST}/share/${shareId}`,
  };
}