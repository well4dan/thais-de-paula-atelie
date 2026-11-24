// Pool de conexão PostgreSQL (Supabase) + Inicialização de Migração e Seed + Keep-Alive Anti-Pausa

import "./env.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { PRODUCTS, COUPONS, SETTINGS } from "../js/data/seed.js";
import { buildDemoOrders } from "../js/data/demo-orders.js";

const { Pool } = pg;
const MIGRATIONS_DIR = fileURLToPath(new URL("../supabase/migrations", import.meta.url));
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

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
  max: isServerless ? 3 : 10,
  // Em serverless fecha conexões ociosas mais rápido; em servidor contínuo mantém por 5 min para agilizar o painel
  idleTimeoutMillis: isServerless ? 10_000 : 5 * 60 * 1000,
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

  for (const c of COUPONS) {
    await client.query(
      `INSERT INTO public.coupons (code, type, value, min_order, active, first_purchase_only, single_use_per_customer)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (code) DO NOTHING`,
      [
        c.code,
        c.type,
        c.value,
        c.minOrder || 0,
        Boolean(c.active),
        Boolean(c.firstPurchaseOnly),
        c.singleUsePerCustomer !== false,
      ]
    );
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
const MIGRATION_LOCK_KEY = 741852963;

async function isSchemaAndSeedReady(client) {
  const { rows } = await client.query(`
    SELECT
      to_regclass('public.users') IS NOT NULL
      AND to_regclass('public.products') IS NOT NULL
      AND to_regclass('public.order_attachments') IS NOT NULL
      AND to_regclass('public.admin_sessions') IS NOT NULL
      AND to_regclass('public.site_banners') IS NOT NULL
      AND to_regclass('public.site_announcements') IS NOT NULL
      AND to_regclass('public.payment_webhook_events') IS NOT NULL
      AND to_regclass('public.coupon_redemptions') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'shipping_carrier'
      ) AS migrations_ok
  `);
  if (!rows[0]?.migrations_ok) return false;
  const { rows: seedRows } = await client.query("SELECT EXISTS(SELECT 1 FROM public.products LIMIT 1) AS seeded");
  return Boolean(seedRows[0]?.seeded);
}

export function ensureDatabaseReady() {
  if (!initializedPromise) {
    initializedPromise = (async () => {
      const migrationFiles = [
        "002_full_ecommerce_and_keepalive.sql",
        "003_order_attachments_ttl7d.sql",
        "004_admin_sessions.sql",
        "005_site_content.sql",
        "006_payments_and_financial_lock.sql",
        "007_coupon_usage_lock.sql",
        "008_shipping_loggi_and_motoboy.sql",
      ];
      const client = await pool.connect();
      try {
        const fastReady = await isSchemaAndSeedReady(client);
        if (!fastReady) {
          await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
          try {
            const recheck = await isSchemaAndSeedReady(client);
            if (!recheck) {
              for (const file of migrationFiles) {
                const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
                await client.query(sql);
              }
              await seedEcommerceIfNeeded(client);
              // Banco novo: a vitrine nasce com os destaques do catálogo de exemplo (no-op se já foi montada)
              await client.query("SELECT public.backfill_home_showcase()");
            }
          } finally {
            await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => {});
          }
        }
      } finally {
        client.release();
      }
      if (!isServerless) {
        await pingKeepAlive("server_boot");
      }
    })().catch((err) => {
      initializedPromise = null;
      throw err;
    });
  }
  return initializedPromise;
}
