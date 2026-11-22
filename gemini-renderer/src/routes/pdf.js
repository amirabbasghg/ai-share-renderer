// Stripped for Node.js runtime: Cloudflare Workers Browser Rendering binding is unavailable locally
// import puppeteer from "@cloudflare/puppeteer";
import katex from "katex";


export function renderLatexForPdf(
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


export function prepareHtmlForPdf(
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


function injectPrintToolbar(pdfHtml, chatId) {
  const safeChatId = encodeURIComponent(chatId);
  const toolbarStyle = `
<style>
  .pdf-print-toolbar {
    position: sticky;
    top: 0;
    z-index: 50;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 18px;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
    direction: ltr;
    font-family: "Vazirmatn", system-ui, -apple-system, sans-serif;
  }
  .pdf-print-toolbar-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .pdf-print-btn {
    background: #2563eb;
    color: #ffffff;
    border: none;
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 0.9rem;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
  }
  .pdf-print-btn:hover { background: #1d4ed8; }
  .pdf-print-link {
    display: inline-block;
    padding: 7px 12px;
    border-radius: 8px;
    border: 1px solid #cbd5e1;
    background: #ffffff;
    color: #1f2937;
    font-size: 0.88rem;
    font-weight: 500;
    text-decoration: none;
  }
  .pdf-print-link:hover { background: #f1f5f9; text-decoration: none; }
  .pdf-print-hint {
    font-size: 0.84rem;
    color: #4b5563;
  }
  @media print {
    .pdf-print-toolbar { display: none !important; }
  }
</style>`;

  const toolbarHtml = `
<div class="pdf-print-toolbar" role="region" aria-label="PDF print controls">
  <span class="pdf-print-hint">KaTeX Print / PDF View</span>
  <div class="pdf-print-toolbar-actions">
    <a class="pdf-print-link" href="/chat/${safeChatId}">Instant View</a>
    <a class="pdf-print-link" href="/">Home</a>
    <button type="button" class="pdf-print-btn" onclick="window.print()">Print / Save as PDF</button>
  </div>
</div>`;

  let out = pdfHtml;
  if (/<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, `${toolbarStyle}</head>`);
  } else {
    out = `${toolbarStyle}${out}`;
  }
  if (/<body([^>]*)>/i.test(out)) {
    out = out.replace(/<body([^>]*)>/i, `<body$1>${toolbarHtml}`);
  } else {
    out = `${toolbarHtml}${out}`;
  }
  return out;
}


function extractTitleFromHtml(html) {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!match || !match[1]) return "";
  return match[1]
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function buildContentDisposition(title, chatId) {
  const fallbackName = `chat-${chatId}.pdf`;
  const cleanTitle = (title || "")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 80);

  if (!cleanTitle) {
    return `inline; filename="${fallbackName}"`;
  }

  const asciiName =
    cleanTitle.replace(/[^\x20-\x7E]/g, "").replace(/["\\;]/g, "").trim() ||
    `chat-${chatId}`;

  return `inline; filename="${asciiName}.pdf"; filename*=UTF-8''${encodeURIComponent(`${cleanTitle}.pdf`)}`;
}

async function launchBrowser(browserBinding) {
  if (typeof browserBinding?.launch === "function") {
    return browserBinding.launch();
  }
  const mod = await import("@cloudflare/puppeteer");
  const puppeteer = mod.default || mod;
  return puppeteer.launch(browserBinding);
}

export async function handlePdf(
  url,
  env,
  request
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


  const baseUrl =
    `${url.protocol}//${url.host}`;


  const pdfHtml =
    prepareHtmlForPdf(
      html,
      baseUrl
    );


  if (url.searchParams.get("format") === "html") {
    return new Response(pdfHtml, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=UTF-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }


  if (!env?.BROWSER) {
    const accept = String(request?.headers?.get("accept") || "");
    if (accept.includes("text/html")) {
      return new Response(injectPrintToolbar(pdfHtml, chatId), {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=UTF-8",
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    return new Response(
      `PDF binary generation requires Cloudflare Browser Rendering (unavailable in local Node.js runtime). Open /pdf/${chatId}?format=html or /chat/${chatId} and use browser Print to PDF.`,
      {
        status: 501,
        headers: {
          "Content-Type": "text/plain; charset=UTF-8",
        },
      }
    );
  }


  let browser;


  try {

    browser =
      await launchBrowser(env.BROWSER);


    const page =
      await browser.newPage();


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
     * اطمینان از بارگیری کامل فونت‌ها
     * و دو frame برای تکمیل rendering
     */

    await page.evaluate(
      async () => {
        if (document.fonts && document.fonts.ready) {
          await document.fonts.ready;
        }

        await new Promise(
          (resolve) =>
            requestAnimationFrame(
              () =>
                requestAnimationFrame(
                  resolve
                )
            )
        );
      }
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


    const title = extractTitleFromHtml(html);

    return new Response(
      pdf,
      {
        status: 200,

        headers: {
          "Content-Type":
            "application/pdf",

          "Content-Disposition":
            buildContentDisposition(title, chatId),

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