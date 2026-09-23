const RPC_ID = "ujx1Bf";
const GEMINI_HOST = "gemini.google.com";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  try {
    const body = req.body;

    if (!body?.shareId) {
      return res.status(400).json({
        success: false,
        error: "shareId is required",
      });
    }

    const shareId = body.shareId;

    if (!/^[A-Za-z0-9_-]{6,128}$/.test(shareId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid shareId",
      });
    }

    const innerRequest = JSON.stringify([
      null,
      shareId,
      [4],
    ]);

    const fReq = JSON.stringify([
      [
        [
          RPC_ID,
          innerRequest,
          null,
          "generic",
        ],
      ],
    ]);

    const query = new URLSearchParams({
      rpcids: RPC_ID,
      "source-path": `/share/${shareId}`,
      hl: "en-US",
      rt: "c",
    });

    const endpoint =
      `https://${GEMINI_HOST}/_/BardChatUi/data/batchexecute?${query}`;

    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded;charset=UTF-8",

        "Accept":
          "application/json",

        "X-Same-Domain":
          "1",

        "Referer":
          `https://${GEMINI_HOST}/`,

        "User-Agent":
          "ShareXtract/0.23.0 (+https://github.com/wuaishare/sharextract)",
      },

      body: new URLSearchParams({
        "f.req": fReq,
      }),
    });

    const text = await response.text();

    return res.status(200).json({
      success: true,
      status: response.status,
      location:
        response.headers.get("location"),
      body: text,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || String(error),
    });
  }
}