// Rotas de Autenticação, Perfil, LGPD, E-commerce e Keep-Alive no PostgreSQL (Supabase)

import crypto from "node:crypto";
import {
  registerUser,
  authenticateUser,
  createSession,
  getSession,
  revokeSession,
  revokeAllUserSessions,
  getUserProfile,
  updateUserProfile,
  exportUserLgpdPackage,
  deleteAndAnonymizeUser,
  getFullStoreSnapshot,
  upsertProductInPg,
  deleteProductInPg,
  upsertCouponInPg,
  deleteCouponInPg,
  saveSettingsInPg,
  createOrderInPg,
  updateOrderStatusInPg,
  resetDemoInPg,
  uploadOrderAttachmentInPg,
  downloadOrderAttachmentInPg,
  getOrderAttachmentsForZipInPg,
  purgeOrderAttachmentsByOrderIdInPg,
  runExpiredAttachmentsPurgeInPg,
} from "./db.mjs";
import { buildZipBuffer } from "./zip.mjs";
import { pingKeepAlive } from "./pg-pool.mjs";
import {
  validateRegistration,
  validateProfileUpdate,
  TERMS_VERSION,
  LGPD_VERSION,
} from "./validators.mjs";

const COOKIE_NAME = "tp_session";
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

function parseCookies(header = "") {
  const out = {};
  for (const part of String(header).split(";")) {
    const idx = part.indexOf("=");
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  }
  return out;
}

function formatSessionCookie(token, maxAgeSec = 7 * 24 * 60 * 60) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    ...extraHeaders,
  });
  res.end(body);
}

async function readJsonBody(req, maxBytes = 2 * 1024 * 1024) {
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
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(Object.assign(new Error("JSON inválido na requisição."), { status: 400, code: "BAD_JSON" }));
      }
    });
    req.on("error", reject);
  });
}

function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "127.0.0.1";
}

function verifyCsrf(req, session) {
  const headerToken = req.headers["x-csrf-token"];
  if (!headerToken || typeof headerToken !== "string" || !session?.csrfToken) return false;
  const a = Buffer.from(headerToken);
  const b = Buffer.from(session.csrfToken);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function handleApiRequest(req, res, url) {
  const requestId = crypto.randomUUID();
  res.setHeader("X-Request-Id", requestId);
  const ip = getClientIp(req);
  const userAgent = req.headers["user-agent"] || "unknown";
  const cookies = parseCookies(req.headers.cookie);
  const rawSessionToken = cookies[COOKIE_NAME] || "";

  try {
    // 0. Keep-Alive Heartbeat para o Supabase não pausar
    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/v1/health/keep-alive") {
      const beat = await pingKeepAlive("http_endpoint");
      return sendJson(res, 200, { ok: true, database: "supabase_postgres", heartbeat: beat, requestId });
    }

    // 0.1 Snapshot e Sincronização da Loja com PostgreSQL
    if (req.method === "GET" && url.pathname === "/api/v1/store/snapshot") {
      const snap = await getFullStoreSnapshot();
      return sendJson(res, 200, { ...snap, requestId });
    }

    if (req.method === "POST" && url.pathname === "/api/v1/store/orders") {
      const body = await readJsonBody(req);
      const sess = await getSession(rawSessionToken);
      await createOrderInPg(body.order, sess ? sess.userId : null);
      return sendJson(res, 201, { ok: true, requestId });
    }

    if (req.method === "PATCH" && url.pathname === "/api/v1/store/orders/status") {
      const body = await readJsonBody(req);
      await updateOrderStatusInPg(body);
      return sendJson(res, 200, { ok: true, requestId });
    }

    if (req.method === "POST" && url.pathname === "/api/v1/store/products") {
      const body = await readJsonBody(req);
      await upsertProductInPg(body.product);
      return sendJson(res, 200, { ok: true, requestId });
    }

    if (req.method === "DELETE" && url.pathname === "/api/v1/store/products") {
      const body = await readJsonBody(req);
      await deleteProductInPg(body.id);
      return sendJson(res, 200, { ok: true, requestId });
    }

    if (req.method === "POST" && url.pathname === "/api/v1/store/coupons") {
      const body = await readJsonBody(req);
      await upsertCouponInPg(body.coupon);
      return sendJson(res, 200, { ok: true, requestId });
    }

    if (req.method === "DELETE" && url.pathname === "/api/v1/store/coupons") {
      const body = await readJsonBody(req);
      await deleteCouponInPg(body.code);
      return sendJson(res, 200, { ok: true, requestId });
    }

    if (req.method === "PUT" && url.pathname === "/api/v1/store/settings") {
      const body = await readJsonBody(req);
      await saveSettingsInPg(body.settings);
      return sendJson(res, 200, { ok: true, requestId });
    }

    if (req.method === "POST" && url.pathname === "/api/v1/store/reset") {
      await resetDemoInPg();
      const snap = await getFullStoreSnapshot();
      return sendJson(res, 200, { ...snap, requestId });
    }

    // 0.2 Upload de Imagens Originais dos Clientes para Artes (Retenção de 7 dias no Banco)
    if (req.method === "POST" && url.pathname === "/api/v1/store/attachments") {
      const body = await readJsonBody(req, 12 * 1024 * 1024);
      const attachment = await uploadOrderAttachmentInPg(body);
      return sendJson(res, 201, { ok: true, attachment, requestId });
    }

    // Download da Imagem Original pela Administradora (Exatamente como foi enviada)
    const downloadMatch = url.pathname.match(/^\/api\/v1\/store\/attachments\/([0-9a-fA-F-]{36})\/download$/);
    if (req.method === "GET" && downloadMatch) {
      const attId = downloadMatch[1];
      const rec = await downloadOrderAttachmentInPg(attId);
      if (!rec) {
        return sendJson(res, 404, { error: "Arquivo de imagem não encontrado.", requestId });
      }
      if (rec.purged_at || !rec.file_data) {
        return sendJson(res, 410, {
          error: "Esta imagem já foi apagada automaticamente do banco (prazo de 7 dias encerrado ou exclusão manual).",
          purgedAt: rec.purged_at,
          requestId,
        });
      }
      const prefix = rec.order_id ? `${rec.order_id}_` : "";
      const downloadName = `${prefix}${rec.file_name}`.replace(/"/g, "");
      const disposition = url.searchParams.get("inline") === "1" ? "inline" : "attachment";
      res.writeHead(200, {
        "Content-Type": rec.mime_type || "application/octet-stream",
        "Content-Length": String(rec.file_data.length),
        "Content-Disposition": `${disposition}; filename="${downloadName}"`,
        "Cache-Control": "private, no-store",
      });
      res.end(rec.file_data);
      return;
    }

    // Download de TODAS as imagens do pedido em um único arquivo .ZIP (+ LEIAME-PEDIDO.txt)
    const zipOrderMatch = url.pathname.match(/^\/api\/v1\/store\/orders\/([A-Za-z0-9-]+)\/attachments\.zip$/);
    if (req.method === "GET" && zipOrderMatch) {
      const orderId = zipOrderMatch[1];
      const { files } = await getOrderAttachmentsForZipInPg(orderId);
      if (!files.length) {
        return sendJson(res, 410, {
          error: "Nenhuma imagem disponível para este pedido (podem já ter sido apagadas após o prazo de 7 dias).",
          orderId,
          requestId,
        });
      }
      const zipBuf = buildZipBuffer(files);
      const safeZipName = `${orderId}-fotos-cliente.zip`.replace(/"/g, "");
      res.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Length": String(zipBuf.length),
        "Content-Disposition": `attachment; filename="${safeZipName}"`,
        "Cache-Control": "private, no-store",
      });
      res.end(zipBuf);
      return;
    }

    // Exclusão imediata das imagens de um pedido (pós-produção da arte)
    const purgeOrderMatch = url.pathname.match(/^\/api\/v1\/store\/orders\/([A-Za-z0-9-]+)\/attachments$/);
    if (req.method === "DELETE" && purgeOrderMatch) {
      const orderId = purgeOrderMatch[1];
      const purgedCount = await purgeOrderAttachmentsByOrderIdInPg(orderId);
      return sendJson(res, 200, { ok: true, orderId, purgedCount, requestId });
    }

    // Disparo manual ou agendado da limpeza de imagens vencidas (> 7 dias)
    if (req.method === "POST" && url.pathname === "/api/v1/store/attachments/purge-expired") {
      const purgedCount = await runExpiredAttachmentsPurgeInPg();
      return sendJson(res, 200, { ok: true, purgedCount, requestId });
    }

    // 1. POST /api/v1/auth/register
    if (req.method === "POST" && url.pathname === "/api/v1/auth/register") {
      const rl = checkRateLimit(`register:${ip}`, 8, 15 * 60 * 1000);
      if (!rl.allowed) {
        return sendJson(
          res,
          429,
          { code: "RATE_LIMITED", message: "Muitas tentativas de cadastro. Aguarde alguns minutos.", requestId },
          { "Retry-After": String(rl.retryAfterSec) }
        );
      }

      const body = await readJsonBody(req);
      if (body.website) {
        return sendJson(res, 400, { code: "BOT_DETECTED", message: "Solicitação inválida.", requestId });
      }

      const clean = validateRegistration(body);
      const user = await registerUser({ ...clean, ip, userAgent, requestId });
      const session = await createSession({ userId: user.id, ip, userAgent });

      return sendJson(
        res,
        201,
        {
          user,
          csrfToken: session.csrfToken,
          termsVersion: TERMS_VERSION,
          lgpdVersion: LGPD_VERSION,
          requestId,
        },
        { "Set-Cookie": formatSessionCookie(session.rawToken) }
      );
    }

    // 2. POST /api/v1/auth/login
    if (req.method === "POST" && url.pathname === "/api/v1/auth/login") {
      const rl = checkRateLimit(`login:${ip}`, 6, 15 * 60 * 1000);
      if (!rl.allowed) {
        return sendJson(
          res,
          429,
          { code: "RATE_LIMITED", message: "Muitas tentativas de login. Tente novamente em alguns minutos.", requestId },
          { "Retry-After": String(rl.retryAfterSec) }
        );
      }

      const body = await readJsonBody(req);
      const user = await authenticateUser({
        email: body.email,
        password: body.password,
        requestId,
      });

      if (!user) {
        return sendJson(res, 401, {
          code: "INVALID_CREDENTIALS",
          message: "E-mail ou senha inválidos.",
          requestId,
        });
      }

      if (rawSessionToken) await revokeSession(rawSessionToken);
      const session = await createSession({ userId: user.id, ip, userAgent });

      return sendJson(
        res,
        200,
        { user, csrfToken: session.csrfToken, requestId },
        { "Set-Cookie": formatSessionCookie(session.rawToken) }
      );
    }

    // 3. POST /api/v1/auth/logout
    if (req.method === "POST" && url.pathname === "/api/v1/auth/logout") {
      const current = await getSession(rawSessionToken);
      if (current) {
        if (url.searchParams.get("all") === "true") {
          await revokeAllUserSessions(current.userId);
        } else {
          await revokeSession(rawSessionToken);
        }
      }
      return sendJson(
        res,
        200,
        { ok: true, requestId },
        { "Set-Cookie": clearSessionCookie() }
      );
    }

    // Rotas autenticadas abaixo exigem sessão válida
    const session = await getSession(rawSessionToken);
    if (!session) {
      return sendJson(res, 401, {
        code: "UNAUTHENTICATED",
        message: "Sua sessão expirou ou você não está autenticado.",
        requestId,
      });
    }

    // 4. GET /api/v1/me
    if (req.method === "GET" && url.pathname === "/api/v1/me") {
      const user = await getUserProfile(session.userId);
      if (!user) {
        return sendJson(res, 401, { code: "UNAUTHENTICATED", message: "Conta não encontrada.", requestId });
      }
      return sendJson(res, 200, { user, csrfToken: session.csrfToken, requestId });
    }

    // Mutações exigem verificação de CSRF (Camada 8)
    if (!verifyCsrf(req, session)) {
      return sendJson(res, 403, {
        code: "CSRF_INVALID",
        message: "Token de segurança (CSRF) ausente ou inválido. Recarregue a página.",
        requestId,
      });
    }

    // 5. PUT /api/v1/me
    if (req.method === "PUT" && url.pathname === "/api/v1/me") {
      const body = await readJsonBody(req);
      const clean = validateProfileUpdate(body);
      const user = await updateUserProfile(session.userId, { ...clean, requestId });
      return sendJson(res, 200, { user, requestId });
    }

    // 6. POST /api/v1/me/export-lgpd
    if (req.method === "POST" && url.pathname === "/api/v1/me/export-lgpd") {
      const pkg = await exportUserLgpdPackage(session.userId, requestId);
      if (!pkg) return sendJson(res, 404, { code: "NOT_FOUND", message: "Conta não encontrada.", requestId });
      return sendJson(res, 200, { data: pkg, requestId });
    }

    // 7. DELETE /api/v1/me (Direito de eliminação / anonimização LGPD)
    if (req.method === "DELETE" && url.pathname === "/api/v1/me") {
      const body = await readJsonBody(req);
      const ok = await deleteAndAnonymizeUser({
        userId: session.userId,
        password: body.password || "",
        requestId,
      });
      if (!ok) {
        return sendJson(res, 403, {
          code: "INVALID_PASSWORD",
          message: "Senha atual incorreta. Não foi possível excluir a conta.",
          requestId,
        });
      }
      return sendJson(
        res,
        200,
        { ok: true, message: "Sua conta e seus dados pessoais foram excluídos conforme a LGPD.", requestId },
        { "Set-Cookie": clearSessionCookie() }
      );
    }

    return sendJson(res, 404, { code: "NOT_FOUND", message: "Endpoint não encontrado.", requestId });
  } catch (err) {
    const status = err.status || 500;
    return sendJson(res, status, {
      code: err.code || "INTERNAL_ERROR",
      message: status < 500 ? err.message : "Erro interno ao processar sua solicitação.",
      details: err.details || undefined,
      requestId,
    });
  }
}
