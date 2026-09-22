import { resolveShareId } from "./resolveShare.js";
import {
  RPC_ID,
  GEMINI_HOST,
  decodeBatchExecute,
  conversationRoot,
} from "./rpc.js";
import { extractTurns } from "./turns.js";
import { nested, safeString } from "../utils/nested.js";


export async function extractGemini(sourceUrl) {
  const { shareId, canonicalUrl } =
    await resolveShareId(sourceUrl);

  const innerRequest = JSON.stringify(
    [null, shareId, [4]]
  );

  const fReq = JSON.stringify([
    [[RPC_ID, innerRequest, null, "generic"]]
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

  if (!response.ok) {
    throw new Error(
      `Gemini RPC failed: HTTP ${response.status}`
    );
  }

  const responseText =
    await response.text();

  const payload =
    decodeBatchExecute(responseText);

  const root =
    conversationRoot(payload);

  const conversation =
    extractTurns(root);

  if (
    conversation.messages.length === 0
  ) {
    throw new Error(
      "Gemini public share returned no readable messages."
    );
  }

  const title =
    safeString(nested(root, 2, 1)) ||
    "Gemini shared conversation";

  const returnedShareId =
    safeString(nested(root, 3));

  if (
    returnedShareId &&
    returnedShareId !== shareId
  ) {
    throw new Error(
      "Gemini share response ID did not match the requested share."
    );
  }

  return {
    sourceUrl,
    canonicalUrl,
    shareId,
    title,
    messages:
      conversation.messages,
    turns:
      conversation.turnMetadata,
    media:
      conversation.media,
  };
}
