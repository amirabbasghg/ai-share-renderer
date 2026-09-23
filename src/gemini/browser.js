import puppeteer from "@cloudflare/puppeteer";

const RPC_ID = "ujx1Bf";

const RESPONSE_TIMEOUT = 30000;

function isGeminiRpcUrl(url) {
  if (
    !url.includes(
      "/_/BardChatUi/data/batchexecute"
    )
  ) {
    return false;
  }

  try {
    const parsed = new URL(url);

    const rpcIds =
      parsed.searchParams.get("rpcids");

    return (
      rpcIds
        ?.split(",")
        .includes(RPC_ID) === true
    );
  } catch {
    return false;
  }
}

function extractShareIdFromRpcUrl(url) {
  try {
    const parsed =
      new URL(url);

    const sourcePath =
      parsed.searchParams.get(
        "source-path"
      );

    if (!sourcePath) {
      return null;
    }

    const match =
      sourcePath.match(
        /^\/share\/([A-Za-z0-9_-]{6,128})$/
      );

    return match
      ? match[1]
      : null;
  } catch {
    return null;
  }
}

export async function extractGeminiWithBrowser(
  sourceUrl,
  env,
  decodeBatchExecute
) {
  const browser =
    await puppeteer.launch(
      env.BROWSER
    );

  try {
    const page =
      await browser.newPage();

    const responsePromise =
      page.waitForResponse(
        (response) =>
          isGeminiRpcUrl(
            response.url()
          ),
        {
          timeout:
            RESPONSE_TIMEOUT,
        }
      );

    await page.goto(
      sourceUrl,
      {
        waitUntil:
          "domcontentloaded",

        timeout:
          RESPONSE_TIMEOUT,
      }
    );

    const response =
      await responsePromise;

    const rpcUrl =
      response.url();

    const shareId =
      extractShareIdFromRpcUrl(
        rpcUrl
      );

    if (!shareId) {
      throw new Error(
        "Gemini RPC response did not contain a valid share ID."
      );
    }

    const responseText =
      await response.text();

    const payload =
      decodeBatchExecute(
        responseText
      );

    return {
      payload,
      shareId,
      canonicalUrl:
        `https://gemini.google.com/share/${shareId}`,
    };

  } finally {
    await browser.close();
  }
}