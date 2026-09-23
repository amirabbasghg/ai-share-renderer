import { resolveShareId } from "./resolveShare.js";
import {
  conversationRoot,
  fetchGeminiRpc,
} from "./rpc.js";
import { extractTurns } from "./turns.js";
import { nested, safeString } from "../utils/nested.js";

export async function extractGemini(sourceUrl, env) {
  const {
    shareId,
    canonicalUrl,
  } = await resolveShareId(sourceUrl);

  const payload =
    await fetchGeminiRpc(shareId, env);

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
    safeString(
      nested(root, 2, 1)
    ) ||
    "Gemini shared conversation";

  const returnedShareId =
    safeString(
      nested(root, 3)
    );

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
