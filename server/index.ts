import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { readFile } from "fs/promises";
import { apiRouter } from "./routes/api";
import {
  getSiteSettings,
  getPublishedQuizBySlug,
  getCategoryBySlug,
  getPublishedQuizzes,
  getAllCategories,
} from "../db/queries";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Constants ────────────────────────────────────────────────────────────────
const SITE_URL = process.env.SITE_URL || "https://quizoi.com";
const DEFAULT_TITLE = "Quizoi — Challenge Your Mind";
const DEFAULT_DESCRIPTION =
  "Test your knowledge with thousands of quizzes across 10+ categories. Science, history, music, sports, geography and more. Only the sharpest minds score 10/10.";
const DEFAULT_IMAGE = `${SITE_URL}/og-image.jpg`;

// ─── HTML Template Cache ──────────────────────────────────────────────────────
// Cache only the raw HTML file from disk. The final HTML is always built fresh
// per request so meta tags and AdSense injection are always up to date.
let _baseHtmlTemplate: string | null = null;

async function getBaseHtmlTemplate(staticPath: string): Promise<string> {
  if (_baseHtmlTemplate) return _baseHtmlTemplate;
  _baseHtmlTemplate = await readFile(
    path.join(staticPath, "index.html"),
    "utf-8"
  );
  return _baseHtmlTemplate;
}

// ─── SEO Meta Tag Builder ─────────────────────────────────────────────────────
/**
 * Returns the correct <title>, <meta>, <link rel="canonical">, and og: tags
 * for the given URL path, fetching quiz/category data from the DB when needed.
 *
 * WHY SERVER-SIDE:
 * Google's crawler reads raw HTML. It does not execute JavaScript. If meta tags
 * are set by React (document.title, react-helmet, useEffect), the crawler sees
 * the generic fallback title on every single page — making all pages look
 * identical in search results and destroying SEO.
 */
async function buildPageMeta(urlPath: string): Promise<{
  title: string;
  description: string;
  canonical: string;
  image: string;
  noindex: boolean;
}> {
  const canonical = `${SITE_URL}${urlPath.split("?")[0]}`;

  // ── Admin pages — block from indexing ──────────────────────────────────
  if (urlPath.startsWith("/admin")) {
    return {
      title: "Admin — Quizoi",
      description: "",
      canonical,
      image: DEFAULT_IMAGE,
      noindex: true,
    };
  }

  // ── Quiz question / reveal / result pages ──────────────────────────────
  // Pattern: /quiz/:slug/question/:n  |  /quiz/:slug/reveal/:n  |  /quiz/:slug/result
  const quizPageMatch = urlPath.match(/^\/quiz\/([^/]+)\/(question|reveal|result)/);
  if (quizPageMatch) {
    const slug = quizPageMatch[1];
    try {
      const quiz = await getPublishedQuizBySlug(slug);
      if (quiz) {
        const isResult = urlPath.includes("/result");
        const isReveal = urlPath.includes("/reveal/");
        const qNum = urlPath.match(/\/(question|reveal)\/(\d+)/)?.[2];
        let title = quiz.title;
        if (qNum && !isResult) {
          title = `${quiz.title} — Question ${qNum}`;
        } else if (isResult) {
          title = `Your Results: ${quiz.title}`;
        }
        return {
          title: `${title} | Quizoi`,
          description: quiz.description || DEFAULT_DESCRIPTION,
          canonical,
          image: quiz.thumbnailUrl || DEFAULT_IMAGE,
          noindex: false,
        };
      }
    } catch { /* fall through to default */ }
  }

  // ── Quiz start page ────────────────────────────────────────────────────
  // Pattern: /quiz/:slug/start
  const quizStartMatch = urlPath.match(/^\/quiz\/([^/]+)\/start$/);
  if (quizStartMatch) {
    const slug = quizStartMatch[1];
    try {
      const quiz = await getPublishedQuizBySlug(slug);
      if (quiz) {
        return {
          title: `${quiz.title} | Quizoi`,
          description: quiz.description || DEFAULT_DESCRIPTION,
          canonical,
          image: quiz.thumbnailUrl || DEFAULT_IMAGE,
          noindex: false,
        };
      }
    } catch { /* fall through */ }
  }

  // ── Category detail page ───────────────────────────────────────────────
  // Pattern: /category/:slug
  const categoryMatch = urlPath.match(/^\/category\/([^/]+)$/);
  if (categoryMatch) {
    const slug = categoryMatch[1];
    try {
      const cat = await getCategoryBySlug(slug);
      if (cat) {
        return {
          title: `${cat.name} Quizzes | Quizoi`,
          description:
            cat.description ||
            `Test your ${cat.name} knowledge with our collection of quizzes. How much do you really know?`,
          canonical,
          image: cat.imageUrl || DEFAULT_IMAGE,
          noindex: false,
        };
      }
    } catch { /* fall through */ }
  }

  // ── Static pages ───────────────────────────────────────────────────────
  const staticMeta: Record<string, { title: string; description: string }> = {
    "/": {
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
    },
    "/categories": {
      title: "All Quiz Categories | Quizoi",
      description:
        "Browse all quiz categories on Quizoi — Science, History, Geography, Sports, Entertainment, Technology and more.",
    },
    "/about": {
      title: "About Quizoi | Challenge Your Mind",
      description:
        "Learn about Quizoi — the quiz platform built for knowledge seekers. Thousands of quizzes across 10+ categories.",
    },
    "/contact": {
      title: "Contact Us | Quizoi",
      description: "Get in touch with the Quizoi team.",
    },
    "/privacy": {
      title: "Privacy Policy | Quizoi",
      description: "Read the Quizoi privacy policy.",
    },
    "/terms": {
      title: "Terms of Service | Quizoi",
      description: "Read the Quizoi terms of service.",
    },
  };

  const meta = staticMeta[urlPath] || {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  };

  return {
    title: meta.title,
    description: meta.description,
    canonical,
    image: DEFAULT_IMAGE,
    noindex: false,
  };
}

// ─── Head Injection Builder ───────────────────────────────────────────────────
/**
 * Builds the full <head> injection string combining:
 * 1. Dynamic SEO meta tags (title, description, canonical, og:)
 * 2. AdSense script (for Google verification and auto-ads)
 * 3. Custom header code from Admin → Code Injection
 */
async function buildHeadInjection(
  urlPath: string
): Promise<{ metaTags: string; scripts: string }> {
  const [pageMeta, settings] = await Promise.all([
    buildPageMeta(urlPath).catch(() => ({
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      canonical: `${SITE_URL}${urlPath}`,
      image: DEFAULT_IMAGE,
      noindex: false,
    })),
    getSiteSettings().catch(() => null),
  ]);

  // ── Meta tags ────────────────────────────────────────────────────────────
  const metaParts: string[] = [
    `  <title>${escapeHtml(pageMeta.title)}</title>`,
    `  <meta name="description" content="${escapeHtml(pageMeta.description)}" />`,
    `  <link rel="canonical" href="${escapeHtml(pageMeta.canonical)}" />`,
    pageMeta.noindex
      ? `  <meta name="robots" content="noindex, nofollow" />`
      : `  <meta name="robots" content="index, follow" />`,
    // Open Graph
    `  <meta property="og:title" content="${escapeHtml(pageMeta.title)}" />`,
    `  <meta property="og:description" content="${escapeHtml(pageMeta.description)}" />`,
    `  <meta property="og:url" content="${escapeHtml(pageMeta.canonical)}" />`,
    `  <meta property="og:image" content="${escapeHtml(pageMeta.image)}" />`,
    `  <meta property="og:type" content="website" />`,
    `  <meta property="og:site_name" content="${escapeHtml(settings?.siteName || "Quizoi")}" />`,
    // Twitter Card
    `  <meta name="twitter:card" content="summary_large_image" />`,
    `  <meta name="twitter:title" content="${escapeHtml(pageMeta.title)}" />`,
    `  <meta name="twitter:description" content="${escapeHtml(pageMeta.description)}" />`,
    `  <meta name="twitter:image" content="${escapeHtml(pageMeta.image)}" />`,
  ];

  // ── Scripts ──────────────────────────────────────────────────────────────
  const scriptParts: string[] = [];

  if (settings?.adsensePublisherId) {
    scriptParts.push(
      `  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${settings.adsensePublisherId}" crossorigin="anonymous"></script>`
    );
  }

  if (settings?.headerCode) {
    scriptParts.push(`  ${settings.headerCode}`);
  }

  return {
    metaTags: metaParts.join("\n"),
    scripts: scriptParts.join("\n"),
  };
}

// ─── Sitemap Generator ────────────────────────────────────────────────────────
async function generateSitemap(): Promise<string> {
  const [quizzes, cats] = await Promise.all([
    getPublishedQuizzes(1000),
    getAllCategories(),
  ]);

  const today = new Date().toISOString().split("T")[0];

  const staticUrls = [
    { loc: SITE_URL, priority: "1.0", changefreq: "daily" },
    { loc: `${SITE_URL}/categories`, priority: "0.9", changefreq: "weekly" },
    { loc: `${SITE_URL}/about`, priority: "0.5", changefreq: "monthly" },
    { loc: `${SITE_URL}/contact`, priority: "0.4", changefreq: "monthly" },
    { loc: `${SITE_URL}/privacy`, priority: "0.3", changefreq: "monthly" },
    { loc: `${SITE_URL}/terms`, priority: "0.3", changefreq: "monthly" },
  ];

  const categoryUrls = cats.map((cat) => ({
    loc: `${SITE_URL}/category/${cat.slug}`,
    priority: "0.8",
    changefreq: "weekly",
  }));

  const quizUrls = quizzes.map((q) => ({
    loc: `${SITE_URL}/quiz/${q.slug}/start`,
    priority: "0.7",
    changefreq: "weekly",
    lastmod: q.updatedAt
      ? new Date(q.updatedAt).toISOString().split("T")[0]
      : today,
  }));

  const allUrls = [...staticUrls, ...categoryUrls, ...quizUrls];

  const urlEntries = allUrls
    .map(
      (u) =>
        `  <url>\n    <loc>${u.loc}</loc>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>${
          "lastmod" in u ? `\n    <lastmod>${u.lastmod}</lastmod>` : `\n    <lastmod>${today}</lastmod>`
        }\n  </url>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>`;
}

// ─── HTML Escape Helper ───────────────────────────────────────────────────────
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─── Server Bootstrap ─────────────────────────────────────────────────────────
async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  // ── API Routes ─────────────────────────────────────────────────────────
  app.use("/api", apiRouter);

  // ── Static Assets ──────────────────────────────────────────────────────
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // ── robots.txt ─────────────────────────────────────────────────────────
  // Tells Google to crawl all public pages and block admin pages.
  app.get("/robots.txt", (_req, res) => {
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Cache-Control", "public, max-age=86400"); // cache 1 day
    res.send(
      [
        "User-agent: *",
        "Allow: /",
        "Disallow: /admin",
        "Disallow: /api/",
        "",
        `Sitemap: ${SITE_URL}/sitemap.xml`,
      ].join("\n")
    );
  });

  // ── sitemap.xml ────────────────────────────────────────────────────────
  // Dynamic sitemap listing all published quizzes and categories.
  // Submit this URL to Google Search Console: <your-domain>/sitemap.xml
  app.get("/sitemap.xml", async (_req, res) => {
    try {
      const xml = await generateSitemap();
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600"); // cache 1 hour
      res.send(xml);
    } catch (err) {
      console.error("[sitemap.xml]", err);
      res.status(500).send("Failed to generate sitemap");
    }
  });

  // ── SPA Catch-all with Server-Side SEO Injection ───────────────────────
  // Every HTML response gets:
  //   1. Correct <title> and <meta> tags for the specific page (for Google)
  //   2. AdSense <script> tag in <head> (for AdSense verification)
  //   3. Custom header code from Admin → Code Injection
  //
  // The base <title> and <meta> tags in index.html are replaced by the
  // server-injected ones so there is no duplication.
  app.get("*", async (req, res) => {
    try {
      const [template, { metaTags, scripts }] = await Promise.all([
        getBaseHtmlTemplate(staticPath),
        buildHeadInjection(req.path),
      ]);

      // Replace the static <title> and <meta description> in index.html
      // with the dynamic server-injected versions, then append scripts.
      let html = template
        // Remove static title tag
        .replace(/<title>[^<]*<\/title>/, "")
        // Remove static meta description
        .replace(/<meta\s+name="description"[^>]*>/i, "")
        // Remove static canonical (we inject the correct one)
        .replace(/<link\s+rel="canonical"[^>]*>/i, "")
        // Remove static og: tags (we inject correct ones)
        .replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, "")
        // Remove static robots meta if any
        .replace(/<meta\s+name="robots"[^>]*>/i, "")
        // Inject dynamic meta tags right after <head>
        .replace("<head>", `<head>\n${metaTags}`);

      // Inject scripts just before </head>
      if (scripts) {
        html = html.replace("</head>", `${scripts}\n  </head>`);
      }

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.send(html);
    } catch (err) {
      console.error("[HTML render]", err);
      res.sendFile(path.join(staticPath, "index.html"));
    }
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`✅ Quizoi server running on http://localhost:${port}/`);
    console.log(`   API available at http://localhost:${port}/api`);
    console.log(`   Sitemap: http://localhost:${port}/sitemap.xml`);
    console.log(`   Robots:  http://localhost:${port}/robots.txt`);
    if (!process.env.DATABASE_URL) {
      console.warn(
        "\n⚠️  WARNING: DATABASE_URL is not set. API routes will fail.\n" +
          "   Add it to your .env file before starting the server.\n"
      );
    }
  });
}

startServer().catch(console.error);
