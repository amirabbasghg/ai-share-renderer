import { GEMINI_HOST } from "./rpc.js";
import { safeString } from "../utils/nested.js";

function isValidShareId(value) {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_-]{6,128}$/.test(value)
  );
}

function extractShareIdFromUrl(url) {
  try {
    const parsed = new URL(url);

    if (
      parsed.hostname.toLowerCase() !== GEMINI_HOST
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

function extractShareIdFromText(text) {
  if (!text) {
    return null;
  }

  const patterns = [
    /https?:\/\/gemini\.google\.com\/share\/([A-Za-z0-9_-]{6,128})/i,
    /gemini\.google\.com\/share\/([A-Za-z0-9_-]{6,128})/i,
    /\/share\/([A-Za-z0-9_-]{6,128})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (
      match &&
      isValidShareId(match[1])
    ) {
      return match[1];
    }
  }

  return null;
}

async function resolveShortLink(url) {
  let currentUrl = url;

  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(currentUrl, {
      redirect: "manual",

      headers: {
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
      },
    });

    const currentShareId =
      extractShareIdFromUrl(currentUrl);

    if (currentShareId) {
      return currentShareId;
    }

    const location =
      response.headers.get("Location");

    if (
      [301, 302, 303, 307, 308].includes(
        response.status
      ) &&
      location
    ) {
      currentUrl =
        new URL(
          location,
          currentUrl
        ).toString();

      const redirectedShareId =
        extractShareIdFromUrl(currentUrl);

      if (redirectedShareId) {
        return redirectedShareId;
      }

      continue;
    }

    const responseUrlShareId =
      extractShareIdFromUrl(
        response.url
      );

    if (responseUrlShareId) {
      return responseUrlShareId;
    }

    const body =
      await response.text();

    const bodyShareId =
      extractShareIdFromText(body);

    if (bodyShareId) {
      return bodyShareId;
    }

    break;
  }

  return null;
}

export async function resolveShareId(url) {
  const parsed = new URL(url);

  const host =
    parsed.hostname.toLowerCase();

  const parts =
    parsed.pathname
      .split("/")
      .filter(Boolean);

  let shareId;

  // gemini.google.com/share/<id>
  if (
    host === GEMINI_HOST &&
    parts.length >= 2 &&
    parts[0] === "share"
  ) {
    shareId = parts[1];
  }

  // g.co/gemini/share/<id>
  else if (
    host === "g.co" &&
    parts.length >= 3 &&
    parts[0] === "gemini" &&
    parts[1] === "share"
  ) {
    shareId = parts[2];
  }

  // share.gemini.google/<token>
  else if (
    host === "share.gemini.google"
  ) {
    shareId =
      await resolveShortLink(url);
  }

  else {
    throw new Error(
      "Unsupported Gemini share URL."
    );
  }

  shareId =
    safeString(shareId);

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