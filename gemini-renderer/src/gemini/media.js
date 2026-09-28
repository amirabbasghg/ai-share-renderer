/*
 * URLهای lmdx که Gemini با host برهنهٔ googleusercontent.com
 * برمی‌گرداند، هیچ‌وقت مستقیم سرو نمی‌شوند (۴۰۴ قطعی).
 * برای این‌ها از همان ابتدا آدرس lh3.googleusercontent.com را
 * در HTML می‌گذاریم تا PDF و Instant View منتظر منبع شکست‌خورده
 * نمانند.
 */

const LMDX_BARE_HOSTS = [
  "googleusercontent.com",
  "www.googleusercontent.com",
];

export function normalizeMediaUrl(rawUrl) {
  let parsed;

  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  const host = parsed.hostname.toLowerCase();

  if (!LMDX_BARE_HOSTS.includes(host)) {
    return rawUrl;
  }

  /*
   * فقط مسیرهای lmdx_* که شکل مشخصی دارند:
   * /lmdx_image/<id> یا /lmdx_file/<id>
   */

  if (!/^\/lmdx_[a-z]+\/[^/?#]+/i.test(parsed.pathname)) {
    return rawUrl;
  }

  parsed.protocol = "https:";
  parsed.hostname = "lh3.googleusercontent.com";

  return parsed.toString();
}

export function mediaFromValue(value) {
  const found = [];

  function visit(node) {
    if (
      Array.isArray(node)
    ) {
      for (
        const child of node
      ) {
        visit(child);
      }

      return;
    }

    if (
      node !== null &&
      typeof node === "object"
    ) {
      for (
        const child of Object.values(node)
      ) {
        visit(child);
      }

      return;
    }

    if (
      typeof node !== "string" ||
      !node.startsWith("http")
    ) {
      return;
    }

    const lowered =
      node.toLowerCase();

    if (
      lowered.includes(
        "googleusercontent.com"
      ) ||
      /\.(png|jpe?g|webp|gif)([?#]|$)/i.test(
        node
      )
    ) {
      found.push({
        type: "image",
        url: node,
      });

    } else if (
      /\.(mp4|webm)([?#]|$)/i.test(node)
    ) {
      found.push({
        type: "video",
        url: node,
      });
    }
  }

  visit(value);

  return found;
}
