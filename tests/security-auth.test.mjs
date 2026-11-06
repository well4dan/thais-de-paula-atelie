// Testes automatizados de Segurança, Autenticação, Validação de CPF, LGPD, E-commerce PostgreSQL e Keep-Alive Supabase

import test from "node:test";
import assert from "node:assert/strict";

const { createAppServer } = await import("../server.mjs");
const { pool, ensureDatabaseReady } = await import("../server/pg-pool.mjs");
const { clearRateLimitsForTest } = await import("../server/auth-routes.mjs");

function makeValidCpf(seed = "529982247") {
  const digits = seed.split("").map(Number);
  let s1 = 0;
  for (let i = 0; i < 9; i += 1) s1 += digits[i] * (10 - i);
  let d1 = (s1 * 10) % 11;
  if (d1 === 10) d1 = 0;
  digits.push(d1);
  let s2 = 0;
  for (let i = 0; i < 10; i += 1) s2 += digits[i] * (11 - i);
  let d2 = (s2 * 10) % 11;
  if (d2 === 10) d2 = 0;
  digits.push(d2);
  return digits.join("");
}

const randomNineDigits = String(Math.floor(100000000 + Math.random() * 899999999));
const TEST_EMAIL = `mariana.teste.${Date.now()}@exemplo.com.br`;

const VALID_PAYLOAD = {
  name: "Mariana Alves de Souza",
  cpf: makeValidCpf(randomNineDigits),
  email: TEST_EMAIL,
  phone: "(43) 98422-1611",
  password: "Atelie@2026!Forte",
  address: {
    cep: "86010-150",
    street: "Rua Senador Souza Naves",
    number: "440",
    complement: "Sala 12",
    district: "Centro",
    city: "Londrina",
    uf: "PR",
  },
  acceptTerms: true,
  acceptLgpd: true,
};

test("Segurança de Autenticação, CPF, Endereço, Termos, LGPD, E-commerce e Keep-Alive no Supabase PostgreSQL", async (t) => {
  await ensureDatabaseReady();
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  let createdUserId = "";

  t.after(async () => {
    if (createdUserId) {
      await pool.query("DELETE FROM public.audit_logs WHERE user_id = $1", [createdUserId]).catch(() => {});
      await pool.query("DELETE FROM public.users WHERE id = $1", [createdUserId]).catch(() => {});
    }
    server.close();
    await pool.end().catch(() => {});
  });

  await t.test("0. Endpoint Keep-Alive responde 200 e grava batimento no Supabase PostgreSQL", async () => {
    const res = await fetch(`${baseUrl}/api/v1/health/keep-alive`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.database, "supabase_postgres");
    assert.ok(Number(body.heartbeat.total_beats) >= 1);
  });

  await t.test("0b. Endpoint /api/v1/store/snapshot retorna produtos, cupons e configurações do PostgreSQL", async () => {
    const res = await fetch(`${baseUrl}/api/v1/store/snapshot`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.products));
    assert.ok(body.products.length >= 16);
    assert.ok(Array.isArray(body.coupons));
  });

  await t.test("1. Bloqueia cadastro sem aceitar os Termos de Uso ou o Termo LGPD", async () => {
    clearRateLimitsForTest();
    const res1 = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_PAYLOAD, acceptTerms: false }),
    });
    assert.equal(res1.status, 422);
    const body1 = await res1.json();
    assert.ok(body1.details.acceptTerms);

    const res2 = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_PAYLOAD, acceptLgpd: false }),
    });
    assert.equal(res2.status, 422);
    const body2 = await res2.json();
    assert.ok(body2.details.acceptLgpd);
  });

  await t.test("2. Rejeita CPF inválido e senha fraca", async () => {
    clearRateLimitsForTest();
    const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...VALID_PAYLOAD,
        cpf: "111.111.111-11",
        password: "123",
      }),
    });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.ok(body.details.cpf);
    assert.ok(body.details.password);
  });

  let sessionCookie = "";
  let csrfToken = "";

  await t.test("3. Cria conta válida no Supabase PostgreSQL, criptografa CPF em repouso (AES-256-GCM) e grava consentimento LGPD", async () => {
    clearRateLimitsForTest();
    const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_PAYLOAD),
    });
    assert.equal(res.status, 201);
    const setCookie = res.headers.get("set-cookie") || "";
    assert.match(setCookie, /HttpOnly/i);
    sessionCookie = setCookie.split(";")[0];

    const body = await res.json();
    csrfToken = body.csrfToken;
    createdUserId = body.user.id;
    assert.ok(csrfToken);
    assert.equal(body.user.email, VALID_PAYLOAD.email);
    assert.match(body.user.cpfMasked, /^\*\*\*\.\d{3}\.\d{3}-\d{2}$/);
    assert.equal(body.user.address.city, "Londrina");
    assert.equal(body.user.consents.length, 1);

    // Verifica no PostgreSQL que o CPF NÃO está em texto puro e a senha é scrypt
    const { rows } = await pool.query(
      "SELECT cpf_encrypted, password_hash FROM public.users WHERE email = $1",
      [VALID_PAYLOAD.email]
    );
    const rawRow = rows[0];
    assert.ok(rawRow);
    assert.ok(!rawRow.cpf_encrypted.includes(VALID_PAYLOAD.cpf));
    assert.match(rawRow.cpf_encrypted, /^v1:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    assert.match(rawRow.password_hash, /^scrypt\$/);
  });

  await t.test("4. Bloqueia mutação sem cabeçalho X-CSRF-Token (proteção CSRF)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/me`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        name: "Mariana Alterada",
        phone: "(43) 98422-1611",
        address: VALID_PAYLOAD.address,
      }),
    });
    assert.equal(res.status, 403);
  });

  await t.test("5. Permite atualizar perfil com CSRF válido e exportar pacote LGPD completo", async () => {
    const resUpdate = await fetch(`${baseUrl}/api/v1/me`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookie,
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({
        name: "Mariana Alves Atualizada",
        phone: "(43) 98422-1611",
        address: { ...VALID_PAYLOAD.address, number: "500" },
      }),
    });
    assert.equal(resUpdate.status, 200);
    const updated = await resUpdate.json();
    assert.equal(updated.user.name, "Mariana Alves Atualizada");
    assert.equal(updated.user.address.number, "500");

    const resExport = await fetch(`${baseUrl}/api/v1/me/export-lgpd`, {
      method: "POST",
      headers: {
        Cookie: sessionCookie,
        "X-CSRF-Token": csrfToken,
      },
    });
    assert.equal(resExport.status, 200);
    const exported = await resExport.json();
    assert.equal(exported.data.holder.name, "Mariana Alves Atualizada");
    assert.equal(exported.data.consents.length, 1);
  });

  await t.test("6. Rate limit bloqueia ataques de força bruta no login com HTTP 429", async () => {
    clearRateLimitsForTest();
    for (let i = 0; i < 6; i += 1) {
      const r = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: VALID_PAYLOAD.email, password: "SenhaErrada@123" }),
      });
      assert.equal(r.status, 401);
    }
    const blocked = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: VALID_PAYLOAD.email, password: "SenhaErrada@123" }),
    });
    assert.equal(blocked.status, 429);
  });

  await t.test("7. Exclui e anonimiza a conta no Supabase PostgreSQL (Direito ao esquecimento LGPD)", async () => {
    const resDel = await fetch(`${baseUrl}/api/v1/me`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookie,
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({ password: VALID_PAYLOAD.password }),
    });
    assert.equal(resDel.status, 200);

    const resMe = await fetch(`${baseUrl}/api/v1/me`, {
      headers: { Cookie: sessionCookie },
    });
    assert.equal(resMe.status, 401);
  });

  await t.test("8. Upload de imagem original da cliente, download fiel pela administradora e exclusão automática após 7 dias", async () => {
    // Cria um PNG 1x1 válido em bytes
    const samplePngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const expectedBuffer = Buffer.from(samplePngBase64, "base64");

    const upRes = await fetch(`${baseUrl}/api/v1/store/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: "p-polaroide-12",
        fileName: "foto-cliente-original.png",
        mimeType: "image/png",
        base64Data: `data:image/png;base64,${samplePngBase64}`,
      }),
    });
    assert.equal(upRes.status, 201);
    const upBody = await upRes.json();
    const attId = upBody.attachment.id;
    assert.ok(attId);
    assert.equal(upBody.attachment.sizeBytes, expectedBuffer.length);

    // Administradora faz o download da imagem original
    const dlRes = await fetch(`${baseUrl}/api/v1/store/attachments/${attId}/download`);
    assert.equal(dlRes.status, 200);
    assert.equal(dlRes.headers.get("content-type"), "image/png");
    assert.match(dlRes.headers.get("content-disposition") || "", /foto-cliente-original\.png/);
    const downloadedBuf = Buffer.from(await dlRes.arrayBuffer());
    assert.ok(downloadedBuf.equals(expectedBuffer));

    // Simula passagem de mais de 7 dias no banco e dispara a rotina automática de expurgo
    await pool.query(
      "UPDATE public.order_attachments SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1",
      [attId]
    );
    const purgeRes = await fetch(`${baseUrl}/api/v1/store/attachments/purge-expired`, {
      method: "POST",
    });
    assert.equal(purgeRes.status, 200);

    // Verifica que os bytes foram apagados do banco (file_data IS NULL) e o download retorna 410 Gone
    const { rows } = await pool.query(
      "SELECT file_data, purged_at FROM public.order_attachments WHERE id = $1",
      [attId]
    );
    assert.equal(rows[0].file_data, null);
    assert.ok(rows[0].purged_at);

    const dlAfter = await fetch(`${baseUrl}/api/v1/store/attachments/${attId}/download`);
    assert.equal(dlAfter.status, 410);

    // Limpa registro de teste
    await pool.query("DELETE FROM public.order_attachments WHERE id = $1", [attId]);
  });
});
