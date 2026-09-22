import { marked } from "marked";
import { prepareMarkdown } from "./markdown.js";
import { restoreMath } from "./math.js";
import { sanitizeGeneratedHtml } from "./sanitize.js";
import { escapeAttribute } from "../utils/escape.js";

marked.setOptions({
  gfm: true,
  breaks: false,
});


export function renderMessage(message) {
  const isUser =
    message.role === "user";

  const label =
    isUser
      ? "👤 User"
      : "🤖 Gemini";

  const className =
    isUser
      ? "user"
      : "assistant";

  /*
   * Markdown + LaTeX
   */
  const prepared =
    prepareMarkdown(message.text);

  const html =
    marked.parse(
      prepared.markdown
    );

  const withMath =
    restoreMath(
      html,
      prepared.math
    );

  const safeHtml =
    sanitizeGeneratedHtml(
      withMath
    );

  /*
   * Media متعلق به همین پیام
   */
  const mediaHtml =
    renderMedia(message.media);

  return `
<section class="message ${className}">

  <div class="message-label">
    ${label}
  </div>

  <div class="message-content">

    ${safeHtml}

    ${mediaHtml}

  </div>

</section>`;
}


export function renderMedia(media) {
  if (
    !Array.isArray(media) ||
    media.length === 0
  ) {
    return "";
  }

  const unique = [];
  const seen = new Set();

  for (const item of media) {
    if (
      !item ||
      typeof item.url !== "string"
    ) {
      continue;
    }

    if (
      !/^https?:\/\//i.test(item.url)
    ) {
      continue;
    }

    if (
      seen.has(item.url)
    ) {
      continue;
    }

    seen.add(item.url);

    unique.push(item);
  }

  if (unique.length === 0) {
    return "";
  }

  return unique
    .map((item) => {
      if (
        item.type === "image"
      ) {
        const proxyUrl =
          `/image?url=${encodeURIComponent(
            item.url
          )}`;

        return `
<div class="media">

  <img
    class="media-image"
    src="${escapeAttribute(proxyUrl)}"
    alt="Gemini image"
    loading="lazy"
  >

</div>`;
      }

      if (
        item.type === "video"
      ) {
        return `
<div class="media">

  <video
    class="media-video"
    controls
    preload="metadata"
    src="${escapeAttribute(
      item.url
    )}"
  ></video>

</div>`;
      }

      return "";
    })
    .join("\n");
}
