import katex from "katex";
import { escapeHtml } from "../utils/escape.js";


export function restoreMath(
  html,
  mathItems
) {
  let result = html;

  for (
    const item of mathItems
  ) {
    let rendered;

    try {
      rendered =
        katex.renderToString(
          item.expression,
          {
            displayMode:
              item.display,

            throwOnError:
              false,

            strict:
              false,

            output:
              "html",
          }
        );

    } catch {
      rendered =
        `<code class="${
          item.display
            ? "math-display"
            : "math-inline"
        }">${escapeHtml(
          item.expression
        )}</code>`;
    }

    const wrapped =
      item.display
        ? `<div class="math-display">${rendered}</div>`
        : `<span class="math-inline">${rendered}</span>`;

    result =
      result.replaceAll(
        item.token,
        wrapped
      );
  }

  return result;
}
