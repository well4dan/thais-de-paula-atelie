// Conteúdo do site controlado pelo painel: banners (topo, meio, popup), faixas promocionais e vitrine da home.
// Toda validação acontece aqui, no servidor. O site público só recebe o que está ativo e dentro do período.

import { pool, ensureDatabaseReady } from "./pg-pool.mjs";

const IMAGE_PATTERN = /^\/(media|img)\/[A-Za-z0-9._-]+\.webp$/;
const PLACEMENTS = new Set(["topo", "meio", "popup"]);
const POPUP_FREQUENCIES = new Set(["visita", "dia", "uma_vez"]);
const TEXT_THEMES = new Set(["claro", "escuro"]);
const STRIP_THEMES = new Set(["rosa", "salvia", "cacau", "dourado"]);
const MAX_SHOWCASE = 12;
const PUBLIC_CACHE_MS = 60 * 1000;

export class ContentValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.status = 400;
    this.code = "INVALID_CONTENT";
    this.details = field ? { [field]: message } : {};
  }
}

function cleanText(value, { field, max, min = 0, label }) {
  const text = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (text.length < min) throw new ContentValidationError(`${label} precisa de pelo menos ${min} caracteres.`, field);
  if (text.length > max) throw new ContentValidationError(`${label} pode ter no máximo ${max} caracteres.`, field);
  return text;
}

// Links aceitos: caminho do próprio site, https:// ou WhatsApp. Nada de javascript:, data:, // etc.
export function cleanLink(value, field) {
  const link = String(value ?? "").trim();
  if (!link) return "";
  if (link.length > 300) throw new ContentValidationError("Link muito longo.", field);
  if (/^\/(?!\/)[A-Za-z0-9\-._~/?#=&%+]*$/.test(link)) return link;
  try {
    const parsed = new URL(link);
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password) return parsed.toString();
  } catch {
    // cai no erro abaixo
  }
  throw new ContentValidationError("Use um endereço do site (ex.: /loja.html) ou um link que comece com https://.", field);
}

function cleanImage(value, field, { required }) {
  const image = String(value ?? "").trim();
  if (!image && !required) return null;
  if (!IMAGE_PATTERN.test(image)) throw new ContentValidationError("Escolha uma imagem da biblioteca.", field);
  return image;
}

function cleanDate(value, field) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ContentValidationError("Data inválida.", field);
  return date.toISOString();
}

function cleanPeriod(input) {
  const startsAt = cleanDate(input.startsAt, "startsAt");
  const endsAt = cleanDate(input.endsAt, "endsAt");
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    throw new ContentValidationError("A data de fim precisa ser depois do início.", "endsAt");
  }
  return { startsAt, endsAt };
}

export function validateBanner(input) {
  const placement = String(input.placement || "");
  if (!PLACEMENTS.has(placement)) throw new ContentValidationError("Posição do banner inválida.", "placement");
  const ctaUrl = cleanLink(input.ctaUrl, "ctaUrl");
  const ctaLabel = cleanText(input.ctaLabel, { field: "ctaLabel", max: 30, label: "O texto do botão" });
  if (Boolean(ctaUrl) !== Boolean(ctaLabel)) {
    throw new ContentValidationError("Preencha o texto e o link do botão, ou deixe os dois vazios.", ctaUrl ? "ctaLabel" : "ctaUrl");
  }
  const popupDelay = Number(input.popupDelayS ?? 4);
  if (!Number.isInteger(popupDelay) || popupDelay < 3 || popupDelay > 60) {
    throw new ContentValidationError("O popup abre entre 3 e 60 segundos depois da entrada.", "popupDelayS");
  }
  const popupFrequency = String(input.popupFrequency || "visita");
  if (!POPUP_FREQUENCIES.has(popupFrequency)) throw new ContentValidationError("Frequência do popup inválida.", "popupFrequency");
  const textTheme = String(input.textTheme || "claro");
  if (!TEXT_THEMES.has(textTheme)) throw new ContentValidationError("Cor do texto inválida.", "textTheme");

  return {
    placement,
    title: cleanText(input.title, { field: "title", max: 80, label: "O título" }),
    subtitle: cleanText(input.subtitle, { field: "subtitle", max: 160, label: "O texto de apoio" }),
    ctaLabel,
    ctaUrl,
    imageUrl: cleanImage(input.imageUrl, "imageUrl", { required: true }),
    imageMobileUrl: cleanImage(input.imageMobileUrl, "imageMobileUrl", { required: false }),
    altText: cleanText(input.altText, { field: "altText", min: 3, max: 160, label: "A descrição da imagem" }),
    textTheme,
    active: input.active !== false,
    popupDelayS: popupDelay,
    popupFrequency,
    ...cleanPeriod(input),
  };
}

export function validateAnnouncement(input) {
  const theme = String(input.theme || "cacau");
  if (!STRIP_THEMES.has(theme)) throw new ContentValidationError("Cor da faixa inválida.", "theme");
  const linkUrl = cleanLink(input.linkUrl, "linkUrl");
  const linkLabel = cleanText(input.linkLabel, { field: "linkLabel", max: 30, label: "O texto do link" });
  if (linkLabel && !linkUrl) throw new ContentValidationError("Informe o link ou apague o texto do link.", "linkUrl");
  return {
    text: cleanText(input.text, { field: "text", min: 3, max: 140, label: "O texto da faixa" }),
    linkUrl,
    linkLabel,
    theme,
    active: input.active !== false,
    dismissible: input.dismissible !== false,
    ...cleanPeriod(input),
  };
}

const iso = (d) => (d instanceof Date ? d.toISOString() : d || null);

function mapBanner(r) {
  return {
    id: r.id,
    placement: r.placement,
    title: r.title,
    subtitle: r.subtitle,
    ctaLabel: r.cta_label,
    ctaUrl: r.cta_url,
    imageUrl: r.image_url,
    imageMobileUrl: r.image_mobile_url,
    altText: r.alt_text,
    textTheme: r.text_theme,
    sortOrder: r.sort_order,
    active: r.active,
    startsAt: iso(r.starts_at),
    endsAt: iso(r.ends_at),
    popupDelayS: r.popup_delay_s,
    popupFrequency: r.popup_frequency,
    updatedAt: iso(r.updated_at),
  };
}

function mapAnnouncement(r) {
  return {
    id: r.id,
    text: r.text,
    linkUrl: r.link_url,
    linkLabel: r.link_label,
    theme: r.theme,
    sortOrder: r.sort_order,
    active: r.active,
    dismissible: r.dismissible,
    startsAt: iso(r.starts_at),
    endsAt: iso(r.ends_at),
    updatedAt: iso(r.updated_at),
  };
}

/* ---------- Cache do conteúdo público (invalidado a cada escrita do painel) ---------- */

let publicCache = null;
let publicCacheAt = 0;

export function invalidateSiteContentCache() {
  publicCache = null;
  publicCacheAt = 0;
}

const ACTIVE_NOW = "active AND (starts_at IS NULL OR starts_at <= NOW()) AND (ends_at IS NULL OR ends_at > NOW())";

export async function getPublicSiteContent() {
  if (publicCache && Date.now() - publicCacheAt < PUBLIC_CACHE_MS) return publicCache;
  await ensureDatabaseReady();
  const [bannerRes, stripRes] = await Promise.all([
    pool.query(`SELECT * FROM public.site_banners WHERE ${ACTIVE_NOW} ORDER BY placement, sort_order ASC, created_at ASC`),
    pool.query(`SELECT * FROM public.site_announcements WHERE ${ACTIVE_NOW} ORDER BY sort_order ASC, created_at ASC`),
  ]);
  const banners = bannerRes.rows.map(mapBanner).map(({ active, sortOrder, startsAt, endsAt, ...pub }) => pub);
  const popups = banners.filter((b) => b.placement === "popup").sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  publicCache = {
    announcements: stripRes.rows.map(mapAnnouncement).map(({ id, text, linkUrl, linkLabel, theme, dismissible }) => ({ id, text, linkUrl, linkLabel, theme, dismissible })),
    banners: {
      topo: banners.filter((b) => b.placement === "topo"),
      meio: banners.filter((b) => b.placement === "meio"),
      popup: popups[0] || null,
    },
  };
  publicCacheAt = Date.now();
  return publicCache;
}

/* ---------- Painel: banners ---------- */

export async function listBannersAdmin() {
  await ensureDatabaseReady();
  const { rows } = await pool.query("SELECT * FROM public.site_banners ORDER BY placement, sort_order ASC, created_at ASC");
  return rows.map(mapBanner);
}

export async function saveBanner(input, id = null) {
  const b = validateBanner(input);
  await ensureDatabaseReady();
  const values = [b.placement, b.title, b.subtitle, b.ctaLabel, b.ctaUrl, b.imageUrl, b.imageMobileUrl, b.altText,
    b.textTheme, b.active, b.startsAt, b.endsAt, b.popupDelayS, b.popupFrequency];
  let rows;
  if (id) {
    ({ rows } = await pool.query(
      `UPDATE public.site_banners SET placement=$1, title=$2, subtitle=$3, cta_label=$4, cta_url=$5, image_url=$6,
         image_mobile_url=$7, alt_text=$8, text_theme=$9, active=$10, starts_at=$11, ends_at=$12, popup_delay_s=$13,
         popup_frequency=$14, updated_at=NOW()
       WHERE id = $15 RETURNING *`,
      [...values, id]
    ));
    if (!rows[0]) throw Object.assign(new Error("Banner não encontrado."), { status: 404, code: "NOT_FOUND" });
  } else {
    ({ rows } = await pool.query(
      `INSERT INTO public.site_banners (placement, title, subtitle, cta_label, cta_url, image_url, image_mobile_url, alt_text,
         text_theme, active, starts_at, ends_at, popup_delay_s, popup_frequency, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
         (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM public.site_banners WHERE placement = $1))
       RETURNING *`,
      values
    ));
  }
  invalidateSiteContentCache();
  return mapBanner(rows[0]);
}

export async function deleteBanner(id) {
  await ensureDatabaseReady();
  const { rowCount } = await pool.query("DELETE FROM public.site_banners WHERE id = $1", [id]);
  invalidateSiteContentCache();
  return rowCount > 0;
}

/* ---------- Painel: faixas ---------- */

export async function listAnnouncementsAdmin() {
  await ensureDatabaseReady();
  const { rows } = await pool.query("SELECT * FROM public.site_announcements ORDER BY sort_order ASC, created_at ASC");
  return rows.map(mapAnnouncement);
}

export async function saveAnnouncement(input, id = null) {
  const a = validateAnnouncement(input);
  await ensureDatabaseReady();
  const values = [a.text, a.linkUrl, a.linkLabel, a.theme, a.active, a.dismissible, a.startsAt, a.endsAt];
  let rows;
  if (id) {
    ({ rows } = await pool.query(
      `UPDATE public.site_announcements SET text=$1, link_url=$2, link_label=$3, theme=$4, active=$5, dismissible=$6,
         starts_at=$7, ends_at=$8, updated_at=NOW()
       WHERE id = $9 RETURNING *`,
      [...values, id]
    ));
    if (!rows[0]) throw Object.assign(new Error("Faixa não encontrada."), { status: 404, code: "NOT_FOUND" });
  } else {
    ({ rows } = await pool.query(
      `INSERT INTO public.site_announcements (text, link_url, link_label, theme, active, dismissible, starts_at, ends_at, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM public.site_announcements))
       RETURNING *`,
      values
    ));
  }
  invalidateSiteContentCache();
  return mapAnnouncement(rows[0]);
}

export async function deleteAnnouncement(id) {
  await ensureDatabaseReady();
  const { rowCount } = await pool.query("DELETE FROM public.site_announcements WHERE id = $1", [id]);
  invalidateSiteContentCache();
  return rowCount > 0;
}

/* ---------- Ordem (arrastar e soltar) ---------- */

function cleanIdList(ids, max) {
  if (!Array.isArray(ids) || ids.length > max) throw new ContentValidationError(`Envie no máximo ${max} itens.`, "ids");
  const unique = [...new Set(ids.map(String))];
  if (unique.length !== ids.length) throw new ContentValidationError("Item repetido na lista.", "ids");
  return unique;
}

// Uma consulta só (unnest WITH ORDINALITY): cada ida ao Supabase custa ~200 ms, então nada de laço de UPDATE
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanUuidList(ids) {
  const list = cleanIdList(ids, 50);
  if (list.some((id) => !UUID_RE.test(id))) throw new ContentValidationError("Item inválido na lista.", "ids");
  return list;
}

async function applyOrder(table, ids, scopeSql = "", scopeValues = []) {
  await pool.query(
    `UPDATE public.${table} t SET sort_order = x.position
     FROM unnest($1::uuid[]) WITH ORDINALITY AS x(id, position)
     WHERE t.id = x.id ${scopeSql}`,
    [ids, ...scopeValues]
  );
  invalidateSiteContentCache();
}

export async function reorderBanners(placement, ids) {
  if (!PLACEMENTS.has(placement)) throw new ContentValidationError("Posição do banner inválida.", "placement");
  await ensureDatabaseReady();
  await applyOrder("site_banners", cleanUuidList(ids), "AND t.placement = $2", [placement]);
}

export async function reorderAnnouncements(ids) {
  await ensureDatabaseReady();
  await applyOrder("site_announcements", cleanUuidList(ids));
}

/* ---------- Vitrine da home ---------- */

// Define a vitrine inteira de uma vez: posições 1..N; os demais produtos saem da home. `featured` segue a vitrine.
export async function saveShowcase(productIds) {
  const ids = cleanIdList(productIds, MAX_SHOWCASE);
  await ensureDatabaseReady();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT COUNT(*)::int AS n FROM public.products WHERE id = ANY($1::text[])", [ids]);
    if (rows[0].n !== ids.length) throw new ContentValidationError("Produto inexistente na vitrine.", "ids");
    await client.query(
      `UPDATE public.products p
       SET home_order = x.position, featured = x.position IS NOT NULL, updated_at = NOW()
       FROM (
         SELECT p2.id, s.position::int AS position
         FROM public.products p2
         LEFT JOIN unnest($1::text[]) WITH ORDINALITY AS s(id, position) ON s.id = p2.id
         WHERE s.id IS NOT NULL OR p2.home_order IS NOT NULL OR p2.featured
       ) x
       WHERE p.id = x.id`,
      [ids]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  invalidateSiteContentCache();
  return ids;
}
