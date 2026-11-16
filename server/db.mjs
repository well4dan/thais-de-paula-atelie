// Camada de Dados no PostgreSQL (Supabase) — Camada 3 da Arquitetura Blindada
// Cobre: Usuários, Endereços, Consentimento LGPD, Sessões, Produtos, Cupons, Pedidos, Configurações e Auditoria.

import crypto from "node:crypto";
import { pool, ensureDatabaseReady, seedEcommerceIfNeeded } from "./pg-pool.mjs";
import {
  hashPassword,
  verifyPassword,
  blindIndex,
  encryptField,
  decryptField,
  maskCpf,
  generateToken,
  sha256Hex,
} from "./crypto.mjs";
import { createGatewayCharge } from "./payments.mjs";

export class ConflictError extends Error {
  constructor(message, field) {
    super(message);
    this.code = "CONFLICT";
    this.status = 409;
    this.details = field ? { [field]: message } : {};
  }
}

export async function writeAudit(clientOrPool, { requestId, actorId = null, action, details = {} }) {
  const safe = { ...details };
  delete safe.password;
  delete safe.cpf;
  delete safe.cpfDigits;
  delete safe.token;

  await clientOrPool.query(
    `INSERT INTO public.audit_logs (id, request_id, actor_id, action, details_json, created_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, NOW())`,
    [crypto.randomUUID(), requestId, actorId ? String(actorId) : null, action, JSON.stringify(safe)]
  );
}

/* ==================== IDENTIDADE, SESSÕES E LGPD ==================== */

export async function registerUser({
  name,
  email,
  phone,
  cpfDigits,
  password,
  address,
  termsVersion,
  lgpdVersion,
  ip,
  userAgent,
  requestId,
}) {
  await ensureDatabaseReady();
  const emailLower = email.toLowerCase();
  const cpfIdx = blindIndex(cpfDigits);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: existingEmail } = await client.query(
      "SELECT id FROM public.users WHERE email = $1 AND deleted_at IS NULL",
      [emailLower]
    );
    if (existingEmail.length > 0) {
      throw new ConflictError("Já existe uma conta cadastrada com este e-mail.", "email");
    }

    const { rows: existingCpf } = await client.query(
      "SELECT id FROM public.users WHERE cpf_hash = $1 AND deleted_at IS NULL",
      [cpfIdx]
    );
    if (existingCpf.length > 0) {
      throw new ConflictError("Já existe uma conta cadastrada com este CPF.", "cpf");
    }

    const userId = crypto.randomUUID();
    const pwHash = hashPassword(password);
    const cpfEnc = encryptField(cpfDigits);
    const cpfMask = maskCpf(cpfDigits);
    const ipHash = blindIndex(ip || "0.0.0.0");

    await client.query(
      `INSERT INTO public.users
       (id, name, email, phone, cpf_hash, cpf_encrypted, cpf_masked, password_hash, role, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'customer',NOW(),NOW())`,
      [userId, name, emailLower, phone, cpfIdx, cpfEnc, cpfMask, pwHash]
    );

    await client.query(
      `INSERT INTO public.addresses
       (id, user_id, cep, street, number, complement, district, city, uf, is_default, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,NOW(),NOW())`,
      [
        crypto.randomUUID(),
        userId,
        address.cep,
        address.street,
        address.number,
        address.complement || "",
        address.district,
        address.city,
        address.uf,
      ]
    );

    await client.query(
      `INSERT INTO public.consent_logs
       (id, user_id, terms_version, lgpd_version, accepted_terms, accepted_lgpd, ip_hash, user_agent, accepted_at)
       VALUES ($1,$2,$3,$4,true,true,$5,$6,NOW())`,
      [
        crypto.randomUUID(),
        userId,
        termsVersion,
        lgpdVersion,
        ipHash,
        String(userAgent || "unknown").slice(0, 250),
      ]
    );

    await writeAudit(client, {
      requestId,
      actorId: userId,
      action: "USER_REGISTERED",
      details: { termsVersion, lgpdVersion },
    });

    await client.query("COMMIT");
    return await getUserProfile(userId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function authenticateUser({ email, password, requestId }) {
  await ensureDatabaseReady();
  const emailLower = String(email || "").trim().toLowerCase();
  const { rows } = await pool.query(
    "SELECT * FROM public.users WHERE email = $1 AND deleted_at IS NULL",
    [emailLower]
  );
  const row = rows[0] || null;

  const valid = verifyPassword(password, row ? row.password_hash : null);
  if (!row || !valid) {
    await writeAudit(pool, {
      requestId,
      actorId: row ? row.id : null,
      action: "LOGIN_FAILED",
      details: { reason: "invalid_credentials" },
    });
    return null;
  }

  await writeAudit(pool, {
    requestId,
    actorId: row.id,
    action: "LOGIN_SUCCESS",
    details: {},
  });
  return getUserProfile(row.id);
}

export async function createSession({ userId, ip, userAgent }) {
  await ensureDatabaseReady();
  const rawToken = generateToken(32);
  const tokenHash = sha256Hex(rawToken);
  const csrfToken = generateToken(24);
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO public.sessions (token_hash, user_id, csrf_token, ip_hash, user_agent, created_at, expires_at)
     VALUES ($1,$2,$3,$4,$5,NOW(),$6)`,
    [
      tokenHash,
      userId,
      csrfToken,
      blindIndex(ip || "0.0.0.0"),
      String(userAgent || "unknown").slice(0, 250),
      expires.toISOString(),
    ]
  );

  return { rawToken, csrfToken, expiresAt: expires.toISOString() };
}

export async function getSession(rawToken) {
  if (!rawToken || typeof rawToken !== "string" || rawToken.length < 32) return null;
  await ensureDatabaseReady();
  const tokenHash = sha256Hex(rawToken);
  const { rows } = await pool.query(
    `SELECT s.token_hash, s.user_id, s.csrf_token, s.expires_at, s.revoked_at, u.deleted_at
     FROM public.sessions s
     JOIN public.users u ON u.id = s.user_id
     WHERE s.token_hash = $1`,
    [tokenHash]
  );
  const row = rows[0];
  if (!row || row.revoked_at || row.deleted_at) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;
  return {
    userId: row.user_id,
    csrfToken: row.csrf_token,
    expiresAt: row.expires_at,
  };
}

export async function revokeSession(rawToken) {
  if (!rawToken) return;
  await ensureDatabaseReady();
  const tokenHash = sha256Hex(rawToken);
  await pool.query("UPDATE public.sessions SET revoked_at = NOW() WHERE token_hash = $1", [tokenHash]);
}

export async function revokeAllUserSessions(userId) {
  await ensureDatabaseReady();
  await pool.query("UPDATE public.sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL", [userId]);
}

export async function getUserProfile(userId) {
  await ensureDatabaseReady();
  const { rows: uRows } = await pool.query(
    `SELECT id, name, email, phone, cpf_masked, role, created_at, updated_at
     FROM public.users WHERE id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  const u = uRows[0];
  if (!u) return null;

  const { rows: aRows } = await pool.query(
    `SELECT cep, street, number, complement, district, city, uf
     FROM public.addresses WHERE user_id = $1 ORDER BY is_default DESC, updated_at DESC LIMIT 1`,
    [userId]
  );

  const { rows: consents } = await pool.query(
    `SELECT terms_version, lgpd_version, accepted_at
     FROM public.consent_logs WHERE user_id = $1 ORDER BY accepted_at DESC`,
    [userId]
  );

  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    cpfMasked: u.cpf_masked,
    role: u.role,
    createdAt: u.created_at,
    updatedAt: u.updated_at,
    address: aRows[0] || null,
    consents,
  };
}

export async function updateUserProfile(userId, { name, phone, address, requestId }) {
  await ensureDatabaseReady();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE public.users SET name = $1, phone = $2, updated_at = NOW() WHERE id = $3 AND deleted_at IS NULL",
      [name, phone, userId]
    );
    const { rows: existing } = await client.query(
      "SELECT id FROM public.addresses WHERE user_id = $1 LIMIT 1",
      [userId]
    );
    if (existing.length > 0) {
      await client.query(
        `UPDATE public.addresses
         SET cep = $1, street = $2, number = $3, complement = $4, district = $5, city = $6, uf = $7, updated_at = NOW()
         WHERE id = $8`,
        [
          address.cep,
          address.street,
          address.number,
          address.complement || "",
          address.district,
          address.city,
          address.uf,
          existing[0].id,
        ]
      );
    } else {
      await client.query(
        `INSERT INTO public.addresses
         (id, user_id, cep, street, number, complement, district, city, uf, is_default, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,NOW(),NOW())`,
        [
          crypto.randomUUID(),
          userId,
          address.cep,
          address.street,
          address.number,
          address.complement || "",
          address.district,
          address.city,
          address.uf,
        ]
      );
    }
    await writeAudit(client, { requestId, actorId: userId, action: "PROFILE_UPDATED", details: {} });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return getUserProfile(userId);
}

export async function exportUserLgpdPackage(userId, requestId) {
  await ensureDatabaseReady();
  const { rows } = await pool.query("SELECT * FROM public.users WHERE id = $1 AND deleted_at IS NULL", [userId]);
  const row = rows[0];
  if (!row) return null;

  const cpfPlain = decryptField(row.cpf_encrypted);
  const { rows: addresses } = await pool.query(
    "SELECT cep, street, number, complement, district, city, uf, created_at, updated_at FROM public.addresses WHERE user_id = $1",
    [userId]
  );
  const { rows: consents } = await pool.query(
    "SELECT terms_version, lgpd_version, accepted_terms, accepted_lgpd, accepted_at FROM public.consent_logs WHERE user_id = $1",
    [userId]
  );

  await writeAudit(pool, { requestId, actorId: userId, action: "LGPD_DATA_EXPORTED", details: {} });

  return {
    generatedAt: new Date().toISOString(),
    database: "Supabase PostgreSQL (Encrypted at Rest)",
    controller: "Thaís de Paula Ateliê",
    legalBasis: "Lei nº 13.709/2018 (LGPD) - Art. 18, V (Portabilidade e Acesso)",
    holder: {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      cpf: `${cpfPlain.slice(0, 3)}.${cpfPlain.slice(3, 6)}.${cpfPlain.slice(6, 9)}-${cpfPlain.slice(9, 11)}`,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    addresses,
    consents,
  };
}

export async function deleteAndAnonymizeUser({ userId, password, requestId }) {
  await ensureDatabaseReady();
  const { rows } = await pool.query("SELECT * FROM public.users WHERE id = $1 AND deleted_at IS NULL", [userId]);
  const row = rows[0];
  if (!row) return false;
  if (!verifyPassword(password, row.password_hash)) return false;

  const anonTag = `deleted-${crypto.randomUUID()}`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM public.addresses WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM public.sessions WHERE user_id = $1", [userId]);
    await client.query(
      `UPDATE public.users
       SET name = 'Titular Excluído (LGPD)',
           email = $1,
           phone = '0000000000',
           cpf_hash = $2,
           cpf_encrypted = 'EXPURGADO_LGPD',
           cpf_masked = '***.***.***-**',
           password_hash = 'EXPURGADO',
           deleted_at = NOW(),
           updated_at = NOW()
       WHERE id = $3`,
      [`${anonTag}@anon.invalid`, anonTag, userId]
    );
    await writeAudit(client, { requestId, actorId: userId, action: "ACCOUNT_DELETED_LGPD", details: {} });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return true;
}

/* ==================== E-COMMERCE NO POSTGRESQL ==================== */

function mapProductRow(r) {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    line: r.line,
    mode: r.mode,
    price: r.price,
    stock: r.stock,
    leadDays: r.lead_days,
    featured: r.featured,
    active: r.active,
    image: r.image,
    description: r.description,
    options: r.options_json || [],
    compareAtPrice: r.compare_at_price || null,
    badges: r.badges || [],
    homeOrder: r.home_order || null,
  };
}

function mapCouponRow(c) {
  return {
    code: c.code,
    type: c.type,
    value: c.value,
    minOrder: c.min_order,
    active: c.active,
    firstPurchaseOnly: Boolean(c.first_purchase_only),
    singleUsePerCustomer: c.single_use_per_customer !== false,
    maxUses: c.max_uses || null,
    usedCount: Number(c.used_count || 0),
  };
}

function withoutPrivateSettings(settingsJson) {
  const { adminPin, ...publicSettings } = settingsJson || {};
  return publicSettings;
}

// Vitrine pública: só catálogo ativo, cupons ativos e configurações públicas. Nunca pedidos ou dados de clientes.
export async function getPublicStoreSnapshot() {
  await ensureDatabaseReady();
  const [prodRes, cupRes, setRes] = await Promise.all([
    pool.query("SELECT * FROM public.products WHERE active = TRUE ORDER BY id ASC"),
    pool.query("SELECT * FROM public.coupons WHERE active = TRUE ORDER BY code ASC"),
    pool.query("SELECT settings_json FROM public.store_settings WHERE id = 1"),
  ]);
  return {
    products: prodRes.rows.map(mapProductRow),
    coupons: cupRes.rows.map(mapCouponRow),
    settings: withoutPrivateSettings(setRes.rows[0]?.settings_json),
  };
}

// Rastreio público: exige os 4 últimos dígitos do telefone do pedido e devolve só status e itens, sem dados pessoais
export async function getOrderTrackingInPg(orderId, phoneLast4) {
  await ensureDatabaseReady();
  const { rows } = await pool.query(
    "SELECT id, customer_json, status, history_json, lead_days, created_at FROM public.orders WHERE id = $1",
    [orderId]
  );
  const order = rows[0];
  if (!order) return null;
  const phoneDigits = String(order.customer_json?.phone || "").replace(/\D+/g, "");
  if (phoneDigits.length < 4 || phoneDigits.slice(-4) !== phoneLast4) return null;

  const { rows: items } = await pool.query(
    "SELECT name, image, qty FROM public.order_items WHERE order_id = $1 ORDER BY id ASC",
    [orderId]
  );
  return {
    id: order.id,
    status: order.status,
    leadDays: order.lead_days,
    createdAt: order.created_at instanceof Date ? order.created_at.toISOString() : order.created_at,
    history: (order.history_json || []).map((h) => ({ at: h.at, status: h.status, note: h.note })),
    items: items.map((it) => ({ name: it.name, image: it.image, qty: it.qty })),
  };
}

// "Minha conta": pedidos da própria cliente logada (vínculo por user_id gravado no checkout com sessão)
export async function getUserOrdersInPg(userId) {
  await ensureDatabaseReady();
  const { rows: orders } = await pool.query(
    `SELECT id, customer_json, shipping_json, payment_json, coupon_code, totals_json, lead_days, status, history_json, created_at
     FROM public.orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );
  if (!orders.length) return [];
  const { rows: items } = await pool.query(
    `SELECT order_id, product_id, name, image, mode, qty, unit_price, selections_json
     FROM public.order_items WHERE order_id = ANY($1::text[]) ORDER BY id ASC`,
    [orders.map((o) => o.id)]
  );
  const itemsByOrder = new Map();
  for (const it of items) {
    const list = itemsByOrder.get(it.order_id) || [];
    list.push({
      productId: it.product_id,
      name: it.name,
      image: it.image,
      mode: it.mode,
      qty: it.qty,
      unit: it.unit_price,
      selections: it.selections_json || {},
      photo: null,
    });
    itemsByOrder.set(it.order_id, list);
  }
  return orders.map((o) => ({
    id: o.id,
    createdAt: o.created_at instanceof Date ? o.created_at.toISOString() : o.created_at,
    customer: o.customer_json,
    shipping: o.shipping_json,
    payment: o.payment_json,
    coupon: o.coupon_code,
    items: itemsByOrder.get(o.id) || [],
    totals: o.totals_json,
    leadDays: o.lead_days,
    status: o.status,
    history: o.history_json || [],
  }));
}

// Painel da administradora: snapshot completo (pedidos com dados de clientes). Só via rota protegida.
export async function getAdminStoreSnapshot() {
  await ensureDatabaseReady();
  const [prodRes, cupRes, setRes, ordRes, itemRes, attRes] = await Promise.all([
    pool.query("SELECT * FROM public.products ORDER BY id ASC"),
    pool.query("SELECT * FROM public.coupons ORDER BY code ASC"),
    pool.query("SELECT settings_json FROM public.store_settings WHERE id = 1"),
    pool.query("SELECT * FROM public.orders ORDER BY created_at DESC LIMIT 200"),
    pool.query("SELECT * FROM public.order_items"),
    pool.query(
      `SELECT id, order_id, product_id, file_name, mime_type, size_bytes, downloaded_at, created_at, expires_at, purged_at
       FROM public.order_attachments
       WHERE order_id IS NOT NULL
       ORDER BY created_at ASC`
    ),
  ]);

  const attByOrder = new Map();
  for (const a of attRes.rows) {
    const list = attByOrder.get(a.order_id) || [];
    list.push({
      id: a.id,
      orderId: a.order_id,
      productId: a.product_id,
      fileName: a.file_name,
      mimeType: a.mime_type,
      sizeBytes: a.size_bytes,
      downloadedAt: a.downloaded_at ? new Date(a.downloaded_at).toISOString() : null,
      createdAt: a.created_at ? new Date(a.created_at).toISOString() : null,
      expiresAt: a.expires_at ? new Date(a.expires_at).toISOString() : null,
      purgedAt: a.purged_at ? new Date(a.purged_at).toISOString() : null,
    });
    attByOrder.set(a.order_id, list);
  }

  const itemsByOrder = new Map();
  for (const it of itemRes.rows) {
    const arr = itemsByOrder.get(it.order_id) || [];
    const orderAtts = (attByOrder.get(it.order_id) || []).filter((x) => x.productId === it.product_id);
    arr.push({
      productId: it.product_id,
      name: it.name,
      image: it.image,
      mode: it.mode,
      qty: it.qty,
      unit: it.unit_price,
      selections: it.selections_json || {},
      photo: it.photo_data || null,
      attachments: orderAtts.length ? orderAtts : it.attachments_json || [],
    });
    itemsByOrder.set(it.order_id, arr);
  }

  return {
    products: prodRes.rows.map(mapProductRow),
    coupons: cupRes.rows.map(mapCouponRow),
    settings: withoutPrivateSettings(setRes.rows[0]?.settings_json),
    orders: ordRes.rows.map((o) => ({
      id: o.id,
      createdAt: o.created_at instanceof Date ? o.created_at.toISOString() : o.created_at,
      demo: o.is_demo,
      customer: o.customer_json,
      shipping: o.shipping_json,
      payment: o.payment_json,
      coupon: o.coupon_code,
      items: itemsByOrder.get(o.id) || [],
      totals: o.totals_json,
      leadDays: o.lead_days,
      status: o.status,
      history: o.history_json || [],
    })),
  };
}

const PRODUCT_IMAGE_PATTERN = /^\/(img|media)\/[A-Za-z0-9._-]+\.webp$/;
const MANUAL_BADGES = new Set(["novidade", "mais_vendido"]);

function invalidProduct(message) {
  return Object.assign(new Error(message), { status: 400, code: "INVALID_PRODUCT" });
}

// Campos novos validados no servidor; vitrine (featured/home_order) só muda pela rota da vitrine
function normalizeProductPromo(p) {
  if (!PRODUCT_IMAGE_PATTERN.test(String(p.image || ""))) throw invalidProduct("Imagem do produto inválida.");
  const compareAt = p.compareAtPrice === null || p.compareAtPrice === undefined || p.compareAtPrice === "" ? null : Number(p.compareAtPrice);
  if (compareAt !== null && (!Number.isInteger(compareAt) || compareAt <= Number(p.price))) {
    throw invalidProduct("O preço \"de\" precisa ser maior que o preço atual.");
  }
  const badges = [...new Set(Array.isArray(p.badges) ? p.badges : [])];
  if (badges.some((b) => !MANUAL_BADGES.has(b))) throw invalidProduct("Selo inválido.");
  return { compareAt, badges };
}

export async function upsertProductInPg(p) {
  await ensureDatabaseReady();
  const id = p.id || `p${Date.now().toString(36)}`;
  const { compareAt, badges } = normalizeProductPromo(p);
  await pool.query(
    `INSERT INTO public.products
     (id, slug, name, line, mode, price, stock, lead_days, featured, active, image, description, options_json,
      compare_at_price, badges, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,FALSE,$9,$10,$11,$12::jsonb,$13,$14::text[],NOW())
     ON CONFLICT (id) DO UPDATE SET
       slug = EXCLUDED.slug,
       name = EXCLUDED.name,
       line = EXCLUDED.line,
       mode = EXCLUDED.mode,
       price = EXCLUDED.price,
       stock = EXCLUDED.stock,
       lead_days = EXCLUDED.lead_days,
       active = EXCLUDED.active,
       image = EXCLUDED.image,
       description = EXCLUDED.description,
       options_json = EXCLUDED.options_json,
       compare_at_price = EXCLUDED.compare_at_price,
       badges = EXCLUDED.badges,
       updated_at = NOW()`,
    [
      id,
      p.slug,
      p.name,
      p.line,
      p.mode,
      p.price,
      p.stock,
      p.leadDays || 0,
      Boolean(p.active),
      p.image,
      p.description,
      JSON.stringify(p.options || []),
      compareAt,
      badges,
    ]
  );
}

export async function deleteProductInPg(id) {
  await ensureDatabaseReady();
  await pool.query("DELETE FROM public.products WHERE id = $1", [id]);
}

export async function upsertCouponInPg(c) {
  await ensureDatabaseReady();
  const code = String(c.code || "").trim().toUpperCase();
  await pool.query(
    `INSERT INTO public.coupons (code, type, value, min_order, active, first_purchase_only, single_use_per_customer, max_uses)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (code) DO UPDATE SET
       type = EXCLUDED.type,
       value = EXCLUDED.value,
       min_order = EXCLUDED.min_order,
       active = EXCLUDED.active,
       first_purchase_only = EXCLUDED.first_purchase_only,
       single_use_per_customer = EXCLUDED.single_use_per_customer,
       max_uses = EXCLUDED.max_uses`,
    [
      code,
      c.type,
      c.value,
      c.minOrder || 0,
      Boolean(c.active),
      Boolean(c.firstPurchaseOnly),
      c.singleUsePerCustomer !== false,
      c.maxUses ? Number(c.maxUses) : null,
    ]
  );
}

export async function validateCouponEligibilityInPg(
  clientOrPool,
  { code, subtotal = null, userId = null, email = "", phone = "", lockCoupon = false }
) {
  const runner = clientOrPool || pool;
  const rawCode = String(code || "").trim().toUpperCase();
  if (!rawCode) {
    throw orderValidationError("Informe um código de cupom.", 422, "INVALID_COUPON");
  }

  const sqlCup = lockCoupon
    ? "SELECT * FROM public.coupons WHERE code = $1 FOR UPDATE"
    : "SELECT * FROM public.coupons WHERE code = $1";
  const { rows: cupRows } = await runner.query(sqlCup, [rawCode]);
  const cup = cupRows[0];
  if (!cup || !cup.active) {
    throw orderValidationError("Cupom inválido ou expirado.", 422, "INVALID_COUPON");
  }
  if (cup.max_uses !== null && Number(cup.used_count || 0) >= Number(cup.max_uses)) {
    throw orderValidationError("Este cupom atingiu o limite máximo de utilizações.", 409, "COUPON_MAX_USES");
  }
  if (subtotal !== null && subtotal < Number(cup.min_order || 0)) {
    const minStr = (Number(cup.min_order) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    throw orderValidationError(`Cupom válido para pedidos a partir de ${minStr}.`, 422, "COUPON_MIN_ORDER");
  }

  const emailSet = new Set();
  const phoneSet = new Set();
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (cleanEmail) emailSet.add(cleanEmail);
  const cleanPhone = String(phone || "").replace(/\D+/g, "");
  if (cleanPhone.length >= 8) phoneSet.add(cleanPhone);

  if (userId) {
    const { rows: uRows } = await runner.query(
      "SELECT email, phone FROM public.users WHERE id = $1 AND deleted_at IS NULL",
      [userId]
    );
    if (uRows[0]?.email) emailSet.add(String(uRows[0].email).trim().toLowerCase());
    const uPhone = String(uRows[0]?.phone || "").replace(/\D+/g, "");
    if (uPhone.length >= 8) phoneSet.add(uPhone);
  }

  const emails = [...emailSet];
  const phones = [...phoneSet];
  const hasCustomerKey = Boolean(userId) || emails.length > 0 || phones.length > 0;

  if (hasCustomerKey && cup.single_use_per_customer !== false) {
    const { rows: usedRows } = await runner.query(
      `SELECT 1 FROM public.orders o
       WHERE o.is_demo = FALSE
         AND o.status <> 'cancelado'
         AND UPPER(COALESCE(o.coupon_code, '')) = $1
         AND (
           ($2::uuid IS NOT NULL AND o.user_id = $2::uuid)
           OR (array_length($3::text[], 1) > 0 AND LOWER(COALESCE(o.customer_json->>'email', '')) = ANY($3::text[]))
           OR (array_length($4::text[], 1) > 0 AND regexp_replace(COALESCE(o.customer_json->>'phone', ''), '\\D', '', 'g') = ANY($4::text[]))
         )
       LIMIT 1`,
      [rawCode, userId, emails, phones]
    );
    const { rows: redRows } = await runner.query(
      `SELECT 1 FROM public.coupon_redemptions cr
       JOIN public.orders o ON o.id = cr.order_id
       WHERE cr.coupon_code = $1
         AND o.status <> 'cancelado'
         AND (
           ($2::uuid IS NOT NULL AND cr.user_id = $2::uuid)
           OR (array_length($3::text[], 1) > 0 AND cr.email_norm = ANY($3::text[]))
           OR (array_length($4::text[], 1) > 0 AND cr.phone_digits = ANY($4::text[]))
         )
       LIMIT 1`,
      [rawCode, userId, emails, phones]
    );
    if (usedRows.length > 0 || redRows.length > 0) {
      throw orderValidationError(
        `O cupom ${rawCode} já foi utilizado por você anteriormente e está bloqueado para novas compras.`,
        409,
        "COUPON_ALREADY_USED"
      );
    }
  }

  if (hasCustomerKey && cup.first_purchase_only) {
    const { rows: prevOrders } = await runner.query(
      `SELECT id FROM public.orders o
       WHERE o.is_demo = FALSE
         AND o.status <> 'cancelado'
         AND (
           ($1::uuid IS NOT NULL AND o.user_id = $1::uuid)
           OR (array_length($2::text[], 1) > 0 AND LOWER(COALESCE(o.customer_json->>'email', '')) = ANY($2::text[]))
           OR (array_length($3::text[], 1) > 0 AND regexp_replace(COALESCE(o.customer_json->>'phone', ''), '\\D', '', 'g') = ANY($3::text[]))
         )
       LIMIT 1`,
      [userId, emails, phones]
    );
    if (prevOrders.length > 0) {
      throw orderValidationError(
        `O cupom ${rawCode} é exclusivo para a primeira compra e já consta um pedido anterior no seu cadastro.`,
        409,
        "COUPON_FIRST_PURCHASE_ONLY"
      );
    }
  }

  const baseSub = subtotal === null ? 0 : subtotal;
  const discount =
    cup.type === "percent"
      ? Math.round((baseSub * Number(cup.value)) / 100)
      : Math.min(Number(cup.value), baseSub);

  return { coupon: mapCouponRow(cup), discount, primaryEmail: emails[0] || "", primaryPhone: phones[0] || "" };
}

export async function deleteCouponInPg(code) {
  await ensureDatabaseReady();
  await pool.query("DELETE FROM public.coupons WHERE code = $1", [code]);
}

export async function saveSettingsInPg(settings) {
  await ensureDatabaseReady();
  await pool.query(
    `INSERT INTO public.store_settings (id, settings_json, updated_at)
     VALUES (1, $1::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET settings_json = EXCLUDED.settings_json, updated_at = NOW()`,
    [JSON.stringify(settings)]
  );
}

function orderValidationError(message, status = 422, code = "INVALID_ORDER") {
  return Object.assign(new Error(message), { status, code });
}

function computeServerUnitPrice(productRow, selections = {}) {
  let price = Number(productRow.price);
  const options = Array.isArray(productRow.options_json) ? productRow.options_json : [];
  for (const option of options) {
    if (option?.type !== "select" || !Array.isArray(option.choices)) continue;
    const chosenLabel = selections?.[option.id];
    const choice = option.choices.find((c) => c.label === chosenLabel);
    if (choice) price += Number(choice.delta || 0);
  }
  return Math.max(0, Math.round(price));
}

async function generateServerOrderId(client) {
  const year = new Date().getFullYear();
  const prefix = `TP-${year}-`;
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(id FROM 'TP-[0-9]{4}-([0-9]+)$') AS INTEGER)), 0)::int AS max_seq
     FROM public.orders
     WHERE id LIKE $1 AND id ~ '^TP-[0-9]{4}-[0-9]+$'`,
    [`${prefix}%`]
  );
  const nextSeq = Number(rows[0]?.max_seq || 0) + 1;
  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

export async function createOrderInPg(orderInput, userId = null, requestId = null) {
  await ensureDatabaseReady();
  if (!orderInput || !Array.isArray(orderInput.items) || orderInput.items.length === 0 || orderInput.items.length > 50) {
    throw orderValidationError("Pedido inválido: envie entre 1 e 50 itens.", 422);
  }

  const client = await pool.connect();
  let savedOrder = null;
  let customerCpfPlain = "";

  try {
    await client.query("BEGIN");

    // Busca configurações reais da loja no PostgreSQL (nunca confia no frete vindo do navegador)
    const { rows: setRows } = await client.query("SELECT settings_json FROM public.store_settings WHERE id = 1");
    const storeCfg = {
      shippingFlat: 1890,
      freeShippingMin: 19900,
      readyShipDays: 2,
      ...(setRows[0]?.settings_json || {}),
    };

    const computedItems = [];
    let subtotal = 0;
    let maxLead = 0;

    for (const rawItem of orderInput.items) {
      const productId = String(rawItem?.productId || "").trim();
      const qty = Math.trunc(Number(rawItem?.qty || 0));
      if (!productId || !Number.isInteger(qty) || qty < 1 || qty > 99) {
        throw orderValidationError("Quantidade ou produto inválido no carrinho.", 422);
      }

      // Trava a linha do produto até concluir o pedido (impede race condition de estoque)
      const { rows: prodRows } = await client.query(
        `SELECT id, name, image, mode, price, stock, lead_days, active, options_json
         FROM public.products
         WHERE id = $1
         FOR UPDATE`,
        [productId]
      );
      const prod = prodRows[0];
      if (!prod || !prod.active) {
        throw orderValidationError(`Produto indisponível no catálogo.`, 422, "PRODUCT_UNAVAILABLE");
      }
      if (prod.mode === "pronta" && Number(prod.stock || 0) < qty) {
        throw orderValidationError(`Estoque insuficiente para "${prod.name}" (disponível: ${prod.stock || 0}).`, 409, "INSUFFICIENT_STOCK");
      }

      const selections = rawItem.selections && typeof rawItem.selections === "object" ? rawItem.selections : {};
      const unitPrice = computeServerUnitPrice(prod, selections);
      subtotal += unitPrice * qty;

      const lead = prod.mode === "demanda" ? Number(prod.lead_days || 5) : Number(storeCfg.readyShipDays || 2);
      if (lead > maxLead) maxLead = lead;

      computedItems.push({
        productId: prod.id,
        name: prod.name,
        image: prod.image,
        mode: prod.mode,
        qty,
        unit: unitPrice,
        selections,
        photo: rawItem.photo || null,
        attachments: Array.isArray(rawItem.attachments) ? rawItem.attachments : [],
      });
    }

    // Valida e aplica cupom exclusivamente no servidor (bloqueia primeira compra repetida e cupom já utilizado)
    let appliedCoupon = null;
    let discount = 0;
    let couponCustomerMeta = null;
    const rawCoupon = String(orderInput.coupon || "").trim().toUpperCase();
    if (rawCoupon) {
      const checked = await validateCouponEligibilityInPg(client, {
        code: rawCoupon,
        subtotal,
        userId,
        email: orderInput.customer?.email || "",
        phone: orderInput.customer?.phone || "",
        lockCoupon: true,
      });
      appliedCoupon = checked.coupon.code;
      discount = checked.discount;
      couponCustomerMeta = checked;
    }

    const shippingMethod = orderInput.shipping?.method === "envio" ? "envio" : "retirada";
    const shippingCost =
      shippingMethod === "envio" && subtotal - discount < Number(storeCfg.freeShippingMin || 19900)
        ? Number(storeCfg.shippingFlat || 1890)
        : 0;
    const total = Math.max(0, subtotal - discount + shippingCost);
    const serverTotals = { subtotal, discount, shipping: shippingCost, total };

    const orderId =
      orderInput.id && /^TP-\d{4}-\d{4,}$/.test(String(orderInput.id))
        ? String(orderInput.id)
        : await generateServerOrderId(client);

    const paymentMethod = ["pix", "cartao", "boleto"].includes(String(orderInput.payment?.method || "").toLowerCase())
      ? String(orderInput.payment.method).toLowerCase()
      : "pix";

    // Se usuário estiver logado, busca CPF descriptografado para envio seguro ao gateway Asaas (nunca logado)
    if (userId) {
      const { rows: uRows } = await client.query(
        "SELECT cpf_encrypted FROM public.users WHERE id = $1 AND deleted_at IS NULL",
        [userId]
      );
      if (uRows[0]?.cpf_encrypted) {
        try {
          customerCpfPlain = decryptField(uRows[0].cpf_encrypted);
        } catch {
          customerCpfPlain = "";
        }
      }
    }

    const createdAt = new Date().toISOString();
    const initialOrderSkeleton = {
      id: orderId,
      createdAt,
      customer: orderInput.customer || {},
      shipping: { ...(orderInput.shipping || {}), method: shippingMethod },
      payment: { ...(orderInput.payment || {}), method: paymentMethod },
      totals: serverTotals,
    };

    // Cria cobrança no gateway configurado (Asaas quando ativo, ou Sandbox Simulado)
    const charge = await createGatewayCharge({ order: initialOrderSkeleton, customerCpf: customerCpfPlain });

    const finalPayment = {
      method: paymentMethod,
      ...(orderInput.payment?.brand ? { brand: String(orderInput.payment.brand).slice(0, 20) } : {}),
      ...(orderInput.payment?.last4 ? { last4: String(orderInput.payment.last4).slice(-4) } : {}),
      status: charge.paymentStatus,
      provider: charge.provider,
      ...(charge.chargeId ? { chargeId: charge.chargeId } : {}),
      ...(charge.checkoutUrl ? { checkoutUrl: charge.checkoutUrl } : {}),
      ...(charge.pixQrPayload ? { pixQrPayload: charge.pixQrPayload } : {}),
      ...(charge.boletoLine ? { boletoLine: charge.boletoLine } : {}),
    };

    const finalStatus = charge.initialStatus;
    const paidAt = finalStatus === "pago" ? createdAt : null;
    const history = [
      {
        at: createdAt,
        status: finalStatus,
        note:
          charge.provider === "asaas"
            ? "Pedido criado e aguardando confirmação do gateway de pagamento."
            : finalStatus === "pago"
              ? "Pagamento aprovado (sandbox)."
              : "Pedido criado.",
      },
    ];

    await client.query(
      `INSERT INTO public.orders
       (id, user_id, customer_json, shipping_json, payment_json, coupon_code, totals_json, lead_days, status, history_json,
        payment_provider, gateway_charge_id, gateway_checkout_url, pix_qr_payload, boleto_digitable_line, paid_at, is_demo, created_at, updated_at)
       VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6,$7::jsonb,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,false,$17,NOW())`,
      [
        orderId,
        userId,
        JSON.stringify(orderInput.customer || {}),
        JSON.stringify(initialOrderSkeleton.shipping),
        JSON.stringify(finalPayment),
        appliedCoupon,
        JSON.stringify(serverTotals),
        maxLead || 5,
        finalStatus,
        JSON.stringify(history),
        charge.provider,
        charge.chargeId,
        charge.checkoutUrl,
        charge.pixQrPayload,
        charge.boletoLine,
        paidAt,
        createdAt,
      ]
    );

    if (appliedCoupon) {
      await client.query(
        `INSERT INTO public.coupon_redemptions
         (coupon_code, order_id, user_id, email_norm, phone_digits, created_at)
         VALUES ($1,$2,$3,$4,$5,NOW())
         ON CONFLICT (coupon_code, order_id) DO NOTHING`,
        [
          appliedCoupon,
          orderId,
          userId,
          couponCustomerMeta?.primaryEmail || String(orderInput.customer?.email || "").trim().toLowerCase(),
          couponCustomerMeta?.primaryPhone || String(orderInput.customer?.phone || "").replace(/\D+/g, ""),
        ]
      );
      await client.query(
        "UPDATE public.coupons SET used_count = used_count + 1 WHERE code = $1",
        [appliedCoupon]
      );
    }

    for (const it of computedItems) {
      await client.query(
        `INSERT INTO public.order_items
         (order_id, product_id, name, image, mode, qty, unit_price, selections_json, photo_data, attachments_json)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb)`,
        [
          orderId,
          it.productId,
          it.name,
          it.image,
          it.mode,
          it.qty,
          it.unit,
          JSON.stringify(it.selections),
          it.photo,
          JSON.stringify(it.attachments),
        ]
      );
      for (const att of it.attachments) {
        if (att && att.id) {
          await client.query(
            `UPDATE public.order_attachments
             SET order_id = $1,
                 expires_at = NOW() + INTERVAL '7 days'
             WHERE id = $2`,
            [orderId, att.id]
          );
        }
      }
      if (it.mode === "pronta") {
        await client.query(
          `UPDATE public.products
           SET stock = GREATEST(0, COALESCE(stock, 0) - $1), updated_at = NOW()
           WHERE id = $2`,
          [it.qty, it.productId]
        );
      }
    }

    await writeAudit(client, {
      requestId: requestId || "order",
      actorId: userId,
      action: "ORDER_CREATED",
      details: { orderId, total: serverTotals.total, provider: charge.provider },
    });

    await client.query("COMMIT");

    savedOrder = {
      id: orderId,
      createdAt,
      customer: initialOrderSkeleton.customer,
      shipping: initialOrderSkeleton.shipping,
      payment: finalPayment,
      coupon: appliedCoupon,
      items: computedItems,
      totals: serverTotals,
      leadDays: maxLead || 5,
      status: finalStatus,
      history,
    };
    return savedOrder;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function processPaymentWebhookInPg({
  provider,
  eventId,
  eventType,
  orderId,
  chargeId,
  amountCents,
  rawPayload,
  requestId = null,
}) {
  await ensureDatabaseReady();
  if (!eventId || !eventType || !orderId) {
    throw orderValidationError("Webhook inválido: eventId, eventType e orderId são obrigatórios.", 400, "INVALID_WEBHOOK");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: ordRows } = await client.query(
      "SELECT * FROM public.orders WHERE id = $1 FOR UPDATE",
      [orderId]
    );
    const orderRow = ordRows[0];
    if (!orderRow) {
      throw orderValidationError("Pedido não encontrado para este webhook.", 404, "ORDER_NOT_FOUND");
    }

    const expectedTotal = Number(orderRow.totals_json?.total || 0);
    const isPaidEvent = eventType === "PAYMENT_RECEIVED" || eventType === "PAYMENT_CONFIRMED";
    const isCancelEvent = eventType === "PAYMENT_REFUNDED" || eventType === "PAYMENT_DELETED";

    // Bloqueia fraude caso valor pago no webhook seja inferior ao total calculado no servidor
    if (isPaidEvent && Number.isFinite(amountCents) && amountCents < expectedTotal) {
      throw orderValidationError(
        `Valor pago (${amountCents}) menor que o total do pedido (${expectedTotal}).`,
        400,
        "AMOUNT_MISMATCH"
      );
    }

    // Idempotência estrita via UNIQUE (provider, event_id)
    const { rows: inserted } = await client.query(
      `INSERT INTO public.payment_webhook_events
       (provider, event_id, event_type, order_id, gateway_charge_id, amount_cents, payload_json, processed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,NOW())
       ON CONFLICT (provider, event_id) DO NOTHING
       RETURNING id`,
      [
        provider,
        eventId,
        eventType,
        orderId,
        chargeId,
        Number.isFinite(amountCents) ? amountCents : null,
        JSON.stringify(rawPayload || {}),
      ]
    );

    if (inserted.length === 0) {
      await client.query("COMMIT");
      return { duplicate: true, orderId, status: orderRow.status };
    }

    let nextStatus = orderRow.status;
    const paymentJson = { ...(orderRow.payment_json || {}) };
    const history = Array.isArray(orderRow.history_json) ? [...orderRow.history_json] : [];
    const nowIso = new Date().toISOString();

    if (isPaidEvent && orderRow.status === "aguardando") {
      nextStatus = "pago";
      paymentJson.status = "aprovado";
      paymentJson.provider = provider;
      if (chargeId) paymentJson.chargeId = chargeId;
      history.push({ at: nowIso, status: "pago", note: `Pagamento confirmado via webhook (${provider}).` });

      await client.query(
        `UPDATE public.orders
         SET status = $1,
             payment_json = $2::jsonb,
             history_json = $3::jsonb,
             gateway_charge_id = COALESCE($4, gateway_charge_id),
             paid_at = COALESCE(paid_at, NOW()),
             updated_at = NOW()
         WHERE id = $5`,
        [nextStatus, JSON.stringify(paymentJson), JSON.stringify(history), chargeId, orderId]
      );
    } else if (isCancelEvent && orderRow.status !== "cancelado") {
      nextStatus = "cancelado";
      paymentJson.status = eventType === "PAYMENT_REFUNDED" ? "estornado" : "cancelado";
      history.push({ at: nowIso, status: "cancelado", note: `Pedido cancelado via webhook (${provider}).` });

      const { rows: items } = await client.query(
        "SELECT product_id, qty, mode FROM public.order_items WHERE order_id = $1",
        [orderId]
      );
      for (const it of items) {
        if (it.mode === "pronta") {
          await client.query(
            "UPDATE public.products SET stock = COALESCE(stock, 0) + $1, updated_at = NOW() WHERE id = $2",
            [it.qty, it.product_id]
          );
        }
      }

      await client.query(
        `UPDATE public.orders
         SET status = $1,
             payment_json = $2::jsonb,
             history_json = $3::jsonb,
             updated_at = NOW()
         WHERE id = $4`,
        [nextStatus, JSON.stringify(paymentJson), JSON.stringify(history), orderId]
      );
    }

    await writeAudit(client, {
      requestId: requestId || "webhook",
      actorId: null,
      action: "PAYMENT_WEBHOOK_PROCESSED",
      details: { provider, eventId, eventType, orderId, nextStatus },
    });

    await client.query("COMMIT");
    return { duplicate: false, orderId, status: nextStatus };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function uploadOrderAttachmentInPg({ productId, fileName, mimeType, base64Data, orderId = null }) {
  await ensureDatabaseReady();
  const cleanMime = String(mimeType || "").toLowerCase().trim();
  if (!ALLOWED_IMAGE_MIMES.has(cleanMime)) {
    const err = new Error("Formato inválido. Envie JPG, PNG ou WebP.");
    err.status = 422;
    throw err;
  }
  const cleanBase64 = String(base64Data || "").replace(/^data:[^;]+;base64,/, "");
  const buf = Buffer.from(cleanBase64, "base64");
  if (!buf.length || buf.length > 8 * 1024 * 1024) {
    const err = new Error("O arquivo deve ter entre 1 byte e 8 MB.");
    err.status = 422;
    throw err;
  }
  const safeName = String(fileName || "imagem-cliente.jpg")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
  const sha256 = crypto.createHash("sha256").update(buf).digest("hex");

  const { rows } = await pool.query(
    `INSERT INTO public.order_attachments
     (order_id, product_id, file_name, mime_type, size_bytes, file_data, sha256_hash, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW() + INTERVAL '7 days')
     RETURNING id, order_id, product_id, file_name, mime_type, size_bytes, created_at, expires_at`,
    [orderId, String(productId || "custom"), safeName, cleanMime, buf.length, buf, sha256]
  );
  const r = rows[0];
  return {
    id: r.id,
    orderId: r.order_id,
    productId: r.product_id,
    fileName: r.file_name,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    expiresAt: r.expires_at instanceof Date ? r.expires_at.toISOString() : r.expires_at,
    purgedAt: null,
  };
}

// Bytes originais trafegando em base64 (1,33x o tamanho real; o padrão hex do pg trafega 2x).
// O modo `binary: true` do pg 8 não serve: o protocolo lê cada coluna como texto UTF-8 e corromperia a imagem.
async function loadAttachmentsBytesInPg(attachmentIds) {
  const { rows } = await pool.query(
    `SELECT id, encode(file_data, 'base64') AS file_b64 FROM public.order_attachments
     WHERE id = ANY($1::uuid[]) AND purged_at IS NULL AND file_data IS NOT NULL AND expires_at > NOW()`,
    [attachmentIds]
  );
  return new Map(rows.map((r) => [String(r.id), Buffer.from(r.file_b64, "base64")]));
}

export async function loadAttachmentBytesInPg(attachmentId) {
  return (await loadAttachmentsBytesInPg([attachmentId])).get(String(attachmentId)) || null;
}

// Agrupa anexos em lotes de até ZIP_BATCH_BYTES por consulta: poucas idas ao banco para fotos pequenas,
// memória limitada para fotos grandes. Cada lote é buscado uma única vez e liberado conforme é enviado.
const ZIP_BATCH_BYTES = 16 * 1024 * 1024;
// O 1º lote é pequeno para o download começar assim que a 1ª foto chega, enquanto os próximos vêm em paralelo
const ZIP_FIRST_BATCH_BYTES = 1024 * 1024;

function createBatchedLoaders(attRows) {
  const batches = [];
  let current = [];
  let currentBytes = 0;
  for (const att of attRows) {
    const budget = batches.length === 0 ? ZIP_FIRST_BATCH_BYTES : ZIP_BATCH_BYTES;
    if (current.length && currentBytes + att.size_bytes > budget) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(String(att.id));
    currentBytes += att.size_bytes;
  }
  if (current.length) batches.push(current);

  const batchOf = new Map();
  batches.forEach((ids, index) => ids.forEach((id) => batchOf.set(id, index)));
  const pending = new Map();
  return (attachmentId) => {
    const index = batchOf.get(attachmentId);
    if (!pending.has(index)) pending.set(index, loadAttachmentsBytesInPg(batches[index]));
    return pending.get(index).then((map) => {
      const data = map.get(attachmentId) || null;
      map.delete(attachmentId);
      return data;
    });
  };
}

// Download individual: um anexo vencido é expurgado na hora e nunca é entregue (410), sem varrer a tabela inteira
export async function downloadOrderAttachmentInPg(attachmentId) {
  await ensureDatabaseReady();
  const { rows } = await pool.query(
    `UPDATE public.order_attachments
     SET file_data = CASE WHEN expires_at <= NOW() THEN NULL ELSE file_data END,
         purged_at = CASE WHEN expires_at <= NOW() AND purged_at IS NULL THEN NOW() ELSE purged_at END,
         downloaded_at = CASE WHEN expires_at > NOW() AND file_data IS NOT NULL
                              THEN COALESCE(downloaded_at, NOW()) ELSE downloaded_at END
     WHERE id = $1
     RETURNING id, order_id, file_name, mime_type, size_bytes, purged_at, (file_data IS NOT NULL) AS has_data`,
    [attachmentId]
  );
  const rec = rows[0];
  if (!rec) return null;
  const fileData = rec.has_data && !rec.purged_at ? await loadAttachmentBytesInPg(attachmentId) : null;
  return { ...rec, file_data: fileData };
}

function inlinePhotoEntry(item, idxStr) {
  const extMatch = item.photo_data.match(/^data:image\/([a-zA-Z0-9+]+);base64,/);
  const ext = extMatch ? extMatch[1].replace("jpeg", "jpg") : "jpg";
  const data = Buffer.from(item.photo_data.replace(/^data:[^;]+;base64,/, ""), "base64");
  return { name: `${idxStr}_${item.product_id}_foto-cliente.${ext}`, size: data.length, load: async () => data };
}

function buildLeiameEntry(orderId, orderRow, itemRows, files) {
  const leiameText = buildLeiameText(orderId, orderRow, itemRows, files);
  const data = Buffer.from(leiameText, "utf8");
  return { name: `LEIAME-${orderId}.txt`, size: data.length, load: async () => data };
}

function buildLeiameText(orderId, orderRow, itemRows, files) {
  const cust = orderRow?.customer_json || {};
  const lines = [
    `=============================================================`,
    `THAÍS DE PAULA ATELIÊ - PACOTE DE IMAGENS PARA PRODUÇÃO DE ARTE`,
    `=============================================================`,
    `Pedido: ${orderId}`,
    `Data do Pedido: ${orderRow?.created_at ? new Date(orderRow.created_at).toISOString() : "N/D"}`,
    `Cliente: ${cust.name || "N/D"}`,
    `WhatsApp: ${cust.phone || "N/D"} | E-mail: ${cust.email || "N/D"}`,
    `Total de imagens neste pacote: ${files.length}`,
    `-------------------------------------------------------------`,
    `ITENS E INSTRUÇÕES DE PERSONALIZAÇÃO:`,
    ...itemRows.map((it, i) => {
      const opts = Object.entries(it.selections_json || {})
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" | ");
      return `${i + 1}. ${it.qty}x ${it.name} (${it.product_id})\n   Personalização: ${opts || "Sem observações"}`;
    }),
    `=============================================================`,
    `Nota: As imagens são apagadas automaticamente do banco após 7 dias.`,
  ];
  return lines.join("\r\n");
}

/**
 * Manifesto do .ZIP de um pedido: lista de entradas com tamanho conhecido e leitura sob demanda (1 foto por vez).
 * Fotos vencidas (expires_at <= NOW()) nunca entram, mesmo que o expurgo agendado ainda não tenha rodado.
 */
export async function getOrderZipManifestInPg(orderId) {
  await ensureDatabaseReady();
  const [ordRes, itemRes, attRes] = await Promise.all([
    pool.query("SELECT id, customer_json, created_at FROM public.orders WHERE id = $1", [orderId]),
    pool.query(
      "SELECT product_id, name, qty, selections_json, photo_data FROM public.order_items WHERE order_id = $1 ORDER BY id ASC",
      [orderId]
    ),
    pool.query(
      `UPDATE public.order_attachments
       SET downloaded_at = COALESCE(downloaded_at, NOW())
       WHERE order_id = $1 AND purged_at IS NULL AND file_data IS NOT NULL AND expires_at > NOW()
       RETURNING id, product_id, file_name, size_bytes, created_at`,
      [orderId]
    ),
  ]);
  const orderRow = ordRes.rows[0] || null;
  const itemRows = itemRes.rows;
  const attRows = [...attRes.rows].sort((a, b) => a.created_at - b.created_at || String(a.id).localeCompare(String(b.id)));

  const loadBatched = createBatchedLoaders(attRows);
  const files = attRows.map((att, i) => {
    const idxStr = String(i + 1).padStart(2, "0");
    const safeName = String(att.file_name || `imagem-${idxStr}.jpg`).replace(/[^a-zA-Z0-9._-]/g, "_");
    return {
      name: `${idxStr}_${att.product_id}_${safeName}`,
      size: att.size_bytes,
      load: () => loadBatched(String(att.id)),
    };
  });

  // Fallback para itens com foto inline em photo_data (pedidos da demo ou legado)
  if (files.length === 0) {
    for (const it of itemRows) {
      if (it.photo_data && it.photo_data.startsWith("data:image/")) {
        files.push(inlinePhotoEntry(it, String(files.length + 1).padStart(2, "0")));
      }
    }
  }

  if (files.length > 0) files.push(buildLeiameEntry(orderId, orderRow, itemRows, files));
  return { orderExists: Boolean(orderRow), files };
}

export async function purgeOrderAttachmentsByOrderIdInPg(orderId) {
  await ensureDatabaseReady();
  const { rowCount } = await pool.query(
    `UPDATE public.order_attachments
     SET file_data = NULL, purged_at = NOW()
     WHERE order_id = $1 AND purged_at IS NULL`,
    [orderId]
  );
  await pool.query(
    `UPDATE public.order_items
     SET photo_data = 'removida'
     WHERE order_id = $1 AND photo_data IS NOT NULL`,
    [orderId]
  );
  return rowCount;
}

export async function runExpiredAttachmentsPurgeInPg() {
  await ensureDatabaseReady();
  const { rows } = await pool.query("SELECT public.purge_expired_order_images() AS purged");
  return Number(rows[0]?.purged || 0);
}

export async function updateOrderStatusInPg({ id, status, payment, history }) {
  await ensureDatabaseReady();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: prevRows } = await client.query(
      "SELECT status, coupon_code FROM public.orders WHERE id = $1 FOR UPDATE",
      [id]
    );
    const prev = prevRows[0];
    await client.query(
      `UPDATE public.orders
       SET status = $1, payment_json = $2::jsonb, history_json = $3::jsonb, updated_at = NOW()
       WHERE id = $4`,
      [status, JSON.stringify(payment), JSON.stringify(history), id]
    );
    if (prev && status === "cancelado" && prev.status !== "cancelado") {
      const { rows: deletedRed } = await client.query(
        "DELETE FROM public.coupon_redemptions WHERE order_id = $1 RETURNING coupon_code",
        [id]
      );
      if (deletedRed[0]?.coupon_code) {
        await client.query(
          "UPDATE public.coupons SET used_count = GREATEST(0, used_count - 1) WHERE code = $1",
          [deletedRed[0].coupon_code]
        );
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function resetDemoInPg() {
  await ensureDatabaseReady();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM public.order_items");
    await client.query("DELETE FROM public.orders");
    await client.query("DELETE FROM public.products");
    await client.query("DELETE FROM public.coupons");
    await client.query("DELETE FROM public.store_settings");
    await seedEcommerceIfNeeded(client);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
