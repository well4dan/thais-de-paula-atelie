// Testes automatizados de Segurança, Autenticação, Validação de CPF, LGPD, E-commerce PostgreSQL e Keep-Alive Supabase

import test from "node:test";
import assert from "node:assert/strict";

// Credencial de administradora só para o teste (nunca a do .env real)
const { hashPassword } = await import("../server/crypto.mjs");
const TEST_ADMIN_EMAIL = "admin.teste@exemplo.com.br";
const TEST_ADMIN_PASSWORD = `Teste-${Date.now()}-Painel9`;
process.env.ADMIN_EMAIL = TEST_ADMIN_EMAIL;
process.env.ADMIN_PASSWORD_HASH = hashPassword(TEST_ADMIN_PASSWORD);

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
    // Vitrine pública nunca expõe pedidos, dados de clientes ou o antigo PIN
    assert.equal(body.orders, undefined);
    assert.equal(body.settings.adminPin, undefined);
    assert.ok(!JSON.stringify(body).includes("customer"));
  });

  let adminCookie = "";
  let adminCsrf = "";

  await t.test("0c. Rotas da administradora negadas sem sessão, login admin com limite de tentativas e CSRF obrigatório", async () => {
    const adminRoutes = [
      ["GET", "/api/v1/admin/snapshot"],
      ["GET", "/api/v1/admin/me"],
      ["GET", "/api/v1/store/orders/TP-2026-0001/attachments.zip"],
      ["GET", "/api/v1/store/attachments/00000000-0000-0000-0000-000000000000/download"],
      ["PATCH", "/api/v1/store/orders/status"],
      ["POST", "/api/v1/store/products"],
      ["DELETE", "/api/v1/store/products"],
      ["POST", "/api/v1/store/coupons"],
      ["DELETE", "/api/v1/store/coupons"],
      ["PUT", "/api/v1/store/settings"],
      ["POST", "/api/v1/store/reset"],
      ["DELETE", "/api/v1/store/orders/TP-2026-0001/attachments"],
      ["POST", "/api/v1/store/attachments/purge-expired"],
      ["GET", "/api/v1/store/rota-inexistente"],
    ];
    for (const [method, path] of adminRoutes) {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "GET" ? undefined : "{}",
      });
      assert.equal(res.status, 401, `${method} ${path} deveria exigir sessão de admin`);
    }

    // Sessão de cliente não abre o painel (cookie tp_session não vale como tp_admin)
    const asCustomer = await fetch(`${baseUrl}/api/v1/admin/snapshot`, { headers: { Cookie: "tp_session=" + "a".repeat(64) } });
    assert.equal(asCustomer.status, 401);

    clearRateLimitsForTest();
    const wrong = await fetch(`${baseUrl}/api/v1/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_ADMIN_EMAIL, password: "senha-errada-123" }),
    });
    assert.equal(wrong.status, 401);

    const ok = await fetch(`${baseUrl}/api/v1/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_ADMIN_EMAIL.toUpperCase(), password: TEST_ADMIN_PASSWORD }),
    });
    assert.equal(ok.status, 200);
    const setCookie = ok.headers.get("set-cookie") || "";
    assert.match(setCookie, /tp_admin=/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    adminCookie = setCookie.split(";")[0];
    adminCsrf = (await ok.json()).csrfToken;
    assert.ok(adminCsrf);

    const snap = await fetch(`${baseUrl}/api/v1/admin/snapshot`, { headers: { Cookie: adminCookie } });
    assert.equal(snap.status, 200);
    assert.ok(Array.isArray((await snap.json()).orders));

    const noCsrf = await fetch(`${baseUrl}/api/v1/store/attachments/purge-expired`, { method: "POST", headers: { Cookie: adminCookie } });
    assert.equal(noCsrf.status, 403);

    clearRateLimitsForTest();
    for (let i = 0; i < 5; i += 1) {
      await fetch(`${baseUrl}/api/v1/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: TEST_ADMIN_EMAIL, password: "errada" }),
      });
    }
    const blocked = await fetch(`${baseUrl}/api/v1/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD }),
    });
    assert.equal(blocked.status, 429);
    clearRateLimitsForTest();
  });

  await t.test("0d. Rastreio público exige os 4 últimos dígitos do telefone e não devolve dados pessoais", async () => {
    const { rows } = await pool.query("SELECT id, customer_json FROM public.orders ORDER BY created_at DESC LIMIT 1");
    const order = rows[0];
    const last4 = String(order.customer_json.phone || "").replace(/\D+/g, "").slice(-4);
    const wrongDigits = last4 === "0000" ? "1111" : "0000";

    const wrong = await fetch(`${baseUrl}/api/v1/store/orders/${order.id}/track?phone=${wrongDigits}`);
    assert.equal(wrong.status, 404);
    const missing = await fetch(`${baseUrl}/api/v1/store/orders/${order.id}/track`);
    assert.equal(missing.status, 404);

    const ok = await fetch(`${baseUrl}/api/v1/store/orders/${order.id}/track?phone=${last4}`);
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.order.id, order.id);
    const raw = JSON.stringify(body);
    assert.ok(!raw.includes("customer") && !raw.includes(order.customer_json.phone));
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

  await t.test("4b. Minha conta lista só os pedidos da própria cliente, com status atualizado pelo ateliê", async () => {
    const anon = await fetch(`${baseUrl}/api/v1/me/orders`);
    assert.equal(anon.status, 401);

    const orderId = `TP-TESTE-${Date.now()}`;
    await pool.query(
      `INSERT INTO public.orders (id, user_id, customer_json, shipping_json, payment_json, totals_json, status, history_json)
       VALUES ($1, $2, $3::jsonb, '{}'::jsonb, '{}'::jsonb, '{"total":1000}'::jsonb, 'producao', '[]'::jsonb)`,
      [orderId, createdUserId, JSON.stringify({ name: VALID_PAYLOAD.name, email: TEST_EMAIL, phone: VALID_PAYLOAD.phone })]
    );
    try {
      const res = await fetch(`${baseUrl}/api/v1/me/orders`, { headers: { Cookie: sessionCookie } });
      assert.equal(res.status, 200);
      const { orders } = await res.json();
      assert.ok(orders.length >= 1);
      assert.ok(orders.every((o) => o.customer.email === TEST_EMAIL));
      assert.equal(orders.find((o) => o.id === orderId).status, "producao");
    } finally {
      await pool.query("DELETE FROM public.orders WHERE id = $1", [orderId]);
    }
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

  await t.test("8. Upload de imagens originais da cliente, download individual e em .ZIP pela administradora e exclusão automática após 7 dias", async () => {
    // Cria um PNG 1x1 válido em bytes
    const samplePngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const expectedBuffer = Buffer.from(samplePngBase64, "base64");
    const testOrderId = "TP-2026-0001";
    // Remove sobras de execuções anteriores interrompidas deste mesmo teste
    await pool.query(
      "DELETE FROM public.order_attachments WHERE order_id = $1 AND file_name = 'foto-cliente-original.png'",
      [testOrderId]
    );

    const upRes = await fetch(`${baseUrl}/api/v1/store/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: testOrderId,
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

    // Administradora faz o download individual da imagem original
    const dlRes = await fetch(`${baseUrl}/api/v1/store/attachments/${attId}/download`, { headers: { Cookie: adminCookie } });
    assert.equal(dlRes.status, 200);
    assert.equal(dlRes.headers.get("content-type"), "image/png");
    assert.match(dlRes.headers.get("content-disposition") || "", /foto-cliente-original\.png/);
    const downloadedBuf = Buffer.from(await dlRes.arrayBuffer());
    assert.ok(downloadedBuf.equals(expectedBuffer));

    // Administradora faz o download de TODAS as fotos do pedido em um arquivo .ZIP
    const zipRes = await fetch(`${baseUrl}/api/v1/store/orders/${testOrderId}/attachments.zip`, { headers: { Cookie: adminCookie } });
    assert.equal(zipRes.status, 200);
    assert.equal(zipRes.headers.get("content-type"), "application/zip");
    assert.match(zipRes.headers.get("content-disposition") || "", /TP-2026-0001-fotos-cliente\.zip/);
    const zipBuf = Buffer.from(await zipRes.arrayBuffer());
    // Verifica assinatura PKZIP Local File Header (0x04034b50) e nomes dos arquivos dentro do ZIP
    assert.equal(zipBuf.readUInt32LE(0), 0x04034b50);
    const zipStr = zipBuf.toString("utf8");
    assert.ok(zipStr.includes("01_p-polaroide-12_foto-cliente-original.png"));
    assert.ok(zipStr.includes(`LEIAME-${testOrderId}.txt`));
    assert.equal(Number(zipRes.headers.get("content-length")), zipBuf.length);
    // Bytes da foto dentro do .ZIP (método STORE) idênticos aos enviados pela cliente
    const nameLen = zipBuf.readUInt16LE(26);
    const firstFileBytes = zipBuf.subarray(30 + nameLen, 30 + nameLen + expectedBuffer.length);
    assert.ok(firstFileBytes.equals(expectedBuffer));
    // Data descriptor logo após os bytes carrega o CRC-32 real
    const { crc32 } = await import("node:zlib");
    const descriptorAt = 30 + nameLen + expectedBuffer.length;
    assert.equal(zipBuf.readUInt32LE(descriptorAt), 0x08074b50);
    assert.equal(zipBuf.readUInt32LE(descriptorAt + 4), crc32(expectedBuffer));

    // Foto vencida não entra no .ZIP nem no download, mesmo antes do expurgo agendado
    await pool.query("UPDATE public.order_attachments SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1", [attId]);
    const zipExpired = await fetch(`${baseUrl}/api/v1/store/orders/${testOrderId}/attachments.zip`, { headers: { Cookie: adminCookie } });
    const expiredBuf = Buffer.from(await zipExpired.arrayBuffer());
    assert.ok(!expiredBuf.toString("utf8").includes("foto-cliente-original.png"));

    // Simula passagem de mais de 7 dias no banco e dispara a rotina automática de expurgo
    await pool.query(
      "UPDATE public.order_attachments SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1",
      [attId]
    );
    const purgeRes = await fetch(`${baseUrl}/api/v1/store/attachments/purge-expired`, {
      method: "POST",
      headers: { Cookie: adminCookie, "X-CSRF-Token": adminCsrf },
    });
    assert.equal(purgeRes.status, 200);

    // Verifica que os bytes foram apagados do banco (file_data IS NULL) e o download retorna 410 Gone
    const { rows } = await pool.query(
      "SELECT file_data, purged_at FROM public.order_attachments WHERE id = $1",
      [attId]
    );
    assert.equal(rows[0].file_data, null);
    assert.ok(rows[0].purged_at);

    const dlAfter = await fetch(`${baseUrl}/api/v1/store/attachments/${attId}/download`, { headers: { Cookie: adminCookie } });
    assert.equal(dlAfter.status, 410);

    // Limpa registro de teste e encerra a sessão admin
    await pool.query("DELETE FROM public.order_attachments WHERE id = $1", [attId]);
    const logout = await fetch(`${baseUrl}/api/v1/admin/logout`, {
      method: "POST",
      headers: { Cookie: adminCookie, "X-CSRF-Token": adminCsrf },
    });
    assert.equal(logout.status, 200);
    const afterLogout = await fetch(`${baseUrl}/api/v1/admin/snapshot`, { headers: { Cookie: adminCookie } });
    assert.equal(afterLogout.status, 401);
  });

  await t.test("9. Blindagem Financeira (V7) e Receptor de Webhooks Asaas com Idempotência", async () => {
    const webhookSecret = "segredo_asaas_teste_2026_thais";
    process.env.PAYMENT_WEBHOOK_SECRET = webhookSecret;

    const fakeOrderId = `TP-2026-9${String(Date.now()).slice(-4)}`;
    // Cliente mal-intencionado tenta enviar p01 (R$ 69,90) por 1 centavo (unit: 1, total: 1) e frete envio = 0
    const resOrder = await fetch(`${baseUrl}/api/v1/store/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order: {
          id: fakeOrderId,
          customer: { name: "Teste Fraude Preco", email: "fraude@exemplo.com.br", phone: "(43) 99999-1111" },
          shipping: { method: "envio", cep: "86010-150", street: "Rua A", number: "10", city: "Londrina", uf: "PR" },
          payment: { method: "boleto", status: "aprovado" },
          coupon: null,
          items: [{ productId: "p01", qty: 1, unit: 1, selections: {} }],
          totals: { subtotal: 1, discount: 0, shipping: 0, total: 1 },
        },
      }),
    });
    assert.equal(resOrder.status, 201);
    const orderBody = await resOrder.json();

    // O servidor recalculou tudo no PostgreSQL: p01 (6990) + frete padrão (1890) = 8880 centavos, e status = aguardando
    assert.equal(orderBody.order.totals.subtotal, 6990);
    assert.equal(orderBody.order.totals.shipping, 1890);
    assert.equal(orderBody.order.totals.total, 8880);
    assert.equal(orderBody.order.status, "aguardando");

    const asaasEvent = {
      id: `evt_asaas_${Date.now()}`,
      event: "PAYMENT_RECEIVED",
      payment: {
        id: "pay_000005400000",
        externalReference: fakeOrderId,
        value: 88.8,
      },
    };

    // a) Webhook sem segredo retorna 401
    const whNoAuth = await fetch(`${baseUrl}/api/v1/webhooks/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(asaasEvent),
    });
    assert.equal(whNoAuth.status, 401);

    // b) Webhook autenticado com valor adulterado menor (R$ 10,00) retorna 400
    const whLowValue = await fetch(`${baseUrl}/api/v1/webhooks/payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "asaas-access-token": webhookSecret,
      },
      body: JSON.stringify({
        ...asaasEvent,
        id: `${asaasEvent.id}_low`,
        payment: { ...asaasEvent.payment, value: 10.0 },
      }),
    });
    assert.equal(whLowValue.status, 400);

    // c) Webhook Asaas legítimo aprova o pedido no banco
    const whValid = await fetch(`${baseUrl}/api/v1/webhooks/payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "asaas-access-token": webhookSecret,
      },
      body: JSON.stringify(asaasEvent),
    });
    assert.equal(whValid.status, 200);
    const whBody = await whValid.json();
    assert.equal(whBody.duplicate, false);
    assert.equal(whBody.status, "pago");

    // Confirma no PostgreSQL que o pedido virou 'pago' e gravou gateway_charge_id + paid_at
    const { rows: ordCheck } = await pool.query(
      "SELECT status, payment_json, gateway_charge_id, paid_at FROM public.orders WHERE id = $1",
      [fakeOrderId]
    );
    assert.equal(ordCheck[0].status, "pago");
    assert.equal(ordCheck[0].payment_json.status, "aprovado");
    assert.equal(ordCheck[0].gateway_charge_id, "pay_000005400000");
    assert.ok(ordCheck[0].paid_at);

    // d) Reenvio idempotente do mesmo evento retorna duplicate: true sem reprocessar
    const whDup = await fetch(`${baseUrl}/api/v1/webhooks/payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "asaas-access-token": webhookSecret,
      },
      body: JSON.stringify(asaasEvent),
    });
    assert.equal(whDup.status, 200);
    const whDupBody = await whDup.json();
    assert.equal(whDupBody.duplicate, true);

    // Limpa pedido de teste e evento de webhook
    await pool.query("DELETE FROM public.payment_webhook_events WHERE order_id = $1", [fakeOrderId]);
    await pool.query("DELETE FROM public.orders WHERE id = $1", [fakeOrderId]);
  });
});
