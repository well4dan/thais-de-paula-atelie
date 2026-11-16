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
  getPublicStoreSnapshot,
  getOrderTrackingInPg,
  getUserOrdersInPg,
  createOrderInPg,
  processPaymentWebhookInPg,
  uploadOrderAttachmentInPg,
  validateCouponEligibilityInPg,
} from "./db.mjs";
import { ensureDatabaseReady, pool } from "./pg-pool.mjs";
import { verifyWebhookAuth, normalizeWebhookPayload } from "./payments.mjs";
import { calculateShippingQuote } from "./shipping-loggi.mjs";
import { handleAdminRequest } from "./admin-routes.mjs";
import { pingKeepAlive } from "./pg-pool.mjs";
import {
  validateRegistration,
  validateProfileUpdate,
  TERMS_VERSION,
  LGPD_VERSION,
} from "./validators.mjs";

import {
  checkRateLimit,
  parseCookies,
  sendJson,
  readRawBody,
  readJsonBody,
  getClientIp,
  safeEqualStrings,
} from "./http-utils.mjs";

export { checkRateLimit, clearRateLimitsForTest } from "./http-utils.mjs";

const COOKIE_NAME = "tp_session";
function formatSessionCookie(token, maxAgeSec = 7 * 24 * 60 * 60) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

function verifyCsrf(req, session) {
  const headerToken = req.headers["x-csrf-token"];
  if (typeof headerToken !== "string" || !session?.csrfToken) return false;
  return safeEqualStrings(headerToken, session.csrfToken);
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

    // 0.1 Vitrine pública (catálogo, cupons ativos e configurações públicas; sem pedidos nem dados de clientes)
    if (req.method === "GET" && url.pathname === "/api/v1/store/snapshot") {
      const snap = await getPublicStoreSnapshot();
      return sendJson(res, 200, { ...snap, requestId });
    }

    if (req.method === "POST" && url.pathname === "/api/v1/store/orders") {
      const body = await readJsonBody(req);
      const sess = await getSession(rawSessionToken);
      const savedOrder = await createOrderInPg(body.order, sess ? sess.userId : null, requestId);
      return sendJson(res, 201, { ok: true, order: savedOrder, requestId });
    }

    // Validação em tempo real de cupom (bloqueia cupom já usado ou de primeira compra fora de elegibilidade)
    if (req.method === "POST" && url.pathname === "/api/v1/store/coupons/validate") {
      const rl = checkRateLimit(`coupon:${ip}`, 40, 15 * 60 * 1000);
      if (!rl.allowed) {
        return sendJson(
          res,
          429,
          { code: "RATE_LIMITED", message: "Muitas validações de cupom seguidas. Aguarde alguns minutos.", requestId },
          { "Retry-After": String(rl.retryAfterSec) }
        );
      }
      const body = await readJsonBody(req);
      const sess = await getSession(rawSessionToken);
      await ensureDatabaseReady();
      const result = await validateCouponEligibilityInPg(pool, {
        code: body.code,
        subtotal: body.subtotal !== undefined && body.subtotal !== null ? Number(body.subtotal) : null,
        userId: sess ? sess.userId : null,
        email: body.email || "",
        phone: body.phone || "",
      });
      return sendJson(res, 200, { ok: true, coupon: result.coupon, discount: result.discount, requestId });
    }

    // Cotação pública de frete: Motoboy Cambé (R$ 10) / Londrina (R$ 20) / Demais cidades via Loggi
    if (req.method === "POST" && url.pathname === "/api/v1/store/shipping/quote") {
      const rl = checkRateLimit(`ship:${ip}`, 60, 15 * 60 * 1000);
      if (!rl.allowed) {
        return sendJson(
          res,
          429,
          { code: "RATE_LIMITED", message: "Muitas cotações em sequência. Aguarde alguns instantes.", requestId },
          { "Retry-After": String(rl.retryAfterSec) }
        );
      }
      const body = await readJsonBody(req);
      await ensureDatabaseReady();
      const { rows: setRows } = await pool.query("SELECT settings_json FROM public.store_settings WHERE id = 1");
      const quote = await calculateShippingQuote({
        method: body.method === "envio" ? "envio" : "retirada",
        cep: body.cep || "",
        city: body.city || "",
        uf: body.uf || "",
        itemsCount: Number(body.itemsCount || 1),
        settings: setRows[0]?.settings_json || {},
      });
      return sendJson(res, 200, { ok: true, quote, requestId });
    }

    // Receptor oficial de Webhooks de Pagamento (Asaas / HMAC-SHA256) com verificação criptográfica e idempotência
    if (req.method === "POST" && url.pathname === "/api/v1/webhooks/payment") {
      const rawBody = await readRawBody(req, 512 * 1024);
      if (!verifyWebhookAuth(req, rawBody)) {
        return sendJson(res, 401, {
          code: "INVALID_WEBHOOK_SIGNATURE",
          message: "Assinatura ou token de webhook inválido.",
          requestId,
        });
      }
      let parsed = {};
      try {
        parsed = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return sendJson(res, 400, { code: "BAD_JSON", message: "Payload JSON inválido.", requestId });
      }
      const norm = normalizeWebhookPayload(parsed);
      const result = await processPaymentWebhookInPg({ ...norm, requestId });
      return sendJson(res, 200, { ok: true, ...result, requestId });
    }

    // Upload das imagens originais das clientes (antes do pedido ser concluído; retenção de 7 dias)
    if (req.method === "POST" && url.pathname === "/api/v1/store/attachments") {
      const rl = checkRateLimit(`upload:${ip}`, 60, 15 * 60 * 1000);
      if (!rl.allowed) {
        return sendJson(
          res,
          429,
          { code: "RATE_LIMITED", message: "Muitos envios de imagem. Aguarde alguns minutos.", requestId },
          { "Retry-After": String(rl.retryAfterSec) }
        );
      }
      const body = await readJsonBody(req, 12 * 1024 * 1024);
      const attachment = await uploadOrderAttachmentInPg(body);
      return sendJson(res, 201, { ok: true, attachment, requestId });
    }

    // Rastreio público do pedido: exige os 4 últimos dígitos do telefone informado na compra
    const trackMatch = url.pathname.match(/^\/api\/v1\/store\/orders\/([A-Za-z0-9-]{1,40})\/track$/);
    if (req.method === "GET" && trackMatch) {
      const rl = checkRateLimit(`track:${ip}`, 30, 15 * 60 * 1000);
      if (!rl.allowed) {
        return sendJson(
          res,
          429,
          { code: "RATE_LIMITED", message: "Muitas consultas seguidas. Aguarde alguns minutos.", requestId },
          { "Retry-After": String(rl.retryAfterSec) }
        );
      }
      const phoneLast4 = String(url.searchParams.get("phone") || "").replace(/\D+/g, "").slice(-4);
      const tracking = phoneLast4.length === 4 ? await getOrderTrackingInPg(trackMatch[1], phoneLast4) : null;
      if (!tracking) {
        return sendJson(res, 404, {
          code: "NOT_FOUND",
          message: "Pedido não encontrado. Confira o código e os 4 últimos dígitos do telefone usado na compra.",
          requestId,
        });
      }
      return sendJson(res, 200, { order: tracking, requestId });
    }

    // Tudo o mais em /api/v1/store/* e /api/v1/admin/* é exclusivo da administradora (negado por padrão)
    if (url.pathname.startsWith("/api/v1/store/") || url.pathname.startsWith("/api/v1/admin/")) {
      return await handleAdminRequest(req, res, url, { requestId, ip, userAgent, cookies });
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

    // 4.1 GET /api/v1/me/orders (somente os pedidos da própria cliente)
    if (req.method === "GET" && url.pathname === "/api/v1/me/orders") {
      const orders = await getUserOrdersInPg(session.userId);
      return sendJson(res, 200, { orders, requestId });
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
