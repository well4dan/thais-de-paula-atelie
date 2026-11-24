// Testes do modo unificado na Vercel: whitelist de build estático (dist/), rewrite proxy (__tp_route),
// isolamento de arquivos do servidor, endpoint /api/v1/site/content e rotas da API via Serverless Function.

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const { buildPublicDist } = await import("../scripts/build-vercel.mjs");
const { default: vercelHandler, resolveVercelUrl } = await import("../api/index.mjs");
const { pool, ensureDatabaseReady } = await import("../server/pg-pool.mjs");

test("Adaptador Vercel Unificado (Estáticos dist/ + API Serverless no mesmo domínio)", async (t) => {
  await ensureDatabaseReady();
  const server = http.createServer((req, res) => vercelHandler(req, res));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    server.close();
    await pool.end().catch(() => {});
  });

  await t.test("Build público (dist/) copia apenas arquivos do site e exclui backend/segredos", () => {
    const { copied, distDir } = buildPublicDist();
    assert.ok(copied > 10);
    assert.equal(fs.existsSync(path.join(distDir, "index.html")), true);
    assert.equal(fs.existsSync(path.join(distDir, "painel-tp", "index.html")), true);
    assert.equal(fs.existsSync(path.join(distDir, "js", "site-content.js")), true);

    for (const secretPath of ["server", "supabase", "tests", "docs", "scripts", "api", "server.mjs", "package.json", ".env"]) {
      assert.equal(fs.existsSync(path.join(distDir, secretPath)), false, `${secretPath} não deve ir para dist/`);
    }
  });

  await t.test("resolveVercelUrl reconstrói rotas e bloqueia acesso direto ou traversal", () => {
    const directApi = resolveVercelUrl({ url: "/api/v1/store/snapshot" });
    assert.equal(directApi?.pathname, "/api/v1/store/snapshot");

    const rewritten = resolveVercelUrl({ url: "/api/index.mjs?__tp_route=/api/v1/orders/TP-2026-1234&phone=1611" });
    assert.equal(rewritten?.pathname, "/api/v1/orders/TP-2026-1234");
    assert.equal(rewritten?.searchParams.get("phone"), "1611");
    assert.equal(rewritten?.searchParams.has("__tp_route"), false);

    const media = resolveVercelUrl({ url: `/api/index.mjs?__tp_route=/media/${"a".repeat(64)}.webp` });
    assert.equal(media?.pathname, `/media/${"a".repeat(64)}.webp`);

    assert.equal(resolveVercelUrl({ url: "/api/index.mjs" }), null);
    assert.equal(resolveVercelUrl({ url: "/api/index.mjs?__tp_route=/server/db.mjs" }), null);
    assert.equal(resolveVercelUrl({ url: "/api/index.mjs?__tp_route=/api/v1/../.env" }), null);
    assert.equal(resolveVercelUrl({ url: "/api/index.mjs?__tp_route=/api/v1/%2e%2e/server.mjs" }), null);
  });

  await t.test("Endpoints via handler da Vercel respondem com segurança e mesmos dados do servidor local", async () => {
    const health = await fetch(`${base}/api/index.mjs?__tp_route=/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok", runtime: "vercel" });

    const snapRes = await fetch(`${base}/api/index.mjs?__tp_route=/api/v1/store/snapshot`);
    assert.equal(snapRes.status, 200);
    assert.equal(snapRes.headers.get("x-robots-tag"), "noindex, nofollow");
    const snap = await snapRes.json();
    assert.ok(Array.isArray(snap.products) && snap.products.length >= 16);

    const siteHome = await fetch(`${base}/api/index.mjs?__tp_route=/api/v1/site/content&page=/index.html`);
    assert.equal(siteHome.status, 200);
    assert.match(siteHome.headers.get("cache-control") || "", /s-maxage=30/);
    const homeData = await siteHome.json();
    assert.ok(Array.isArray(homeData.announcements));
    assert.ok(homeData.banners && Array.isArray(homeData.banners.topo));

    const siteCheckout = await fetch(`${base}/api/index.mjs?__tp_route=/api/v1/site/content&page=/checkout.html`);
    assert.equal(siteCheckout.status, 200);
    const checkoutData = await siteCheckout.json();
    assert.equal(checkoutData.banners.topo.length, 0);
    assert.equal(checkoutData.banners.meio.length, 0);
    assert.equal(checkoutData.banners.popup, null);

    const cepRes = await fetch(`${base}/api/index.mjs?__tp_route=/api/v1/cep/86181-000`);
    assert.equal(cepRes.status, 200);
    const cepData = await cepRes.json();
    assert.equal(cepData.address.city, "Cambé");
    assert.equal(cepData.address.uf, "PR");

    const webhookNoAuth = await fetch(`${base}/api/index.mjs?__tp_route=/api/v1/webhooks/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "PAYMENT_RECEIVED" }),
    });
    assert.equal(webhookNoAuth.status, 401);

    const bareIndex = await fetch(`${base}/api/index.mjs`);
    assert.equal(bareIndex.status, 404);
  });
});
