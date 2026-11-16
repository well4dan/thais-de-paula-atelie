// Servidor de Produção Thaís de Paula Ateliê (Estáticos + API /api/v1/* + Cabeçalhos de Segurança)

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { handleApiRequest } from "./server/auth-routes.mjs";
import { ensureDatabaseReady, pingKeepAlive } from "./server/pg-pool.mjs";
import { serveMedia } from "./server/media.mjs";
import { getPublicSiteContent } from "./server/site-content.mjs";

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 8080);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

const FORBIDDEN_PREFIXES = ["/server", "/data", "/supabase", "/tests", "/docs", "/scripts", "/node_modules", "/.git", "/.env"];

function setSecurityHeaders(res, pathname) {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://wa.me"
  );
  if (pathname.startsWith("/painel-tp") || pathname.startsWith("/minha-conta") || pathname.startsWith("/conta")) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
  }
}

// Páginas que recebem banners e popup (as demais públicas recebem só as faixas promocionais)
const BANNER_PAGES = new Set(["/index.html", "/loja.html"]);
const CONTENT_TIMEOUT_MS = 4000;

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms).unref())]);
}

// Injeta o conteúdo ativo do painel como JSON (não executável, a CSP segue sem 'unsafe-inline').
// Sem banco ou com lentidão, a página sai com o conteúdo padrão do HTML.
async function injectSiteContent(html, pagePath) {
  const content = await withTimeout(getPublicSiteContent().catch(() => null), CONTENT_TIMEOUT_MS);
  if (!content) return html;
  const withBanners = BANNER_PAGES.has(pagePath);
  const payload = {
    announcements: content.announcements,
    banners: withBanners ? content.banners : { topo: [], meio: [], popup: null },
  };
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  let head = `<script type="application/json" id="site-content">${json}</script>\n`;
  const firstHero = pagePath === "/index.html" ? payload.banners.topo[0] : null;
  let out = html;
  if (firstHero) {
    head = `<link rel="preload" as="image" href="${firstHero.imageUrl}" fetchpriority="high">\n${head}`;
    out = out.replace(/<html([^>]*)>/, (m, attrs) => `<html${attrs} data-hero-banner="">`);
  }
  // Função como substituição: o texto do conteúdo pode ter "$&" / "$'" (ex.: "R$'"), que o replace interpretaria
  return out.replace("</head>", () => `${head}</head>`);
}

export function createAppServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    setSecurityHeaders(res, url.pathname);

    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      await handleApiRequest(req, res, url);
      return;
    }

    const mediaMatch = url.pathname.match(/^\/media\/([0-9a-f]{64})\.webp$/);
    if (mediaMatch && (req.method === "GET" || req.method === "HEAD")) {
      try {
        await serveMedia(req, res, mediaMatch[1]);
      } catch {
        res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
        res.end("Imagem indisponível no momento");
      }
      return;
    }

    // Bloqueia acesso a pastas internas de servidor/banco
    const decoded = decodeURIComponent(url.pathname);
    if (
      decoded.includes("..") ||
      FORBIDDEN_PREFIXES.some((p) => decoded === p || decoded.startsWith(`${p}/`)) ||
      decoded === "/server.mjs" ||
      decoded === "/package.json"
    ) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Não encontrado");
      return;
    }

    let relPath = decoded.endsWith("/") ? `${decoded}index.html` : decoded;
    let filePath = path.join(ROOT, relPath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      const indexCandidate = path.join(filePath, "index.html");
      if (fs.existsSync(indexCandidate)) {
        filePath = indexCandidate;
      } else {
        const notFoundPage = path.join(ROOT, "404.html");
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
        res.end(fs.existsSync(notFoundPage) ? fs.readFileSync(notFoundPage) : "404");
        return;
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || "application/octet-stream";
    const cache = [".woff2", ".webp", ".png", ".jpg", ".svg", ".ico"].includes(ext)
      ? "public, max-age=604800"
      : "no-cache";

    const pagePath = `/${path.relative(ROOT, filePath).split(path.sep).join("/")}`;
    if (ext === ".html" && !pagePath.startsWith("/painel-tp/")) {
      const html = await injectSiteContent(fs.readFileSync(filePath, "utf8"), pagePath);
      res.writeHead(200, { "Content-Type": mime, "Cache-Control": cache });
      res.end(html);
      return;
    }

    res.writeHead(200, { "Content-Type": mime, "Cache-Control": cache });
    fs.createReadStream(filePath).pipe(res);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(ROOT, "server.mjs")) {
  const server = createAppServer();
  ensureDatabaseReady()
    .then(() => {
      // Keep-alive automático a cada 6 horas para o Supabase nunca pausar
      setInterval(() => {
        pingKeepAlive("server_interval_6h").catch(() => {});
      }, 6 * 60 * 60 * 1000).unref();

      server.listen(PORT, "0.0.0.0", () => {
        process.stdout.write(`Thaís de Paula Ateliê (Servidor + Supabase PostgreSQL + Keep-Alive) ativo em http://localhost:${PORT}\n`);
      });
    })
    .catch((err) => {
      process.stderr.write(`Falha ao inicializar banco: ${err.message}\n`);
      process.exit(1);
    });
}
