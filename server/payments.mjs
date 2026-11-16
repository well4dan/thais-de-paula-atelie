// Adaptador de Gateway de Pagamento (Asaas nativo + Sandbox Simulado) e Verificação de Webhooks
// Mantém 0 dependências externas usando fetch nativo do Node.js e crypto.timingSafeEqual.

import crypto from "node:crypto";

export function activePaymentProvider() {
  const raw = String(process.env.PAYMENT_PROVIDER || "sandbox_sim").trim().toLowerCase();
  if (raw === "asaas" && String(process.env.ASAAS_API_KEY || "").trim()) {
    return "asaas";
  }
  return "sandbox_sim";
}

function timingSafeStrEqual(a, b) {
  const bufA = Buffer.from(String(a || ""), "utf8");
  const bufB = Buffer.from(String(b || ""), "utf8");
  if (!bufA.length || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifica assinatura criptográfica ou token secreto do webhook recebido do gateway.
 * Nunca confia em chamadas sem PAYMENT_WEBHOOK_SECRET configurado.
 */
export function verifyWebhookAuth(req, rawBody = "") {
  const secret = String(process.env.PAYMENT_WEBHOOK_SECRET || "").trim();
  if (!secret) return false;

  // 1. Padrão oficial Asaas: header "asaas-access-token" igual ao segredo cadastrado
  const asaasToken = req.headers["asaas-access-token"];
  if (typeof asaasToken === "string" && timingSafeStrEqual(asaasToken.trim(), secret)) {
    return true;
  }

  // 2. Padrão HMAC-SHA256 genérico: header "x-webhook-signature" ("sha256=<hex>" ou "<hex>")
  const sigHeader = req.headers["x-webhook-signature"];
  if (typeof sigHeader === "string" && sigHeader.trim()) {
    const cleanSig = sigHeader.trim().replace(/^sha256=/i, "");
    const expectedHmac = crypto
      .createHmac("sha256", secret)
      .update(Buffer.isBuffer(rawBody) ? rawBody : String(rawBody || ""))
      .digest("hex");
    if (timingSafeStrEqual(cleanSig.toLowerCase(), expectedHmac.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Normaliza eventos de webhook (Asaas nativo ou payload genérico) para o processador transacional.
 */
export function normalizeWebhookPayload(body) {
  const raw = body && typeof body === "object" ? body : {};
  const isAsaas = Boolean(raw.payment && typeof raw.payment === "object");
  const provider = isAsaas ? "asaas" : String(raw.provider || "asaas").toLowerCase();

  const eventId = String(raw.id || raw.eventId || "").trim();
  const eventType = String(raw.event || raw.eventType || "").trim().toUpperCase();
  const orderId = String(raw.payment?.externalReference || raw.orderId || "").trim();
  const chargeId = String(raw.payment?.id || raw.chargeId || "").trim() || null;

  let amountCents = null;
  if (raw.payment?.value !== undefined && raw.payment?.value !== null) {
    amountCents = Math.round(Number(raw.payment.value) * 100);
  } else if (raw.amountCents !== undefined && raw.amountCents !== null) {
    amountCents = Math.round(Number(raw.amountCents));
  }

  return { provider, eventId, eventType, orderId, chargeId, amountCents, rawPayload: raw };
}

async function asaasRequest(path, { method = "GET", body = undefined } = {}) {
  const baseUrl = String(process.env.ASAAS_API_URL || "https://sandbox.asaas.com/api/v3").replace(/\/+$/, "");
  const apiKey = String(process.env.ASAAS_API_KEY || "").trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        access_token: apiKey,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.errors?.[0]?.description || `Erro do gateway (${res.status}).`;
      const err = new Error(msg);
      err.status = 502;
      err.code = "GATEWAY_ERROR";
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function ensureAsaasCustomer({ name, email, phone, cpfDigits }) {
  if (cpfDigits) {
    const found = await asaasRequest(`/customers?cpfCnpj=${encodeURIComponent(cpfDigits)}`);
    if (Array.isArray(found?.data) && found.data[0]?.id) {
      return found.data[0].id;
    }
  }
  const created = await asaasRequest("/customers", {
    method: "POST",
    body: {
      name: String(name || "Cliente Ateliê").slice(0, 120),
      email: String(email || "").slice(0, 120),
      mobilePhone: String(phone || "").replace(/\D+/g, "").slice(0, 11) || undefined,
      cpfCnpj: cpfDigits || undefined,
      notificationDisabled: false,
    },
  });
  return created.id;
}

/**
 * Cria a cobrança no gateway configurado (Asaas real quando credenciado, ou Sandbox Simulado).
 */
export async function createGatewayCharge({ order, customerCpf = "" }) {
  const provider = activePaymentProvider();
  const method = String(order?.payment?.method || "pix").toLowerCase();

  if (provider === "asaas") {
    const cpfDigits = String(customerCpf || "").replace(/\D+/g, "");
    const customerId = await ensureAsaasCustomer({
      name: order.customer?.name,
      email: order.customer?.email,
      phone: order.customer?.phone,
      cpfDigits,
    });

    const billingType = method === "boleto" ? "BOLETO" : method === "cartao" ? "UNDEFINED" : "PIX";
    const due = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const paymentRes = await asaasRequest("/payments", {
      method: "POST",
      body: {
        customer: customerId,
        billingType,
        value: Number((order.totals.total / 100).toFixed(2)),
        dueDate: due,
        externalReference: order.id,
        description: `Pedido ${order.id} - Thaís de Paula Ateliê`,
      },
    });

    let pixQrPayload = null;
    if (billingType === "PIX" && paymentRes.id) {
      const qr = await asaasRequest(`/payments/${encodeURIComponent(paymentRes.id)}/pixQrCode`).catch(() => null);
      if (qr?.payload) pixQrPayload = qr.payload;
    }

    return {
      provider: "asaas",
      chargeId: paymentRes.id || null,
      checkoutUrl: paymentRes.invoiceUrl || null,
      pixQrPayload,
      boletoLine: paymentRes.identificationField || null,
      initialStatus: "aguardando",
      paymentStatus: "pendente",
    };
  }

  // Modo Sandbox Simulado (enquanto não houver credencial ativa do gateway)
  const isBoleto = method === "boleto";
  return {
    provider: "sandbox_sim",
    chargeId: `sim_${order.id}`,
    checkoutUrl: null,
    pixQrPayload: null,
    boletoLine: null,
    initialStatus: isBoleto ? "aguardando" : "pago",
    paymentStatus: isBoleto ? "pendente" : "aprovado",
  };
}
