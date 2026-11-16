// Testes do conteúdo controlado pelo painel: autorização, validação (links, datas, imagens), período no ar,
// injeção segura no HTML, vitrine da home, preço promocional e biblioteca de imagens.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const { hashPassword } = await import("../server/crypto.mjs");
const ADMIN_EMAIL = "admin.conteudo@exemplo.com.br";
const ADMIN_PASSWORD = `Conteudo-${Date.now()}-Teste9`;
process.env.ADMIN_EMAIL = ADMIN_EMAIL;
process.env.ADMIN_PASSWORD_HASH = hashPassword(ADMIN_PASSWORD);

const { createAppServer } = await import("../server.mjs");
const { pool, ensureDatabaseReady } = await import("../server/pg-pool.mjs");
const { cleanLink, validateBanner, invalidateSiteContentCache } = await import("../server/site-content.mjs");
const { readWebpDimensions } = await import("../server/media.mjs");
const { mergeProductOptions } = await import("../js/admin/products.js");

const MARK = `TESTE-${Date.now()}`;
const HOUR = 60 * 60 * 1000;

function siteContentFrom(html) {
  const match = html.match(/<script type="application\/json" id="site-content">([\s\S]*?)<\/script>/);
  return match ? JSON.parse(match[1]) : null;
}

test("Conteúdo do site controlado pelo painel", async (t) => {
  await ensureDatabaseReady();
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const createdBanners = [];
  const createdStrips = [];
  let originalShowcase = [];
  let originalProduct = null;
  let originalP01Options = null;

  const login = await fetch(`${base}/api/v1/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const { csrfToken } = await login.json();
  const admin = (method, path, body) => fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie, "X-CSRF-Token": csrfToken },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  t.after(async () => {
    for (const id of createdBanners) await pool.query("DELETE FROM public.site_banners WHERE id = $1", [id]).catch(() => {});
    for (const id of createdStrips) await pool.query("DELETE FROM public.site_announcements WHERE id = $1", [id]).catch(() => {});
    await pool.query("DELETE FROM public.media_assets WHERE label = $1", [MARK]).catch(() => {});
    if (originalShowcase.length) await admin("PUT", "/api/v1/admin/showcase", { ids: originalShowcase }).catch(() => {});
    if (originalProduct) {
      await pool.query("UPDATE public.products SET compare_at_price = $1, badges = $2 WHERE id = $3",
        [originalProduct.compare_at_price, originalProduct.badges, originalProduct.id]).catch(() => {});
    }
    if (originalP01Options !== null) {
      await pool.query("UPDATE public.products SET options_json = $1::jsonb WHERE id = 'p01'",
        [JSON.stringify(originalP01Options)]).catch(() => {});
    }
    await admin("POST", "/api/v1/admin/logout").catch(() => {});
    server.close();
    await pool.end().catch(() => {});
  });

  await t.test("Links aceitos só do próprio site, https ou WhatsApp (nada de javascript:, data: ou //)", () => {
    assert.equal(cleanLink("/loja.html?linha=cadernos"), "/loja.html?linha=cadernos");
    assert.equal(cleanLink("https://wa.me/5543984221611"), "https://wa.me/5543984221611");
    assert.equal(cleanLink(""), "");
    for (const bad of ["javascript:alert(1)", "data:text/html,<b>", "//evil.example", "http://inseguro.example", "https://user:senha@x.example", "/loja.html\"><script>"]) {
      assert.throws(() => cleanLink(bad), /endereço do site|link/i, bad);
    }
  });

  await t.test("Banner exige texto e link do botão juntos, descrição da imagem e fim depois do início", () => {
    const ok = { placement: "topo", imageUrl: "/img/p-caderno.webp", altText: "Caderno floral" };
    assert.equal(validateBanner(ok).placement, "topo");
    assert.throws(() => validateBanner({ ...ok, ctaLabel: "Ver" }), /texto e o link/);
    assert.throws(() => validateBanner({ ...ok, altText: "" }), /descrição/i);
    assert.throws(() => validateBanner({ ...ok, imageUrl: "https://outro.site/x.webp" }), /biblioteca/);
    assert.throws(() => validateBanner({ ...ok, placement: "rodape" }), /Posição/);
    assert.throws(() => validateBanner({ ...ok, startsAt: "2026-12-10T10:00:00Z", endsAt: "2026-12-01T10:00:00Z" }), /fim/);
    assert.throws(() => validateBanner({ ...ok, placement: "popup", popupDelayS: 1 }), /3 e 60/);
  });

  await t.test("Leitura das dimensões do WebP direto dos bytes", () => {
    assert.deepEqual(readWebpDimensions(fs.readFileSync("img/p-caderno.webp")), { width: 800, height: 800 });
    assert.deepEqual(readWebpDimensions(fs.readFileSync("img/hero-mesa.webp")), { width: 960, height: 1200 });
    assert.equal(readWebpDimensions(Buffer.from("isto não é uma imagem webp de verdade, só texto")), null);
  });

  await t.test("Todas as rotas novas do painel recusam acesso sem sessão de admin", async () => {
    const routes = [
      ["GET", "/api/v1/admin/site"],
      ["POST", "/api/v1/admin/media"],
      ["DELETE", `/api/v1/admin/media/${"a".repeat(64)}`],
      ["POST", "/api/v1/admin/banners"],
      ["PUT", "/api/v1/admin/banners/00000000-0000-0000-0000-000000000000"],
      ["DELETE", "/api/v1/admin/banners/00000000-0000-0000-0000-000000000000"],
      ["PUT", "/api/v1/admin/banners-order"],
      ["POST", "/api/v1/admin/announcements"],
      ["PUT", "/api/v1/admin/announcements-order"],
      ["PUT", "/api/v1/admin/showcase"],
    ];
    for (const [method, path] of routes) {
      const res = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json" }, body: method === "GET" ? undefined : "{}" });
      assert.equal(res.status, 401, `${method} ${path}`);
    }
    const noCsrf = await fetch(`${base}/api/v1/admin/banners`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: "{}" });
    assert.equal(noCsrf.status, 403);
  });

  await t.test("Biblioteca: recusa arquivo falso ou grande, aceita WebP real e entrega com cache de 1 ano", async () => {
    const fake = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 "), Buffer.alloc(40)]);
    const fakeRes = await admin("POST", "/api/v1/admin/media", { base64Data: fake.toString("base64") });
    assert.equal(fakeRes.status, 400);
    const pngRes = await admin("POST", "/api/v1/admin/media", { base64Data: fs.readFileSync("favicon.ico").toString("base64") });
    assert.equal(pngRes.status, 400);
    const huge = Buffer.alloc(700 * 1024, 1);
    const hugeRes = await admin("POST", "/api/v1/admin/media", { base64Data: huge.toString("base64") });
    assert.ok([400, 413].includes(hugeRes.status));

    const real = await admin("POST", "/api/v1/admin/media", { base64Data: fs.readFileSync("img/p-caderno.webp").toString("base64"), label: MARK });
    assert.equal(real.status, 201);
    const { asset } = await real.json();
    assert.equal(asset.width, 800);
    const img = await fetch(`${base}${asset.url}`);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get("content-type"), "image/webp");
    assert.match(img.headers.get("cache-control"), /max-age=31536000, immutable/);
    assert.ok(Buffer.from(await img.arrayBuffer()).equals(fs.readFileSync("img/p-caderno.webp")));
    const notModified = await fetch(`${base}${asset.url}`, { headers: { "If-None-Match": `"${asset.sha256}"` } });
    assert.equal(notModified.status, 304);
    const missing = await fetch(`${base}/media/${"0".repeat(64)}.webp`);
    assert.equal(missing.status, 404);
  });

  await t.test("Só banner ligado e dentro do período chega ao site; texto com </script> e $& não quebra a página", async () => {
    const now = Date.now();
    const variants = [
      { key: "noAr", body: { title: `${MARK} no ar </script><b>x</b> R$& $'` } },
      { key: "futuro", body: { title: `${MARK} futuro`, startsAt: new Date(now + 2 * HOUR).toISOString() } },
      { key: "vencido", body: { title: `${MARK} vencido`, startsAt: new Date(now - 3 * HOUR).toISOString(), endsAt: new Date(now - HOUR).toISOString() } },
      { key: "desligado", body: { title: `${MARK} desligado`, active: false } },
    ];
    for (const v of variants) {
      const res = await admin("POST", "/api/v1/admin/banners", { placement: "meio", imageUrl: "/img/p-bloco.webp", altText: "Bloco de anotações", ...v.body });
      assert.equal(res.status, 201, v.key);
      createdBanners.push((await res.json()).item.id);
    }
    invalidateSiteContentCache();
    const html = await fetch(`${base}/`).then((r) => r.text());
    const content = siteContentFrom(html);
    assert.ok(content, "conteúdo injetado e JSON válido");
    const titles = content.banners.meio.map((b) => b.title);
    assert.ok(titles.includes(`${MARK} no ar </script><b>x</b> R$& $'`));
    assert.ok(!titles.some((tt) => /futuro|vencido|desligado/.test(tt) && tt.startsWith(MARK)));
    assert.ok(!html.includes("</script><b>x</b>"), "o < do conteúdo sai escapado dentro do JSON");
    assert.equal((html.match(/<\/head>/g) || []).length, 1);

    // Páginas fora da home/loja recebem só as faixas, nunca banners
    const checkout = siteContentFrom(await fetch(`${base}/checkout.html`).then((r) => r.text()));
    assert.equal(checkout.banners.meio.length, 0);
    assert.equal(checkout.banners.popup, null);
  });

  await t.test("Faixa recusa link perigoso e aparece em todas as páginas públicas", async () => {
    const bad = await admin("POST", "/api/v1/admin/announcements", { text: `${MARK} faixa`, linkLabel: "Ver", linkUrl: "javascript:alert(1)" });
    assert.equal(bad.status, 400);
    const res = await admin("POST", "/api/v1/admin/announcements", { text: `${MARK} faixa`, linkLabel: "Ver a loja", linkUrl: "/loja.html", theme: "salvia" });
    assert.equal(res.status, 201);
    createdStrips.push((await res.json()).item.id);
    const page = siteContentFrom(await fetch(`${base}/termos-de-uso.html`).then((r) => r.text()));
    assert.ok(page.announcements.some((a) => a.text === `${MARK} faixa` && a.theme === "salvia"));
  });

  await t.test("Vitrine: no máximo 12, sem produto inexistente, ordem salva e espelhada no catálogo público", async () => {
    const { rows } = await pool.query("SELECT id FROM public.products WHERE home_order IS NOT NULL ORDER BY home_order");
    originalShowcase = rows.map((r) => r.id);
    const { rows: all } = await pool.query("SELECT id FROM public.products ORDER BY id LIMIT 13");

    assert.equal((await admin("PUT", "/api/v1/admin/showcase", { ids: ["nao-existe"] })).status, 400);
    assert.equal((await admin("PUT", "/api/v1/admin/showcase", { ids: all.map((r) => r.id) })).status, 400);
    assert.equal((await admin("PUT", "/api/v1/admin/showcase", { ids: [all[0].id, all[0].id] })).status, 400);

    const wanted = [all[2].id, all[0].id];
    assert.equal((await admin("PUT", "/api/v1/admin/showcase", { ids: wanted })).status, 200);
    const snap = await fetch(`${base}/api/v1/store/snapshot`).then((r) => r.json());
    const ordered = snap.products.filter((p) => p.homeOrder).sort((a, b) => a.homeOrder - b.homeOrder).map((p) => p.id);
    assert.deepEqual(ordered, wanted.filter((id) => snap.products.some((p) => p.id === id)));
  });

  await t.test("Preço promocional: 'de' precisa ser maior que o atual; selos só da lista", async () => {
    const { rows } = await pool.query("SELECT * FROM public.products ORDER BY id LIMIT 1");
    originalProduct = rows[0];
    const product = {
      id: rows[0].id, slug: rows[0].slug, name: rows[0].name, line: rows[0].line, mode: rows[0].mode, price: rows[0].price,
      stock: rows[0].stock, leadDays: rows[0].lead_days, active: rows[0].active, image: rows[0].image,
      description: rows[0].description, options: rows[0].options_json,
    };
    const low = await admin("POST", "/api/v1/store/products", { product: { ...product, compareAtPrice: product.price } });
    assert.equal(low.status, 400);
    const badBadge = await admin("POST", "/api/v1/store/products", { product: { ...product, badges: ["gratis"] } });
    assert.equal(badBadge.status, 400);
    const badImage = await admin("POST", "/api/v1/store/products", { product: { ...product, image: "javascript:alert(1)" } });
    assert.equal(badImage.status, 400);
    const ok = await admin("POST", "/api/v1/store/products", { product: { ...product, compareAtPrice: product.price + 1000, badges: ["novidade"] } });
    assert.equal(ok.status, 200);
    const snap = await fetch(`${base}/api/v1/store/snapshot`).then((r) => r.json());
    const saved = snap.products.find((p) => p.id === product.id);
    assert.equal(saved.compareAtPrice, product.price + 1000);
    assert.deepEqual(saved.badges, ["novidade"]);
  });

  await t.test("Imagem em uso num banner não pode ser apagada da biblioteca", async () => {
    const up = await admin("POST", "/api/v1/admin/media", { base64Data: fs.readFileSync("img/p-lapis.webp").toString("base64"), label: MARK });
    const { asset } = await up.json();
    const banner = await admin("POST", "/api/v1/admin/banners", { placement: "meio", imageUrl: asset.url, altText: "Lápis pastel", active: false });
    createdBanners.push((await banner.json()).item.id);
    assert.equal((await admin("DELETE", `/api/v1/admin/media/${asset.sha256}`)).status, 409);
  });

  await t.test("Painel alterna upload de fotos em Cadernos (p01) preservando opções e persiste no catálogo", async () => {
    const snapBefore = await fetch(`${base}/api/v1/store/snapshot`).then((r) => r.json());
    const p01 = snapBefore.products.find((p) => p.id === "p01");
    assert.ok(p01, "p01 existe no snapshot");
    originalP01Options = JSON.parse(JSON.stringify(p01.options));
    assert.ok(originalP01Options.length > 2, "p01 possui mais de 2 opções");

    try {
      const enabledOpts = mergeProductOptions(originalP01Options, {
        hasNameOpt: true,
        hasPhotoOpt: true,
        photoRequired: false,
      });
      assert.equal(enabledOpts.length, originalP01Options.length + 1);
      assert.equal(enabledOpts.find((o) => o.type === "photo")?.required, false);
      assert.deepEqual(
        enabledOpts.filter((o) => o.type !== "photo").map((o) => o.id),
        originalP01Options.map((o) => o.id)
      );

      const resEnable = await admin("POST", "/api/v1/store/products", {
        product: { ...p01, options: enabledOpts },
      });
      assert.equal(resEnable.status, 200);

      const snapEnabled = await fetch(`${base}/api/v1/store/snapshot`).then((r) => r.json());
      const p01Enabled = snapEnabled.products.find((p) => p.id === "p01");
      assert.ok(p01Enabled.options.some((o) => o.type === "photo"));
      assert.ok(["nome", "tamanho", "miolo", "tema", "obs"].every((id) => p01Enabled.options.some((o) => o.id === id)));

      const disabledOpts = mergeProductOptions(p01Enabled.options, {
        hasNameOpt: true,
        hasPhotoOpt: false,
      });
      const resDisable = await admin("POST", "/api/v1/store/products", {
        product: { ...p01Enabled, options: disabledOpts },
      });
      assert.equal(resDisable.status, 200);

      const snapDisabled = await fetch(`${base}/api/v1/store/snapshot`).then((r) => r.json());
      const p01Disabled = snapDisabled.products.find((p) => p.id === "p01");
      assert.equal(p01Disabled.options.some((o) => o.type === "photo"), false);
      assert.deepEqual(
        p01Disabled.options.map((o) => o.id),
        originalP01Options.map((o) => o.id)
      );

      // Também permite habilitar upload em produto originalmente sem opções (pronta entrega)
      const prontaOpts = mergeProductOptions([], { hasNameOpt: false, hasPhotoOpt: true, photoRequired: true });
      assert.deepEqual(
        prontaOpts.map((o) => ({ type: o.type, required: o.required })),
        [{ type: "photo", required: true }]
      );
    } finally {
      if (originalP01Options !== null) {
        await admin("POST", "/api/v1/store/products", { product: { ...p01, options: originalP01Options } }).catch(() => {});
      }
    }
  });
});
