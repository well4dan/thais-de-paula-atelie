// Utilitários HTTP compartilhados pelas rotas de clientes e da administradora (cookies, JSON, IP, rate limit)

import crypto from "node:crypto";

const rateBuckets = new Map();

export function checkRateLimit(key, limit = 10, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const entry = rateBuckets.get(key);
  if (!entry || entry.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  entry.count += 1;
  if (entry.count > limit) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

export function clearRateLimitsForTest() {
  rateBuckets.clear();
}

export function parseCookies(header = "") {
  const out = {};
  for (const part of String(header).split(";")) {
    const idx = part.indexOf("=");
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = "";
      }
    }
  }
  return out;
}

export function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    ...extraHeaders,
  });
  res.end(body);
}

export function applySecurityHeaders(res, pathname = "/") {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self' https://brasilapi.com.br https://viacep.com.br https://opencep.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://wa.me"
  );
  if (
    pathname.startsWith("/painel-tp") ||
    pathname.startsWith("/minha-conta") ||
    pathname.startsWith("/conta") ||
    pathname.startsWith("/api")
  ) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
  }
}

export async function readRawBody(req, maxBytes = 2 * 1024 * 1024) {
  if (req.readableEnded) {
    let text = "";
    if (Buffer.isBuffer(req.body)) text = req.body.toString("utf8");
    else if (typeof req.body === "string") text = req.body;
    else if (req.body && typeof req.body === "object") text = JSON.stringify(req.body);
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw Object.assign(new Error("Payload muito grande."), { status: 413, code: "PAYLOAD_TOO_LARGE" });
    }
    return text;
  }
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(Object.assign(new Error("Payload muito grande."), { status: 413, code: "PAYLOAD_TOO_LARGE" }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

export async function readJsonBody(req, maxBytes = 2 * 1024 * 1024) {
  const raw = await readRawBody(req, maxBytes);
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw Object.assign(new Error("JSON inválido na requisição."), { status: 400, code: "BAD_JSON" });
  }
}

export function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "127.0.0.1";
}

export function safeEqualStrings(a, b) {
  const bufA = Buffer.from(String(a || ""));
  const bufB = Buffer.from(String(b || ""));
  return bufA.length === bufB.length && bufA.length > 0 && crypto.timingSafeEqual(bufA, bufB);
}
