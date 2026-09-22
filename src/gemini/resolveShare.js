import { GEMINI_HOST } from "./rpc.js";


export async function resolveShareId(url) {
  const parsed = new URL(url);

  const host =
    parsed.hostname.toLowerCase();

  const parts =
    parsed.pathname
      .split("/")
      .filter(Boolean);

  let shareId;

  if (
    host === GEMINI_HOST &&
    parts.length >= 2 &&
    parts[0] === "share"
  ) {
    shareId = parts[1];

  } else if (
    host === "g.co" &&
    parts.length >= 3 &&
    parts[0] === "gemini" &&
    parts[1] === "share"
  ) {
    shareId = parts[2];

  } else if (
    host === "share.gemini.google"
  ) {

    const response = await fetch(url, {
      redirect: "follow",

      headers: {
        "Accept":
          "text/html",

        "Referer":
          `https://${GEMINI_HOST}/`,
      },
    });

    const resolvedUrl =
      response.url;

    const resolved =
      new URL(resolvedUrl);

    const resolvedParts =
      resolved.pathname
        .split("/")
        .filter(Boolean);

    if (
      resolved.hostname.toLowerCase() !==
        GEMINI_HOST ||
      resolvedParts.length < 2 ||
      resolvedParts[0] !== "share"
    ) {
      throw new Error(
        "Gemini short link did not resolve to a public share page."
      );
    }

    shareId =
      resolvedParts[1];

  } else {
    throw new Error(
      "Unsupported Gemini share URL."
    );
  }

  if (
    !/^[A-Za-z0-9_-]{6,128}$/.test(
      shareId
    )
  ) {
    throw new Error(
      "Gemini share ID is malformed."
    );
  }

  return {
    shareId,

    canonicalUrl:
      `https://${GEMINI_HOST}/share/${shareId}`,
  };
}
