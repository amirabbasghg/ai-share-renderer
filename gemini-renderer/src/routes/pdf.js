import puppeteer from "@cloudflare/puppeteer";
import katex from "katex";


function renderLatexForPdf(
  html
) {
  return html.replace(
    /<(span|div)([^>]*class="math-(?:inline|display)"[^>]*)data-latex="([^"]*)"([^>]*)>([\s\S]*?)<\/\1>/gi,
    (
      full,
      tag,
      before,
      encodedLatex,
      after,
      fallback
    ) => {

      let latex;

      try {
        latex =
          decodeURIComponent(
            encodedLatex
          );
      } catch {
        return full;
      }


      const isInline =
        tag === "span";


      try {
        /*
         * اگر KaTeX خطا بدهد، به fallback
         * خودمان برمی‌گردیم و اجازه نمی‌دهیم
         * KaTeX خروجی قرمز تولید کند.
         */

        const mathml =
          katex.renderToString(
            latex,
            {
              throwOnError:
                true,

              strict:
                false,

              output:
                "mathml",

              displayMode:
                !isInline,
            }
          );


        /*
         * Inline:
         *
         * نباید وسط جمله به خط بعد
         * منتقل شود یا چند خطی شود.
         */

        if (isInline) {
          return `
<span
  class="pdf-math-inline"
  style="
    display: inline-block;
    white-space: nowrap;
    vertical-align: middle;
  "
>
  ${mathml}
</span>
`;
        }


        /*
         * Display math:
         *
         * همچنان به صورت یک بلوک
         * جدا نمایش داده شود.
         */

        return `
<div
  class="pdf-math-display"
  style="
    display: block;
    text-align: center;
    margin: 0.5em 0;
  "
>
  ${mathml}
</div>
`;

      } catch {

        /*
         * اگر LaTeX توسط KaTeX پشتیبانی نشد،
         * همان خروجی semantic renderer خودمان
         * را نگه می‌داریم.
         *
         * مهم:
         * اینجا دیگر خروجی قرمز KaTeX نداریم.
         */

        if (isInline) {
          return `
<span
  class="pdf-math-inline"
  style="
    display: inline-block;
    white-space: nowrap;
    vertical-align: middle;
  "
>
  ${fallback}
</span>
`;
        }


        return `
<div
  class="pdf-math-display"
  style="
    display: block;
    text-align: center;
    margin: 0.5em 0;
  "
>
  ${fallback}
</div>
`;
      }
    }
  );
}


function prepareHtmlForPdf(
  html,
  baseUrl
) {
  /*
   * relative URLs مثل:
   *
   * /image?url=...
   *
   * را به Worker اصلی وصل می‌کنیم.
   */

  const baseTag =
    `<base href="${baseUrl}/">`;


  /*
   * عکس‌های lazy را eager می‌کنیم
   * تا Chromium قبل از ساخت PDF
   * آن‌ها را واقعاً دانلود کند.
   */

  let prepared =
    html.replace(
      /<link\b[^>]*>\s*/gi,
      (tag) => tag
    );


  prepared =
    prepared.replace(
      /\sloading\s*=\s*["']lazy["']/gi,
      ""
    );


  /*
   * LaTeX → MathML
   */

  prepared =
    renderLatexForPdf(
      prepared
    );


  /*
   * Base URL
   */

  if (
    /<head[\s>]/i.test(
      prepared
    )
  ) {
    prepared =
      prepared.replace(
        /<head([^>]*)>/i,
        `<head$1>${baseTag}`
      );

  } else {
    prepared =
      `${baseTag}${prepared}`;
  }


  return prepared;
}


async function waitForImages(
  page
) {
  await page.evaluate(
    async () => {
      const images =
        Array.from(
          document.images
        );


      await Promise.all(
        images.map(
          (image) => {

            if (
              image.complete &&
              image.naturalWidth > 0
            ) {
              return Promise.resolve();
            }


            return new Promise(
              (resolve) => {

                const done =
                  () => {
                    image.removeEventListener(
                      "load",
                      done
                    );

                    image.removeEventListener(
                      "error",
                      done
                    );

                    resolve();
                  };


                image.addEventListener(
                  "load",
                  done
                );


                image.addEventListener(
                  "error",
                  done
                );
              }
            );
          }
        )
      );
    }
  );
}


export async function handlePdf(
  url,
  env
) {
  const chatId =
    url.pathname
      .slice(
        "/pdf/".length
      )
      .trim();


  if (!chatId) {
    return new Response(
      "Chat ID is required.",
      {
        status: 400,
      }
    );
  }


  const html =
    await env.GEMINI_CHATS.get(
      chatId
    );


  if (!html) {
    return new Response(
      "Chat not found.",
      {
        status: 404,
      }
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


    /*
     * Worker public URL
     *
     * مثلاً:
     * https://gemini-renderer.hsynysydamyrbas.workers.dev
     */

    const baseUrl =
      `${url.protocol}//${url.host}`;


    const pdfHtml =
      prepareHtmlForPdf(
        html,
        baseUrl
      );


    await page.setContent(
      pdfHtml,
      {
        waitUntil:
          "networkidle0",
      }
    );


    /*
     * صبر برای عکس‌ها
     */

    await waitForImages(
      page
    );


    /*
     * دو frame برای تکمیل
     * rendering مرورگر
     */

    await page.evaluate(
      () =>
        new Promise(
          (resolve) =>
            requestAnimationFrame(
              () =>
                requestAnimationFrame(
                  resolve
                )
            )
        )
    );


    const pdf =
      await page.pdf({
        format:
          "A4",

        printBackground:
          true,

        preferCSSPageSize:
          false,

        margin: {
          top:
            "15mm",

          right:
            "12mm",

          bottom:
            "15mm",

          left:
            "12mm",
        },
      });


    return new Response(
      pdf,
      {
        status: 200,

        headers: {
          "Content-Type":
            "application/pdf",

          "Content-Disposition":
            `inline; filename="gemini-${chatId}.pdf"`,

          "Cache-Control":
            "public, max-age=3600",
        },
      }
    );

  } catch (error) {

    return new Response(
      `PDF generation failed: ${
        error?.message ||
        String(error)
      }`,
      {
        status: 500,
      }
    );

  } finally {

    if (browser) {
      await browser.close();
    }
  }
}