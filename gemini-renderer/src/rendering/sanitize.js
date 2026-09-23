import { escapeAttribute } from "../utils/escape.js";


export function sanitizeGeneratedHtml(html) {
  return html

    /*
     * =========================================
     * لینک‌ها
     * =========================================
     */

    .replace(
      /href\s*=\s*["']([^"']*)["']/gi,
      (full, href) => {

        if (
          /^https?:\/\//i.test(href) ||
          /^mailto:/i.test(href) ||
          href.startsWith("#")
        ) {
          return `href="${escapeAttribute(
            href
          )}"`;
        }

        return 'href="#"';
      }
    )

    /*
     * =========================================
     * تصاویر
     * =========================================
     */

    .replace(
      /src\s*=\s*["']([^"']*)["']/gi,
      (full, src) => {

        /*
         * اگر قبلاً proxy خودمان است،
         * دوباره proxy نکن.
         */

        if (
          /^\/image\?url=/i.test(src)
        ) {
          return `src="${escapeAttribute(
            src
          )}"`;
        }

        /*
         * URL داخلی معتبر
         */

        if (
          src.startsWith("/")
        ) {
          return `src="${escapeAttribute(
            src
          )}"`;
        }

        /*
         * فقط URLهای http/https
         */

        if (
          !/^https?:\/\//i.test(src)
        ) {
          return 'src=""';
        }

        /*
         * Proxy کردن تصویر خارجی
         */

        const proxyUrl =
          `/image?url=${encodeURIComponent(
            src
          )}`;

        return `src="${escapeAttribute(
          proxyUrl
        )}"`;
      }
    );
}
