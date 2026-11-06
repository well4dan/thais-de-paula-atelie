// Pool de conexão PostgreSQL (Supabase) + Inicialização de Migração e Seed + Keep-Alive Anti-Pausa

import "./env.mjs";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { PRODUCTS, COUPONS, SETTINGS } from "../js/data/seed.js";
import { buildDemoOrders } from "../js/data/demo-orders.js";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não configurada no arquivo .env");
}

function normalizeDatabaseUrl(rawUrl) {
  return String(rawUrl).trim().replace(/:\[([^\]]+)\]@/, (_, pw) => `:${encodeURIComponent(pw)}@`);
}

const connectionString = normalizeDatabaseUrl(process.env.DATABASE_URL);
const isLocalhost = /localhost|127\.0\.0\.1/.test(connectionString);

export const pool = new Pool({
  connectionString,
  ssl: isLocalhost ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

export async function pingKeepAlive(source = "interval") {
  let purgedImages = 0;
  try {
    const purgeRes = await pool.query("SELECT public.purge_expired_order_images() AS purged");
    purgedImages = Number(purgeRes.rows[0]?.purged || 0);
  } catch {
    // Caso a migration 003 ainda esteja sendo aplicada
  }
  const res = await pool.query(
    `INSERT INTO public.keep_alive_heartbeat (id, last_beat_at, total_beats, last_source, note)
     VALUES (1, NOW(), 1, $1, 'Thaís de Paula Ateliê - Keep Alive Ativo')
     ON CONFLICT (id) DO UPDATE
       SET last_beat_at = NOW(),
           total_beats = public.keep_alive_heartbeat.total_beats + 1,
           last_source = EXCLUDED.last_source
     RETURNING last_beat_at, total_beats, last_source`,
    [source]
  );
  return { ...res.rows[0], purged_images: purgedImages };
}

export async function seedEcommerceIfNeeded(client) {
  const { rows: prodCount } = await client.query("SELECT COUNT(*)::int AS cnt FROM public.products");
  if (prodCount[0].cnt === 0) {
    for (const p of PRODUCTS) {
      await client.query(
        `INSERT INTO public.products
         (id, slug, name, line, mode, price, stock, lead_days, featured, active, image, description, options_json)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
         ON CONFLICT (id) DO NOTHING`,
        [
          p.id,
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
  }

  const { rows: cupCount } = await client.query("SELECT COUNT(*)::int AS cnt FROM public.coupons");
  if (cupCount[0].cnt === 0) {
    for (const c of COUPONS) {
      await client.query(
        `INSERT INTO public.coupons (code, type, value, min_order, active)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (code) DO NOTHING`,
        [c.code, c.type, c.value, c.minOrder || 0, Boolean(c.active)]
      );
    }
  }

  const { rows: setCount } = await client.query("SELECT COUNT(*)::int AS cnt FROM public.store_settings");
  if (setCount[0].cnt === 0) {
    await client.query(
      `INSERT INTO public.store_settings (id, settings_json, updated_at)
       VALUES (1, $1::jsonb, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [JSON.stringify(SETTINGS)]
    );
  }

  const { rows: ordCount } = await client.query("SELECT COUNT(*)::int AS cnt FROM public.orders");
  if (ordCount[0].cnt === 0) {
    const demoOrders = buildDemoOrders(PRODUCTS);
    for (const o of demoOrders) {
      await client.query(
        `INSERT INTO public.orders
         (id, customer_json, shipping_json, payment_json, coupon_code, totals_json, lead_days, status, history_json, is_demo, created_at, updated_at)
         VALUES ($1,$2::jsonb,$3::jsonb,$4::jsonb,$5,$6::jsonb,$7,$8,$9::jsonb,true,$10,$10)
         ON CONFLICT (id) DO NOTHING`,
        [
          o.id,
          JSON.stringify(o.customer),
          JSON.stringify(o.shipping),
          JSON.stringify(o.payment),
          o.coupon,
          JSON.stringify(o.totals),
          o.leadDays || 5,
          o.status,
          JSON.stringify(o.history || []),
          o.createdAt,
        ]
      );
      for (const it of o.items) {
        await client.query(
          `INSERT INTO public.order_items
           (order_id, product_id, name, image, mode, qty, unit_price, selections_json, photo_data)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
          [
            o.id,
            it.productId,
            it.name,
            it.image,
            it.mode,
            it.qty,
            it.unit,
            JSON.stringify(it.selections || {}),
            it.photo || null,
          ]
        );
      }
    }
  }
}

let initializedPromise = null;

export function ensureDatabaseReady() {
  if (!initializedPromise) {
    initializedPromise = (async () => {
      const m002 = path.resolve(
        process.cwd(),
        "supabase/migrations/002_full_ecommerce_and_keepalive.sql"
      );
      const m003 = path.resolve(
        process.cwd(),
        "supabase/migrations/003_order_attachments_ttl7d.sql"
      );
      const sql002 = fs.readFileSync(m002, "utf8");
      const sql003 = fs.readFileSync(m003, "utf8");
      const client = await pool.connect();
      try {
        await client.query(sql002);
        await client.query(sql003);
        await seedEcommerceIfNeeded(client);
      } finally {
        client.release();
      }
      await pingKeepAlive("server_boot");
    })();
  }
  return initializedPromise;
}
