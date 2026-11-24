// Ponto de entrada único da Vercel Serverless Function (/api/v1/*, /media/* e /health).
// Preserva o caminho original reescrito via vercel.json (__tp_route) sem expor arquivos internos.

import "../server/env.mjs";
import { handleApiRequest } from "../server/auth-routes.mjs";
import { applySecurityHeaders, sendJson } from "../server/http-utils.mjs";
import { serveMedia } from "../server/media.mjs";

function isAllowedTargetPath(pathname) {
  return pathname === "/health" || pathname.startsWith("/api/v1/") || pathname.startsWith("/media/");
}

function hasUnsafePathChars(raw) {
  return /\.\.|[\r\n\0\\]|%2e%2e/i.test(raw);
}

export function resolveVercelUrl(req) {
  const rawUrl = new URL(req?.url || "/", "https://localhost");
  if (isAllowedTargetPath(rawUrl.pathname)) {
    if (hasUnsafePathChars(rawUrl.pathname)) return null;
    return rawUrl;
  }

  if (rawUrl.pathname === "/api/index.mjs" || rawUrl.pathname === "/api/index") {
    const routes = rawUrl.searchParams.getAll("__tp_route");
    const route = routes[routes.length - 1] || "";
    if (!route || !route.startsWith("/") || hasUnsafePathChars(route)) return null;
    const cleanUrl = new URL(route, "https://localhost");
    if (!isAllowedTargetPath(cleanUrl.pathname)) return null;
    for (const [k, v] of rawUrl.searchParams) {
      if (k === "__tp_route") continue;
      cleanUrl.searchParams.append(k, v);
    }
    return cleanUrl;
  }

  return null;
}

export default async function handler(req, res) {
  const url = resolveVercelUrl(req);
  if (!url) {
    applySecurityHeaders(res, "/api/404");
    return sendJson(res, 404, { code: "NOT_FOUND", message: "Endpoint não encontrado." });
  }

  applySecurityHeaders(res, url.pathname);

  try {
    if (url.pathname === "/health" && (req.method === "GET" || req.method === "HEAD")) {
      return sendJson(res, 200, { status: "ok", runtime: "vercel" });
    }

    const mediaMatch = url.pathname.match(/^\/media\/([0-9a-f]{64})\.webp$/);
    if (mediaMatch && (req.method === "GET" || req.method === "HEAD")) {
      try {
        await serveMedia(req, res, mediaMatch[1]);
      } catch {
        if (!res.headersSent) {
          res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
          res.end("Imagem indisponível no momento");
        }
      }
      return;
    }

    if (url.pathname.startsWith("/api/v1/")) {
      await handleApiRequest(req, res, url);
      return;
    }

    return sendJson(res, 404, { code: "NOT_FOUND", message: "Endpoint não encontrado." });
  } catch (err) {
    process.stderr.write(`[vercel-api] ${err?.stack || err?.message || err}\n`);
    if (!res.headersSent) {
      return sendJson(res, err?.status || 500, {
        code: err?.code || "INTERNAL_ERROR",
        message: "Erro interno no servidor.",
      });
    }
  }
}
