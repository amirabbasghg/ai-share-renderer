import puppeteer from "@cloudflare/puppeteer";

interface Env {
  BROWSER: Fetcher;
}

export default {
  async fetch(
    request: Request,
    env: Env,
  ): Promise<Response> {
    const requestUrl = new URL(request.url);

    const targetUrl = requestUrl.searchParams.get("url");

    if (!targetUrl) {
      return new Response(
        "Use: /?url=https://share.gemini.google/...",
        {
          status: 400,
        },
      );
    }

    let browser;

    try {
      console.log("Opening browser...");

      browser = await puppeteer.launch(env.BROWSER);

      const page = await browser.newPage();

      console.log("Opening Gemini URL...");

      await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      console.log("Page loaded.");

      // کمی صبر برای اینکه JavaScript صفحه اجرا شود
      await new Promise((resolve) =>
        setTimeout(resolve, 3000),
      );

      const html = await page.content();

      const text = await page.$eval(
        "body",
        (element) => element.textContent ?? "",
      );

      return Response.json({
        success: true,
        finalUrl: page.url(),
        title: await page.title(),
        text,
        html,
      });

    } catch (error) {
      console.error(error);

      return Response.json(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : String(error),
        },
        {
          status: 500,
        },
      );

    } finally {
      if (browser) {
        console.log("Closing browser...");

        await browser.close();

        console.log("Browser closed.");
      }
    }
  },
} satisfies ExportedHandler<Env>;