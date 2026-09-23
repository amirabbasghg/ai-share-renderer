import { mediaFromValue } from "./media.js";
import { nested, safeString } from "../utils/nested.js";


export function extractTurns(root) {
  const messages = [];
  const turnMetadata = [];
  const media = [];
  const seenMedia = new Set();

  const turns =
    nested(root, 1);

  if (
    !Array.isArray(turns)
  ) {
    return {
      messages,
      turnMetadata,
      media,
    };
  }

  for (
    let turnIndex = 0;
    turnIndex < turns.length;
    turnIndex++
  ) {
    const turn =
      turns[turnIndex];

    if (
      !Array.isArray(turn)
    ) {
      continue;
    }

    const ids =
      nested(turn, 0);

    const conversationId =
      safeString(
        nested(ids, 0)
      );

    const responseId =
      safeString(
        nested(ids, 1)
      );

    const createdAt =
      timestamp(
        nested(turn, 4)
      );

    /*
     * =========================================
     * Media متعلق به همین turn
     * =========================================
     */

    const turnMedia = [];
    const seenTurnMedia = new Set();

    for (
      const item of mediaFromValue(turn)
    ) {
      if (
        !seenTurnMedia.has(item.url)
      ) {
        seenTurnMedia.add(item.url);
        turnMedia.push(item);
      }

      if (
        !seenMedia.has(item.url)
      ) {
        seenMedia.add(item.url);
        media.push(item);
      }
    }

    /*
     * =========================================
     * User
     * =========================================
     */

    const prompt =
      nested(turn, 2);

    const userText =
      joinTextParts(
        nested(prompt, 0)
      );

    if (userText) {
      messages.push({
        role: "user",

        text:
          cleanText(userText),

        createdAt,

        media: [],
      });
    }

    /*
     * =========================================
     * Gemini
     * =========================================
     */

    const response =
      nested(turn, 3);

    const assistantText =
      assistantTextFromResponse(
        response
      );

    if (assistantText) {
      messages.push({
        role: "assistant",

        text:
          cleanText(
            assistantText
          ),

        createdAt,

        /*
         * عکس‌های همین turn
         * داخل خود پیام Gemini قرار می‌گیرند.
         */
        media:
          turnMedia,
      });
    } else if (
      turnMedia.length > 0 &&
      userText
    ) {
      /*
       * اگر پاسخ متنی Gemini نداشت،
       * عکس را به User متصل می‌کنیم.
       */
      const lastMessage =
        messages[messages.length - 1];

      if (
        lastMessage &&
        lastMessage.role === "user"
      ) {
        lastMessage.media =
          turnMedia;
      }
    }

    turnMetadata.push({
      index: turnIndex,

      conversationId,

      responseId,

      createdAt,

      media:
        turnMedia,
    });
  }

  return {
    messages,
    turnMetadata,
    media,
  };
}


function assistantTextFromResponse(
  response
) {
  const candidates =
    nested(response, 0);

  if (
    !Array.isArray(candidates)
  ) {
    return "";
  }

  for (
    const candidate of candidates
  ) {
    if (
      !Array.isArray(candidate)
    ) {
      continue;
    }

    const parts =
      nested(candidate, 1);

    const value =
      joinTextParts(parts);

    if (value) {
      return value;
    }
  }

  return "";
}


function joinTextParts(value) {
  if (
    typeof value === "string"
  ) {
    return value.trim();
  }

  if (
    !Array.isArray(value)
  ) {
    return "";
  }

  const parts = [];

  for (
    const item of value
  ) {
    if (
      typeof item === "string" &&
      item.trim()
    ) {
      parts.push(
        item.trim()
      );
    }
  }

  return parts.join("\n\n");
}


function cleanText(value) {
  return value
    .replace(/\u200b/g, "")
    .trim();
}


function timestamp(value) {
  if (
    !Array.isArray(value) ||
    value.length === 0
  ) {
    return null;
  }

  const seconds =
    value[0];

  const nanos =
    value.length > 1
      ? value[1]
      : 0;

  if (
    typeof seconds !== "number"
  ) {
    return null;
  }

  const milliseconds =
    seconds * 1000 +
    (
      typeof nanos === "number"
        ? nanos / 1_000_000
        : 0
    );

  try {
    return new Date(
      milliseconds
    ).toISOString();
  } catch {
    return null;
  }
}
