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

export async function getFullStoreSnapshot() {
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
    products: prodRes.rows.map((r) => ({
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
    })),
    coupons: cupRes.rows.map((c) => ({
      code: c.code,
      type: c.type,
      value: c.value,
      minOrder: c.min_order,
      active: c.active,
    })),
    settings: setRes.rows[0]?.settings_json || {},
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

export async function upsertProductInPg(p) {
  await ensureDatabaseReady();
  const id = p.id || `p${Date.now().toString(36)}`;
  await pool.query(
    `INSERT INTO public.products
     (id, slug, name, line, mode, price, stock, lead_days, featured, active, image, description, options_json, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,NOW())
     ON CONFLICT (id) DO UPDATE SET
       slug = EXCLUDED.slug,
       name = EXCLUDED.name,
       line = EXCLUDED.line,
       mode = EXCLUDED.mode,
       price = EXCLUDED.price,
       stock = EXCLUDED.stock,
       lead_days = EXCLUDED.lead_days,
       featured = EXCLUDED.featured,
       active = EXCLUDED.active,
       image = EXCLUDED.image,
       description = EXCLUDED.description,
       options_json = EXCLUDED.options_json,
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
      Boolean(p.featured),
      Boolean(p.active),
      p.image,
      p.description,
      JSON.stringify(p.options || []),
    ]
  );
}

export async function deleteProductInPg(id) {
  await ensureDatabaseReady();
  await pool.query("DELETE FROM public.products WHERE id = $1", [id]);
}

export async function upsertCouponInPg(c) {
  await ensureDatabaseReady();
  await pool.query(
    `INSERT INTO public.coupons (code, type, value, min_order, active)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (code) DO UPDATE SET
       type = EXCLUDED.type,
       value = EXCLUDED.value,
       min_order = EXCLUDED.min_order,
       active = EXCLUDED.active`,
    [c.code, c.type, c.value, c.minOrder || 0, Boolean(c.active)]
  );
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

export async function createOrderInPg(order, userId = null) {
  await ensureDatabaseReady();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO public.orders
       (id, user_id, customer_json, shipping_json, payment_json, coupon_code, totals_json, lead_days, status, history_json, is_demo, created_at, updated_at)
       VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6,$7::jsonb,$8,$9,$10::jsonb,false,$11,NOW())
       ON CONFLICT (id) DO NOTHING`,
      [
        order.id,
        userId,
        JSON.stringify(order.customer),
        JSON.stringify(order.shipping),
        JSON.stringify(order.payment),
        order.coupon,
        JSON.stringify(order.totals),
        order.leadDays || 5,
        order.status,
        JSON.stringify(order.history || []),
        order.createdAt,
      ]
    );

    for (const it of order.items) {
      const attList = Array.isArray(it.attachments) ? it.attachments : [];
      await client.query(
        `INSERT INTO public.order_items
         (order_id, product_id, name, image, mode, qty, unit_price, selections_json, photo_data, attachments_json)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb)`,
        [
          order.id,
          it.productId,
          it.name,
          it.image,
          it.mode,
          it.qty,
          it.unit,
          JSON.stringify(it.selections || {}),
          it.photo || null,
          JSON.stringify(attList),
        ]
      );
      for (const att of attList) {
        if (att && att.id) {
          await client.query(
            `UPDATE public.order_attachments
             SET order_id = $1,
                 expires_at = NOW() + INTERVAL '7 days'
             WHERE id = $2`,
            [order.id, att.id]
          );
        }
      }
      await client.query(
        `UPDATE public.products
         SET stock = GREATEST(0, COALESCE(stock, 0) - $1), updated_at = NOW()
         WHERE id = $2 AND mode = 'pronta'`,
        [it.qty, it.productId]
      );
    }
    await client.query("COMMIT");
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

export async function downloadOrderAttachmentInPg(attachmentId) {
  await ensureDatabaseReady();
  await pool.query("SELECT public.purge_expired_order_images()");
  const { rows } = await pool.query(
    `UPDATE public.order_attachments
     SET downloaded_at = COALESCE(downloaded_at, NOW())
     WHERE id = $1
     RETURNING id, order_id, product_id, file_name, mime_type, size_bytes, file_data, created_at, expires_at, purged_at`,
    [attachmentId]
  );
  return rows[0] || null;
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
  await pool.query(
    `UPDATE public.orders
     SET status = $1, payment_json = $2::jsonb, history_json = $3::jsonb, updated_at = NOW()
     WHERE id = $4`,
    [status, JSON.stringify(payment), JSON.stringify(history), id]
  );
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
