import puppeteer from "@cloudflare/puppeteer";

export async function handlePdf(url, env) {
  const chatId =
    url.pathname
      .slice("/pdf/".length)
      .trim();

  if (!chatId) {
    return new Response(
      "Chat ID is required.",
      { status: 400 }
    );
  }

  const html =
    await env.GEMINI_CHATS.get(chatId);

  if (!html) {
    return new Response(
      "Chat not found.",
      { status: 404 }
    );
  }

  let browser;

  try {
    browser =
      await puppeteer.launch(
        env.BROWSER
      );

    const page =
      await browser.newPage();

    await page.setContent(
      html,
      {
        waitUntil: "networkidle0",
      }
    );

    const pdf =
      await page.pdf({
        format: "A4",

        printBackground: true,

        margin: {
          top: "15mm",
          right: "12mm",
          bottom: "15mm",
          left: "12mm",
        },
      });

    return new Response(pdf, {
      status: 200,

      headers: {
        "Content-Type":
          "application/pdf",

        "Content-Disposition":
          `inline; filename="gemini-${chatId}.pdf"`,

        "Cache-Control":
          "public, max-age=3600",
      },
    });

  } finally {

    if (browser) {
      await browser.close();
    }
  }
}