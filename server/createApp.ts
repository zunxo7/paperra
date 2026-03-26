import express from "express";
import fetch from "node-fetch";
import adminRouter from "./adminRouter.ts";
import catalogRouter from "./catalogApi.ts";
import { finalUrlMatchesExpectedPastPaperPdf } from "./papaCambridgePdfResponse.ts";

/**
 * Express app with API routes only. Used by `server.ts` (local dev) and `api/index.ts` (Vercel).
 * Static assets are served separately by Vite in dev and by Vercel from `dist/` in production.
 */
export function createApp(): express.Express {
  const app = express();
  app.use(express.json());

  app.use("/api/catalog", catalogRouter);
  app.use("/api/admin", adminRouter);

  app.get("/api/proxy-pdf", async (req, res) => {
    const url = req.query.url as string;
    if (!url) return res.status(400).send("URL is required");

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Referer: "https://papers.xtremepape.rs/",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch from source: ${response.status} ${response.statusText}`);
      }

      const finalUrl = response.url || url;
      if (!finalUrlMatchesExpectedPastPaperPdf(url, finalUrl)) {
        throw new Error(
          "The URL redirected away from the past paper file (invalid or missing PDF on PapaCambridge)."
        );
      }

      const contentType = response.headers.get("content-type");
      if (contentType && !contentType.includes("pdf") && !url.toLowerCase().endsWith(".pdf")) {
        console.warn(`[PROXY-PDF] Unexpected content-type: ${contentType}`);
      }

      const buffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);

      if (
        uint8Array[0] !== 0x25 ||
        uint8Array[1] !== 0x50 ||
        uint8Array[2] !== 0x44 ||
        uint8Array[3] !== 0x46
      ) {
        throw new Error(
          "The source URL did not return a valid PDF file. It might be blocked or the link might be invalid."
        );
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.send(Buffer.from(uint8Array));
    } catch (error) {
      console.error("[PROXY_ERROR]", { url, error });
      res.status(500).send(`Error fetching PDF: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  });

  return app;
}
