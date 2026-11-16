// Módulo de Logística e Frete Híbrido (Motoboy Cambé/Londrina + API da Transportadora Loggi)
// Regra oficial do ateliê:
// - Cambé / PR -> Motoboy fixo R$ 10,00 (1000 centavos)
// - Londrina / PR -> Motoboy fixo R$ 20,00 (2000 centavos)
// - Demais cidades -> Transportadora Loggi (API oficial quando credenciada no .env, ou tabela regional sandbox)

let cachedLoggiToken = { token: "", expiresAt: 0 };

export function normalizeCityName(city = "") {
  return String(city || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function isCambeDestination({ cep = "", city = "" } = {}) {
  const normCity = normalizeCityName(city);
  if (normCity === "cambe") return true;
  if (normCity && normCity !== "cambe") {
    const cepNum = Number(String(cep || "").replace(/\D+/g, ""));
    return cepNum >= 86180000 && cepNum <= 86199999;
  }
  const cepNum = Number(String(cep || "").replace(/\D+/g, ""));
  return cepNum >= 86180000 && cepNum <= 86199999;
}

export function isLondrinaDestination({ cep = "", city = "" } = {}) {
  const normCity = normalizeCityName(city);
  if (normCity === "londrina") return true;
  if (normCity && normCity !== "londrina") return false;
  const cepNum = Number(String(cep || "").replace(/\D+/g, ""));
  return cepNum >= 86000000 && cepNum <= 86124999;
}

function activeShippingProvider() {
  const raw = String(process.env.SHIPPING_PROVIDER || "sandbox_sim").trim().toLowerCase();
  if (
    raw === "loggi" &&
    String(process.env.LOGGI_CLIENT_ID || "").trim() &&
    String(process.env.LOGGI_CLIENT_SECRET || "").trim()
  ) {
    return "loggi";
  }
  return "sandbox_sim";
}

function estimateFallbackLoggiQuote({ cep = "", uf = "", itemsCount = 1 }) {
  const cleanUf = String(uf || "").trim().toUpperCase();
  const cepDigits = String(cep || "").replace(/\D+/g, "");
  const prefix2 = Number(cepDigits.slice(0, 2) || 0);
  const extraUnits = Math.max(0, Number(itemsCount || 1) - 2) * 200;

  let baseCents = 3490;
  let estimatedDays = 7;

  if (cleanUf === "PR" || (prefix2 >= 80 && prefix2 <= 87)) {
    baseCents = 1890;
    estimatedDays = 3;
  } else if (["SP", "SC", "RS"].includes(cleanUf) || (prefix2 >= 1 && prefix2 <= 19) || (prefix2 >= 88 && prefix2 <= 99)) {
    baseCents = 2390;
    estimatedDays = 4;
  } else if (["RJ", "MG", "ES", "MS", "MT", "GO", "DF"].includes(cleanUf) || (prefix2 >= 20 && prefix2 <= 39) || (prefix2 >= 70 && prefix2 <= 79)) {
    baseCents = 2890;
    estimatedDays = 5;
  }

  return {
    carrier: "loggi",
    provider: "sandbox_sim",
    serviceLabel: "Transportadora Loggi",
    priceCents: baseCents + extraUnits,
    estimatedDays,
  };
}

async function getLoggiAccessToken() {
  if (cachedLoggiToken.token && cachedLoggiToken.expiresAt > Date.now() + 60_000) {
    return cachedLoggiToken.token;
  }
  const baseUrl = String(process.env.LOGGI_API_URL || "https://api.loggi.com").replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${baseUrl}/v1/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: process.env.LOGGI_CLIENT_ID,
        client_secret: process.env.LOGGI_CLIENT_SECRET,
      }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.access_token) {
      throw new Error(`Falha OAuth2 Loggi (${res.status}).`);
    }
    const ttlMs = Number(data.expires_in || 3600) * 1000;
    cachedLoggiToken = { token: data.access_token, expiresAt: Date.now() + ttlMs };
    return data.access_token;
  } finally {
    clearTimeout(timer);
  }
}

async function quoteLoggiApi({ cep, itemsCount }) {
  const token = await getLoggiAccessToken();
  const baseUrl = String(process.env.LOGGI_API_URL || "https://api.loggi.com").replace(/\/+$/, "");
  const companyId = String(process.env.LOGGI_COMPANY_ID || "").trim();
  const originCep = String(process.env.LOGGI_ORIGIN_CEP || "86181000").replace(/\D+/g, "");
  const destCep = String(cep || "").replace(/\D+/g, "");
  const weightGrams = Math.max(300, Number(itemsCount || 1) * 350);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${baseUrl}/v1/companies/${encodeURIComponent(companyId)}/quotations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        origin: { postalCode: originCep },
        destination: { postalCode: destCep },
        packages: [{ weightG: weightGrams, lengthCm: 28, widthCm: 22, heightCm: 8 }],
      }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    const option = Array.isArray(data?.quotations) ? data.quotations[0] : data;
    if (!res.ok || !option?.price?.value) {
      throw new Error("Sem resposta válida da cotação Loggi.");
    }
    return {
      carrier: "loggi",
      provider: "loggi",
      serviceLabel: "Transportadora Loggi",
      priceCents: Math.round(Number(option.price.value) * 100),
      estimatedDays: Number(option.estimatedDeliveryDays || 4),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calcula o frete definitivo respeitando a regra:
 * Retirada (0) | Cambé Motoboy (R$ 10) | Londrina Motoboy (R$ 20) | Demais cidades -> Loggi.
 */
export async function calculateShippingQuote({
  method = "retirada",
  cep = "",
  city = "",
  uf = "",
  itemsCount = 1,
  settings = {},
} = {}) {
  if (method !== "envio") {
    return {
      carrier: "retirada",
      provider: "atelie",
      serviceLabel: "Retirada combinada pelo WhatsApp",
      priceCents: 0,
      estimatedDays: 0,
    };
  }

  if (isCambeDestination({ cep, city })) {
    return {
      carrier: "motoboy_cambe",
      provider: "atelie_motoboy",
      serviceLabel: "Entrega via Motoboy (Cambé)",
      priceCents: Number(settings.motoboyCambe ?? 1000),
      estimatedDays: 1,
    };
  }

  if (isLondrinaDestination({ cep, city })) {
    return {
      carrier: "motoboy_londrina",
      provider: "atelie_motoboy",
      serviceLabel: "Entrega via Motoboy (Londrina)",
      priceCents: Number(settings.motoboyLondrina ?? 2000),
      estimatedDays: 1,
    };
  }

  if (activeShippingProvider() === "loggi") {
    try {
      return await quoteLoggiApi({ cep, itemsCount });
    } catch {
      // Fallback para tabela regional Loggi caso a API oscile momentaneamente
    }
  }

  return estimateFallbackLoggiQuote({ cep, uf, itemsCount });
}

/**
 * Gera coleta/etiqueta de envio na Transportadora Loggi para um pedido fora de Cambé/Londrina.
 */
export async function createLoggiShipmentForOrder(order) {
  const destCep = String(order.shipping?.cep || "").replace(/\D+/g, "");
  const totalQty = (order.items || []).reduce((s, it) => s + Number(it.qty || 1), 0) || 1;
  const weightGrams = Math.max(300, totalQty * 350);

  if (activeShippingProvider() === "loggi") {
    const token = await getLoggiAccessToken();
    const baseUrl = String(process.env.LOGGI_API_URL || "https://api.loggi.com").replace(/\/+$/, "");
    const companyId = String(process.env.LOGGI_COMPANY_ID || "").trim();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(`${baseUrl}/v1/companies/${encodeURIComponent(companyId)}/async-shipments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          shipFrom: {
            name: "Thaís de Paula Ateliê",
            postalCode: String(process.env.LOGGI_ORIGIN_CEP || "86181000").replace(/\D+/g, ""),
          },
          shipTo: {
            name: String(order.customer?.name || "Cliente").slice(0, 120),
            phone: String(order.customer?.phone || "").replace(/\D+/g, "").slice(0, 11),
            email: String(order.customer?.email || ""),
            address: {
              postalCode: destCep,
              street: String(order.shipping?.street || ""),
              number: String(order.shipping?.number || "S/N"),
              neighborhood: String(order.shipping?.district || "Centro"),
              city: String(order.shipping?.city || ""),
              state: String(order.shipping?.uf || "PR").toUpperCase(),
            },
          },
          packages: [
            {
              weightG: weightGrams,
              lengthCm: 28,
              widthCm: 22,
              heightCm: 8,
              externalId: order.id,
            },
          ],
          externalId: order.id,
        }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw Object.assign(new Error(data?.message || `Erro ao gerar envio na Loggi (${res.status}).`), {
          status: 502,
          code: "LOGGI_ERROR",
        });
      }
      const trackingCode = String(data.trackingCode || data.packages?.[0]?.trackingCode || "").trim();
      const shipmentId = String(data.id || data.shipmentId || "").trim();
      return {
        provider: "loggi",
        shipmentId: shipmentId || `lgg_${order.id}`,
        trackingCode: trackingCode || `LGG${String(Date.now()).slice(-9)}BR`,
        trackingUrl: trackingCode ? `https://www.loggi.com/rastreador/${encodeURIComponent(trackingCode)}` : null,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // Modo Sandbox Simulado (enquanto credenciais da Loggi não forem inseridas no .env)
  const digits = String(order.id || "").replace(/\D+/g, "").padStart(9, "0").slice(-9);
  const trackingCode = `LGG${digits}BR`;
  return {
    provider: "sandbox_sim",
    shipmentId: `lgg_sim_${order.id}`,
    trackingCode,
    trackingUrl: `https://www.loggi.com/rastreador/${encodeURIComponent(trackingCode)}`,
  };
}
