import { handleImage } from "./routes/image.js";
import { handleChat } from "./routes/chat.js";
import { handleGemini } from "./routes/gemini.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /*
     * =========================================
     * GET /image?url=...
     * Proxy Gemini images
     * =========================================
     */

    if (url.pathname === "/image") {
      return handleImage(url);
    }

    /*
     * =========================================
     * GET /chat/{id}
     * =========================================
     */

    if (url.pathname.startsWith("/chat/")) {
      return handleChat(url, env);
    }

    /*
     * =========================================
     * GET /?url=...
     * =========================================
     */

    return handleGemini(url, env);
  },
};
