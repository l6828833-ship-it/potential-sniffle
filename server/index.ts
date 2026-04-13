import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { readFile } from "fs/promises";
import { apiRouter } from "./routes/api";
import { getSiteSettings } from "../db/queries";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache the base HTML so we only read from disk once
let _baseHtml: string | null = null;

async function getBaseHtml(staticPath: string): Promise<string> {
  if (_baseHtml) return _baseHtml;
  _baseHtml = await readFile(path.join(staticPath, "index.html"), "utf-8");
  return _baseHtml;
}

/**
 * Build the HTML to inject into <head> based on current site settings.
 * This runs server-side so Google's crawler sees the scripts in raw HTML.
 */
async function buildHeadInjection(): Promise<string> {
  try {
    const settings = await getSiteSettings();
    if (!settings) return "";

    const parts: string[] = [];

    // 1. Google AdSense auto-ads script (if publisher ID is set)
    if (settings.adsensePublisherId && settings.adsenseAutoAds) {
      parts.push(
        `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${settings.adsensePublisherId}" crossorigin="anonymous"></script>`
      );
    } else if (settings.adsensePublisherId) {
      // Publisher ID set but auto-ads off — still inject the script for verification
      parts.push(
        `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${settings.adsensePublisherId}" crossorigin="anonymous"></script>`
      );
    }

    // 2. Any custom header code saved via Code Injection page
    if (settings.headerCode) {
      parts.push(settings.headerCode);
    }

    return parts.join("\n    ");
  } catch {
    return "";
  }
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ── Middleware ──────────────────────────────────────────────────────────
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  // ── API Routes ──────────────────────────────────────────────────────────
  // All database operations go through /api — the React SPA calls these.
  app.use("/api", apiRouter);

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing — inject AdSense + header code into index.html
  // so Google's crawler sees the scripts in the raw HTML source (required for verification).
  app.get("*", async (_req, res) => {
    try {
      const baseHtml = await getBaseHtml(staticPath);
      const injection = await buildHeadInjection();

      const html = injection
        ? baseHtml.replace("</head>", `  ${injection}\n  </head>`)
        : baseHtml;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch {
      // Fallback: serve the file directly if anything goes wrong
      res.sendFile(path.join(staticPath, "index.html"));
    }
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`✅ Quizoi server running on http://localhost:${port}/`);
    console.log(`   API available at http://localhost:${port}/api`);
    if (!process.env.DATABASE_URL) {
      console.warn(
        "\n⚠️  WARNING: DATABASE_URL is not set. API routes will fail.\n" +
          "   Add it to your .env file before starting the server.\n",
      );
    }
  });
}

startServer().catch(console.error);
