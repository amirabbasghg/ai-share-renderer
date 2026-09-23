import { nested } from "../utils/nested.js";

export const RPC_ID = "ujx1Bf";
export const GEMINI_HOST = "gemini.google.com";

export function decodeBatchExecute(text) {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line.startsWith("[[")) {
      continue;
    }

    let outer;

    try {
      outer = JSON.parse(line);
    } catch {
      continue;
    }

    if (!Array.isArray(outer)) {
      continue;
    }

    for (const row of outer) {
      if (
        Array.isArray(row) &&
        row.length >= 3 &&
        row[0] === "wrb.fr" &&
        row[1] === RPC_ID &&
        typeof row[2] === "string"
      ) {
        try {
          return JSON.parse(row[2]);
        } catch {
          throw new Error(
            "Gemini share RPC contained invalid nested JSON."
          );
        }
      }
    }
  }

  throw new Error(
    "Gemini share RPC response did not contain the expected payload."
  );
}

export function conversationRoot(payload) {
  const root = nested(payload, 0);

  if (
    !Array.isArray(root) ||
    root.length < 4
  ) {
    throw new Error(
      "Gemini public share payload shape is unsupported."
    );
  }

  if (!Array.isArray(nested(root, 1))) {
    throw new Error(
      "Gemini public share payload contained no turns."
    );
  }

  return root;
}

export async function fetchGeminiRpc(
  shareId,
  env
) {
  const response = await fetch(
    env.GEMINI_RPC_PROXY,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        shareId,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Gemini RPC proxy failed: HTTP ${response.status}`
    );
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(
      result.error ||
      "Gemini RPC proxy failed."
    );
  }

  if (
    result.status >= 300 &&
    result.status < 400
  ) {
    throw new Error(
      `Gemini RPC redirected: HTTP ${result.status} -> ${result.location}`
    );
  }

  return decodeBatchExecute(result.body);
}