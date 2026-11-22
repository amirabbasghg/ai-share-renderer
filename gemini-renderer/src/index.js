import { handleImage } from "./routes/image.js";
import { handleChat } from "./routes/chat.js";
import { handleGemini } from "./routes/gemini.js";
import { handlePdf } from "./routes/pdf.js";
import { handleRender } from "./routes/render.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /*
     * =========================================
     * POST /render
     * Render custom turns / transcripts (Bearer RENDER_TOKEN)
     * =========================================
     */

    if (url.pathname === "/render") {
      return handleRender(request, url, env);
    }

    /*
     * =========================================
     * GET /image?url=...
     * Proxy conversation images
     * =========================================
     */

    if (url.pathname === "/image") {
      return handleImage(url);
    }
    /*
     * =========================================
     * GET /pdf/{id}
     * Generate PDF from stored chat
     * =========================================
     */

    if (url.pathname.startsWith("/pdf/")) {
      return handlePdf(url, env, request);
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
