import express from "express";
import fs from "fs";
import fetch from "node-fetch";
import adminRouter from "./adminRouter.ts";
import catalogRouter from "./catalogApi.ts";
import { finalUrlMatchesExpectedPastPaperPdf } from "./papaCambridgePdfResponse.ts";

import { userRouter } from "./userRouter.ts";
import { topicFilterRouter } from "./topicFilterRouter.ts";

/**
 * Express app with API routes only. Used by `server.ts` (local dev & production on Render).
 * Static assets are served separately by Vite in dev and by Express from `dist/` in production.
 */

export function createApp(): express.Express {
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.use("/api/catalog", catalogRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/user", userRouter);
  app.use("/api/topics", topicFilterRouter);
  
  app.post("/api/debug", (req, res) => {
    try {
      fs.writeFileSync("debug.json", JSON.stringify(req.body, null, 2));
      res.send("OK");
    } catch (e) {
      console.error(e);
      res.status(500).send("Err");
    }
  });

  app.get("/api/proxy-pdf", async (req, res) => {
    const url = req.query.url as string;
    if (!url) return res.status(400).send("URL is required");

    try {
      let response = await fetch(url, {
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
      const isCambridgeOrg = url.toLowerCase().includes("cambridgeinternational.org");
      if (!isCambridgeOrg && !finalUrlMatchesExpectedPastPaperPdf(url, finalUrl)) {
        throw new Error(
          "The URL redirected away from the past paper file (invalid or missing PDF on PapaCambridge)."
        );
      }

      const contentType = response.headers.get("content-type");
      if (contentType && !contentType.includes("pdf") && !url.toLowerCase().endsWith(".pdf")) {
        console.warn(`[PROXY-PDF] Unexpected content-type: ${contentType}`);
      }

      let buffer = await response.arrayBuffer();
      let uint8Array = new Uint8Array(buffer);

      // If it's Cambridge International and looks like HTML ("<" starts the file)
      if (isCambridgeOrg && uint8Array[0] === 0x3C) {
        const text = new TextDecoder().decode(uint8Array);
        // Find href="/Images/697149-2026-syllabus.pdf"
        const match = text.match(/href="(\/Images\/[^"]+syllabus\.pdf)"/i);
        if (match) {
          const matchedUrl = `https://www.cambridgeinternational.org${match[1]}`;
          console.log(`[PROXY-PDF] Found syllabus link from webpage: ${matchedUrl}`);
          
          response = await fetch(matchedUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
          });
          if (!response.ok) throw new Error("Failed to fetch dynamically grabbed syllabus PDF");
          
          buffer = await response.arrayBuffer();
          uint8Array = new Uint8Array(buffer);
        } else {
          throw new Error("Could not find a syllabus PDF link on the provided Cambridge webpage.");
        }
      }

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

      const pdfBuffer = Buffer.from(uint8Array);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.send(pdfBuffer);
    } catch (error) {
      console.error("[PROXY_ERROR]", { url, error });
      res.status(500).send(`Error fetching PDF: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  });

  return app;
}
