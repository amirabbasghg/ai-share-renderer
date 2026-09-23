export async function handleImage(url) {
  const imageUrl =
    url.searchParams.get("url");

  if (
    !imageUrl ||
    !/^https?:\/\//i.test(imageUrl)
  ) {
    return new Response(
      "Invalid image URL.",
      { status: 400 }
    );
  }

  try {
    const imageResponse =
      await fetch(imageUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",

          "Referer":
            "https://gemini.google.com/",
        },
      });

    if (!imageResponse.ok) {
      return new Response(
        "Image could not be fetched.",
        {
          status:
            imageResponse.status,
        }
      );
    }

    const headers =
      new Headers();

    headers.set(
      "Content-Type",
      imageResponse.headers.get(
        "Content-Type"
      ) || "image/jpeg"
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

  } catch (error) {
    return new Response(
      "Image proxy failed.",
      { status: 502 }
    );
  }
}
