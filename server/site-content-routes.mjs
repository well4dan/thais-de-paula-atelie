// Rotas do painel para o conteúdo do site (banners, faixas, vitrine e biblioteca de imagens).
// Chamadas apenas pelo roteador da administradora, depois da sessão e do CSRF já validados.

import { pool } from "./pg-pool.mjs";
import { writeAudit } from "./db.mjs";
import { sendJson, readJsonBody } from "./http-utils.mjs";
import { saveMediaAsset, listMediaAssets, deleteUnusedMediaAsset } from "./media.mjs";
import {
  listBannersAdmin,
  saveBanner,
  deleteBanner,
  reorderBanners,
  listAnnouncementsAdmin,
  saveAnnouncement,
  deleteAnnouncement,
  reorderAnnouncements,
  saveShowcase,
} from "./site-content.mjs";

const UUID = "[0-9a-fA-F-]{36}";
const MEDIA_UPLOAD_LIMIT = 1024 * 1024; // base64 de até 600 KB + margem

async function audit(requestId, action, details) {
  await writeAudit(pool, { requestId, actorId: "admin", action, details }).catch(() => {});
}

function crudRoute(pathname, base) {
  if (pathname === base) return { id: null };
  const match = pathname.match(new RegExp(`^${base}/(${UUID})$`));
  return match ? { id: match[1] } : null;
}

async function handleCrud(req, res, { route, requestId, entity, save, remove }) {
  if (req.method === "POST" && !route.id) {
    const item = await save(await readJsonBody(req), null);
    await audit(requestId, `site.${entity}.create`, { id: item.id });
    return sendJson(res, 201, { item, requestId });
  }
  if (req.method === "PUT" && route.id) {
    const item = await save(await readJsonBody(req), route.id);
    await audit(requestId, `site.${entity}.update`, { id: item.id });
    return sendJson(res, 200, { item, requestId });
  }
  if (req.method === "DELETE" && route.id) {
    const removed = await remove(route.id);
    if (!removed) return sendJson(res, 404, { code: "NOT_FOUND", message: "Item não encontrado.", requestId });
    await audit(requestId, `site.${entity}.delete`, { id: route.id });
    return sendJson(res, 200, { ok: true, requestId });
  }
  return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED", message: "Método não permitido.", requestId });
}

// Devolve true quando a rota pertence a este módulo (e já respondeu)
export async function handleSiteContentAdmin(req, res, url, requestId) {
  const { pathname } = url;
  const method = req.method;

  if (method === "GET" && pathname === "/api/v1/admin/site") {
    const [banners, announcements, media] = await Promise.all([listBannersAdmin(), listAnnouncementsAdmin(), listMediaAssets()]);
    sendJson(res, 200, { banners, announcements, media, requestId });
    return true;
  }

  if (method === "POST" && pathname === "/api/v1/admin/media") {
    const body = await readJsonBody(req, MEDIA_UPLOAD_LIMIT);
    const asset = await saveMediaAsset({ base64Data: body.base64Data, label: body.label });
    await audit(requestId, "site.media.upload", { sha256: asset.sha256, sizeBytes: asset.sizeBytes });
    sendJson(res, 201, { asset, requestId });
    return true;
  }

  const mediaMatch = pathname.match(/^\/api\/v1\/admin\/media\/([0-9a-f]{64})$/);
  if (method === "DELETE" && mediaMatch) {
    const removed = await deleteUnusedMediaAsset(mediaMatch[1]);
    if (!removed) {
      sendJson(res, 409, { code: "MEDIA_IN_USE", message: "Esta imagem está em uso num produto ou banner e não pode ser apagada.", requestId });
      return true;
    }
    await audit(requestId, "site.media.delete", { sha256: mediaMatch[1] });
    sendJson(res, 200, { ok: true, requestId });
    return true;
  }

  const bannerRoute = crudRoute(pathname, "/api/v1/admin/banners");
  if (bannerRoute) {
    await handleCrud(req, res, { route: bannerRoute, requestId, entity: "banner", save: saveBanner, remove: deleteBanner });
    return true;
  }

  const stripRoute = crudRoute(pathname, "/api/v1/admin/announcements");
  if (stripRoute) {
    await handleCrud(req, res, { route: stripRoute, requestId, entity: "announcement", save: saveAnnouncement, remove: deleteAnnouncement });
    return true;
  }

  if (method === "PUT" && pathname === "/api/v1/admin/banners-order") {
    const body = await readJsonBody(req);
    await reorderBanners(String(body.placement || ""), body.ids);
    await audit(requestId, "site.banner.reorder", { placement: body.placement, count: body.ids?.length || 0 });
    sendJson(res, 200, { ok: true, requestId });
    return true;
  }

  if (method === "PUT" && pathname === "/api/v1/admin/announcements-order") {
    const body = await readJsonBody(req);
    await reorderAnnouncements(body.ids);
    await audit(requestId, "site.announcement.reorder", { count: body.ids?.length || 0 });
    sendJson(res, 200, { ok: true, requestId });
    return true;
  }

  if (method === "PUT" && pathname === "/api/v1/admin/showcase") {
    const ids = await saveShowcase((await readJsonBody(req)).ids);
    await audit(requestId, "site.showcase.update", { ids });
    sendJson(res, 200, { ok: true, ids, requestId });
    return true;
  }

  return false;
}
