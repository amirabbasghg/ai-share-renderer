// src/routes/image.js
// اگر عکس دانلود نشد، به‌جای 4xx/5xx یک PNG شفاف 1x1 برمی‌گردانیم
// تا Instant View به خاطر یک منبع خراب کل صفحه را رد نکند.

const TRANSPARENT_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
  ),
  (c) => c.charCodeAt(0)
);

function fallbackImage() {
  return new Response(TRANSPARENT_PNG, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=300",
    },
  });
}

function isBlockedImageHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "localhost.localdomain" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80:")
  ) {
    return true;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) {
      return true;
    }
  }

  return false;
}

export async function handleImage(url) {
  const imageUrl = url.searchParams.get("url");

  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    return new Response("Invalid image URL.", { status: 400 });
  }

  // placeholderهای Gemini قابل دانلود نیستند + جلوگیری از دسترسی به آدرس‌های داخلی
  try {
    const u = new URL(imageUrl);
    if (isBlockedImageHost(u.hostname)) {
      return new Response("Blocked image host.", { status: 400 });
    }
    if (
      u.hostname.toLowerCase() === "googleusercontent.com" ||
      /\/lmdx_/i.test(u.pathname)
    ) {
      return fallbackImage();
    }
  } catch {
    return fallbackImage();
  }

  try {
    const imageResponse = await fetch(imageUrl.replace(/^http:\/\//i, "https://"), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
        Referer: "https://gemini.google.com/",
      },
      redirect: "follow",
    });

    const type = imageResponse.headers.get("Content-Type") || "";

    if (!imageResponse.ok || !/^image\//i.test(type)) {
      return fallbackImage();
    }

    return new Response(imageResponse.body, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return fallbackImage();
  }
}
