import { normalizeMediaUrl } from "../gemini/media.js";


/*
 * یک SVG خیلی کوچک به‌عنوان placeholder، تا وقتی منبع تصویر
 * واقعاً در دسترس نیست، هم مرورگر و هم Telegram Instant View
 * یک <img> معتبر داشته باشند و صفحه خراب/ناقص به نظر نرسد.
 */

const PLACEHOLDER_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">` +
  `<rect width="100%" height="100%" fill="#f1f3f4"/>` +
  `<text x="50%" y="50%" fill="#9aa0a6" font-family="sans-serif" ` +
  `font-size="20" text-anchor="middle" dominant-baseline="middle">` +
  `تصویر در دسترس نیست</text></svg>`;


function placeholderResponse() {
  return new Response(PLACEHOLDER_SVG, {
    status: 200,

    headers: {
      "Content-Type":
        "image/svg+xml; charset=utf-8",

      /*
       * cache کوتاه، تا اگر بعداً تصویر درست شد،
       * زود جایگزین شود.
       */
      "Cache-Control":
        "public, max-age=300",
    },
  });
}


async function fetchImageCandidate(candidateUrl) {
  return fetch(candidateUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",

      "Referer":
        "https://gemini.google.com/",

      "Accept":
        "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },

    redirect: "follow",
  });
}


export async function handleImage(url) {
  const rawImageUrl =
    url.searchParams.get("url");

  if (
    !rawImageUrl ||
    !/^https?:\/\//i.test(rawImageUrl)
  ) {
    return new Response(
      "Invalid image URL.",
      { status: 400 }
    );
  }

  /*
   * ترتیب candidateها:
   *
   * 1. URL نرمال‌شده (مثلاً lh3.googleusercontent.com برای
   *    لینک‌های ناقص lmdx که خودِ Gemini ۴۰۴ می‌دهند)
   * 2. خودِ URL اصلی
   */

  const normalizedUrl =
    normalizeMediaUrl(rawImageUrl);

  const candidates = [];

  if (
    normalizedUrl &&
    normalizedUrl !== rawImageUrl
  ) {
    candidates.push(normalizedUrl);
  }

  candidates.push(rawImageUrl);

  let lastStatus = 502;

  for (const candidate of candidates) {
    try {
      const imageResponse =
        await fetchImageCandidate(candidate);

      if (!imageResponse.ok) {
        lastStatus = imageResponse.status;
        continue;
      }

      const contentType =
        imageResponse.headers.get(
          "Content-Type"
        ) || "image/jpeg";

      /*
       * بعضی وقت‌ها Google به‌جای تصویر، HTML خطا برمی‌گرداند؛
       * در این حالت هم سراغ candidate بعدی / placeholder می‌رویم.
       */

      if (/^text\/html/i.test(contentType)) {
        lastStatus = 404;
        continue;
      }

      const headers =
        new Headers();

      headers.set(
        "Content-Type",
        contentType
      );

      headers.set(
        "Cross-Origin-Resource-Policy",
        "cross-origin"
      );

      headers.set(
        "Cache-Control",
        "public, max-age=86400"
      );

      return new Response(
        imageResponse.body,
        {
          status: 200,
          headers,
        }
      );

    } catch {
      /*
       * network error → candidate بعدی
       */

      lastStatus = 502;
      continue;
    }
  }

  /*
   * هیچ‌کدام از URLها جواب نداد.
   *
   * به‌جای ۴xx/۵xx خالی، placeholder برمی‌گردانیم تا:
   * - PDF ساخته شود (چون Chromium منتظر load/error است)
   * - Instant View بدون تصویر ناقص ساخته شود
   */

  return placeholderResponse();
}
