// Rotas exclusivas da administradora (painel /painel-tp/). Negado por padrão:
// sem sessão admin válida → 401; escrita sem X-CSRF-Token válido → 403.

import {
  getAdminStoreSnapshot,
  upsertProductInPg,
  deleteProductInPg,
  upsertCouponInPg,
  deleteCouponInPg,
  saveSettingsInPg,
  updateOrderStatusInPg,
  resetDemoInPg,
  downloadOrderAttachmentInPg,
  getOrderZipManifestInPg,
  purgeOrderAttachmentsByOrderIdInPg,
  runExpiredAttachmentsPurgeInPg,
  generateLoggiShipmentInPg,
} from "./db.mjs";
import {
  ADMIN_COOKIE_NAME,
  isAdminLoginConfigured,
  verifyAdminCredentials,
  createAdminSession,
  getAdminSession,
  revokeAdminSession,
  verifyAdminCsrf,
  formatAdminCookie,
  clearAdminCookie,
} from "./admin-auth.mjs";
import { checkRateLimit, sendJson, readJsonBody } from "./http-utils.mjs";
import { predictZipSize, streamZip } from "./zip.mjs";
import { handleSiteContentAdmin } from "./site-content-routes.mjs";

const READ_METHODS = new Set(["GET", "HEAD"]);

function rateLimited(res, rl, message, requestId) {
  return sendJson(res, 429, { code: "RATE_LIMITED", message, requestId }, { "Retry-After": String(rl.retryAfterSec) });
}

async function handleAdminLogin(req, res, ctx) {
  const { requestId, ip, userAgent, cookies } = ctx;
  if (!isAdminLoginConfigured()) {
    return sendJson(res, 503, {
      code: "ADMIN_NOT_CONFIGURED",
      message: "Acesso ao painel ainda não configurado no servidor (ADMIN_EMAIL e ADMIN_PASSWORD_HASH).",
      requestId,
    });
  }
  // Limite por IP e um teto global contra tentativa distribuída de adivinhar a senha
  const perIp = checkRateLimit(`admin-login:${ip}`, 5, 15 * 60 * 1000);
  const global = checkRateLimit("admin-login:all", 30, 15 * 60 * 1000);
  if (!perIp.allowed || !global.allowed) {
    return rateLimited(res, perIp.allowed ? global : perIp, "Muitas tentativas de acesso ao painel. Aguarde 15 minutos.", requestId);
  }

  const body = await readJsonBody(req, 16 * 1024);
  if (!verifyAdminCredentials(body.email, body.password)) {
    return sendJson(res, 401, { code: "INVALID_CREDENTIALS", message: "E-mail ou senha inválidos.", requestId });
  }

  if (cookies[ADMIN_COOKIE_NAME]) await revokeAdminSession(cookies[ADMIN_COOKIE_NAME]);
  const session = await createAdminSession({ ip, userAgent });
  return sendJson(
    res,
    200,
    { ok: true, email: process.env.ADMIN_EMAIL, csrfToken: session.csrfToken, expiresAt: session.expiresAt, requestId },
    { "Set-Cookie": formatAdminCookie(session.rawToken) }
  );
}

function sendAttachmentFile(res, url, rec, requestId) {
  if (!rec) return sendJson(res, 404, { error: "Arquivo de imagem não encontrado.", requestId });
  if (rec.purged_at || !rec.file_data) {
    return sendJson(res, 410, {
      error: "Esta imagem já foi apagada automaticamente do banco (prazo de 7 dias encerrado ou exclusão manual).",
      purgedAt: rec.purged_at,
      requestId,
    });
  }
  const prefix = rec.order_id ? `${rec.order_id}_` : "";
  const downloadName = `${prefix}${rec.file_name}`.replace(/[^a-zA-Z0-9._-]/g, "_");
  const disposition = url.searchParams.get("inline") === "1" ? "inline" : "attachment";
  res.writeHead(200, {
    "Content-Type": rec.mime_type || "application/octet-stream",
    "Content-Length": String(rec.file_data.length),
    "Content-Disposition": `${disposition}; filename="${downloadName}"`,
    "Cache-Control": "private, no-store",
  });
  res.end(rec.file_data);
}

async function sendOrderZip(res, orderId, requestId) {
  const { files } = await getOrderZipManifestInPg(orderId);
  if (!files.length) {
    return sendJson(res, 410, {
      error: "Nenhuma imagem disponível para este pedido (podem já ter sido apagadas após o prazo de 7 dias).",
      orderId,
      requestId,
    });
  }
  res.writeHead(200, {
    "Content-Type": "application/zip",
    "Content-Length": String(predictZipSize(files)),
    "Content-Disposition": `attachment; filename="${orderId}-fotos-cliente.zip"`,
    "Cache-Control": "private, no-store",
  });
  try {
    await streamZip(res, files);
    res.end();
  } catch (err) {
    // Cabeçalhos já enviados: interrompe a conexão para o navegador acusar falha em vez de salvar um .ZIP corrompido
    process.stderr.write(`[zip] ${requestId} falha ao gerar pacote do pedido ${orderId}: ${err.code || err.name}\n`);
    res.destroy();
  }
}

async function routeAdminRequest(req, res, url, session, requestId) {
  const { pathname } = url;
  const method = req.method;

  if (method === "GET" && pathname === "/api/v1/admin/me") {
    return sendJson(res, 200, { email: session.email, csrfToken: session.csrfToken, expiresAt: session.expiresAt, requestId });
  }

  if (method === "GET" && pathname === "/api/v1/admin/snapshot") {
    const snap = await getAdminStoreSnapshot();
    return sendJson(res, 200, { ...snap, requestId });
  }

  const downloadMatch = pathname.match(/^\/api\/v1\/store\/attachments\/([0-9a-fA-F-]{36})\/download$/);
  if (method === "GET" && downloadMatch) {
    return sendAttachmentFile(res, url, await downloadOrderAttachmentInPg(downloadMatch[1]), requestId);
  }

  const zipMatch = pathname.match(/^\/api\/v1\/store\/orders\/([A-Za-z0-9-]{1,40})\/attachments\.zip$/);
  if (method === "GET" && zipMatch) return sendOrderZip(res, zipMatch[1], requestId);

  if (!READ_METHODS.has(method) && !verifyAdminCsrf(req, session)) {
    return sendJson(res, 403, {
      code: "CSRF_INVALID",
      message: "Token de segurança (CSRF) ausente ou inválido. Recarregue o painel.",
      requestId,
    });
  }

  if (await handleSiteContentAdmin(req, res, url, requestId)) return;

  if (method === "PATCH" && pathname === "/api/v1/store/orders/status") {
    await updateOrderStatusInPg(await readJsonBody(req));
    return sendJson(res, 200, { ok: true, requestId });
  }

  // Gera coleta / etiqueta de envio na Transportadora Loggi (exclusivo para pedidos fora de Cambé/Londrina)
  const loggiMatch = pathname.match(/^\/api\/v1\/store\/orders\/([A-Za-z0-9-]{1,40})\/loggi-shipment$/);
  if (method === "POST" && loggiMatch) {
    const shipment = await generateLoggiShipmentInPg(loggiMatch[1], requestId);
    return sendJson(res, 200, { ok: true, shipment, requestId });
  }

  if (pathname === "/api/v1/store/products" && (method === "POST" || method === "DELETE")) {
    const body = await readJsonBody(req);
    if (method === "POST") await upsertProductInPg(body.product);
    else await deleteProductInPg(body.id);
    return sendJson(res, 200, { ok: true, requestId });
  }

  if (pathname === "/api/v1/store/coupons" && (method === "POST" || method === "DELETE")) {
    const body = await readJsonBody(req);
    if (method === "POST") await upsertCouponInPg(body.coupon);
    else await deleteCouponInPg(body.code);
    return sendJson(res, 200, { ok: true, requestId });
  }

  if (method === "PUT" && pathname === "/api/v1/store/settings") {
    const { adminPin, ...settings } = (await readJsonBody(req)).settings || {};
    await saveSettingsInPg(settings);
    return sendJson(res, 200, { ok: true, requestId });
  }

  if (method === "POST" && pathname === "/api/v1/store/reset") {
    await resetDemoInPg();
    const snap = await getAdminStoreSnapshot();
    return sendJson(res, 200, { ...snap, requestId });
  }

  // Exclusão imediata das imagens de um pedido (pós-produção da arte)
  const purgeOrderMatch = pathname.match(/^\/api\/v1\/store\/orders\/([A-Za-z0-9-]{1,40})\/attachments$/);
  if (method === "DELETE" && purgeOrderMatch) {
    const purgedCount = await purgeOrderAttachmentsByOrderIdInPg(purgeOrderMatch[1]);
    return sendJson(res, 200, { ok: true, orderId: purgeOrderMatch[1], purgedCount, requestId });
  }

  if (method === "POST" && pathname === "/api/v1/store/attachments/purge-expired") {
    const purgedCount = await runExpiredAttachmentsPurgeInPg();
    return sendJson(res, 200, { ok: true, purgedCount, requestId });
  }

  return sendJson(res, 404, { code: "NOT_FOUND", message: "Endpoint não encontrado.", requestId });
}

export async function handleAdminRequest(req, res, url, ctx) {
  const { requestId, cookies } = ctx;

  if (req.method === "POST" && url.pathname === "/api/v1/admin/login") {
    return handleAdminLogin(req, res, ctx);
  }

  const rawToken = cookies[ADMIN_COOKIE_NAME] || "";
  const session = await getAdminSession(rawToken);
  if (!session) {
    return sendJson(
      res,
      401,
      { code: "ADMIN_UNAUTHENTICATED", message: "Acesso restrito à administradora. Faça login no painel.", requestId },
      rawToken ? { "Set-Cookie": clearAdminCookie() } : {}
    );
  }

  if (req.method === "POST" && url.pathname === "/api/v1/admin/logout") {
    if (!verifyAdminCsrf(req, session)) {
      return sendJson(res, 403, { code: "CSRF_INVALID", message: "Token de segurança inválido.", requestId });
    }
    await revokeAdminSession(rawToken);
    return sendJson(res, 200, { ok: true, requestId }, { "Set-Cookie": clearAdminCookie() });
  }

  return routeAdminRequest(req, res, url, session, requestId);
}
