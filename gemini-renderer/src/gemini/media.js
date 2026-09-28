// src/gemini/media.js
// مشکل اصلی: Gemini داخل payload آدرس‌های "placeholder" مثل
//   http://googleusercontent.com/lmdx_image/4190583835
// می‌گذارد که واقعاً قابل دانلود نیستند. قبلاً این‌ها هم به‌عنوان عکس
// گرفته می‌شدند و /image بعدش fail می‌شد ← alt متن "Gemini image" و
// خطای Resource fetch failed در Instant View.

function isPlaceholderUrl(raw) {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();

    // دامنه‌ی خالی googleusercontent.com (بدون lh3 / lh4 / ...) = placeholder
    if (host === "googleusercontent.com") return true;

    // هر مسیری که lmdx_ دارد placeholder است
    if (/\/lmdx_/i.test(u.pathname)) return true;

    return false;
  } catch {
    return true;
  }
}

function normalizeUrl(raw) {
  return raw.replace(/^http:\/\//i, "https://");
}

export function mediaFromValue(value) {
  const found = [];

  function visit(node) {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }

    if (node !== null && typeof node === "object") {
      for (const child of Object.values(node)) visit(child);
      return;
    }

    if (typeof node !== "string" || !/^https?:\/\//i.test(node)) {
      return;
    }

    if (isPlaceholderUrl(node)) {
      return;
    }

    const lowered = node.toLowerCase();

    if (
      lowered.includes("googleusercontent.com") ||
      /\.(png|jpe?g|webp|gif)([?#]|$)/i.test(node)
    ) {
      found.push({ type: "image", url: normalizeUrl(node) });
    } else if (/\.(mp4|webm)([?#]|$)/i.test(node)) {
      found.push({ type: "video", url: normalizeUrl(node) });
    }
  }

  visit(value);
  return found;
}
