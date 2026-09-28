import { mediaFromValue, normalizeMediaUrl } from "./media.js";
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
     * User prompt
     * =========================================
     */

    const prompt =
      nested(turn, 2);

    const userText =
      joinTextParts(
        nested(prompt, 0)
      );

    /*
     * عکس‌های مربوط به User
     *
     * قبلاً کل turn را اسکن می‌کردیم و
     * عکس User اشتباهاً به Gemini می‌رسید.
     *
     * الان فقط prompt را بررسی می‌کنیم.
     */

    const userMedia = [];
    const seenUserMedia = new Set();

    for (
      const item of mediaFromValue(prompt)
    ) {
      /*
       * URLهای ناقص lmdx را همان اینجا اصلاح می‌کنیم
       * تا در HTML و JSON خروجی، آدرس قابل‌fetch باشد.
       */

      const fixedItem = {
        ...item,
        url: normalizeMediaUrl(item.url),
      };

      if (
        !seenUserMedia.has(fixedItem.url)
      ) {
        seenUserMedia.add(fixedItem.url);
        userMedia.push(fixedItem);
      }

      if (
        !seenMedia.has(fixedItem.url)
      ) {
        seenMedia.add(fixedItem.url);
        media.push(fixedItem);
      }
    }


    /*
     * =========================================
     * User message
     * =========================================
     */

    if (
      userText ||
      userMedia.length > 0
    ) {
      messages.push({
        role: "user",

        text:
          cleanText(userText),

        createdAt,

        media:
          userMedia,
      });
    }


    /*
     * =========================================
     * Gemini response
     * =========================================
     */

    const response =
      nested(turn, 3);

    const assistantText =
      assistantTextFromResponse(
        response
      );


    /*
     * فقط response را برای
     * عکس‌های Gemini بررسی می‌کنیم.
     */

    const assistantMedia = [];
    const seenAssistantMedia = new Set();

    for (
      const item of mediaFromValue(response)
    ) {
      const fixedItem = {
        ...item,
        url: normalizeMediaUrl(item.url),
      };

      if (
        !seenAssistantMedia.has(fixedItem.url)
      ) {
        seenAssistantMedia.add(fixedItem.url);
        assistantMedia.push(fixedItem);
      }

      if (
        !seenMedia.has(fixedItem.url)
      ) {
        seenMedia.add(fixedItem.url);
        media.push(fixedItem);
      }
    }


    /*
     * =========================================
     * Gemini message
     * =========================================
     */

    if (
      assistantText ||
      assistantMedia.length > 0
    ) {
      messages.push({
        role: "assistant",

        text:
          cleanText(
            assistantText
          ),

        createdAt,

        media:
          assistantMedia,
      });
    }


    /*
     * =========================================
     * Metadata
     * =========================================
     */

    turnMetadata.push({
      index:
        turnIndex,

      conversationId,

      responseId,

      createdAt,

      media: [
        ...userMedia,
        ...assistantMedia,
      ],
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
  return String(value || "")
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