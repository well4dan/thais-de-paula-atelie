// Consulta gratuita de CEP com redundância tripla (BrasilAPI v2 + ViaCEP + OpenCEP) e cache de 24 horas

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cepCache = new Map();

function formatCep(digits) {
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

async function fetchJsonWithTimeout(url, timeoutMs = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function tryBrasilApi(digits) {
  const data = await fetchJsonWithTimeout(`https://brasilapi.com.br/api/cep/v2/${digits}`);
  if (!data || !data.city || !data.state) return null;
  return {
    cep: formatCep(digits),
    street: String(data.street || "").trim(),
    district: String(data.neighborhood || "").trim(),
    city: String(data.city || "").trim(),
    uf: String(data.state || "").trim().toUpperCase(),
    provider: "brasilapi",
  };
}

async function tryViaCep(digits) {
  const data = await fetchJsonWithTimeout(`https://viacep.com.br/ws/${digits}/json/`);
  if (!data || data.erro || !data.localidade || !data.uf) return null;
  return {
    cep: formatCep(digits),
    street: String(data.logradouro || "").trim(),
    district: String(data.bairro || "").trim(),
    city: String(data.localidade || "").trim(),
    uf: String(data.uf || "").trim().toUpperCase(),
    provider: "viacep",
  };
}

async function tryOpenCep(digits) {
  const data = await fetchJsonWithTimeout(`https://opencep.com/v1/${digits}.json`);
  if (!data || !data.localidade || !data.uf) return null;
  return {
    cep: formatCep(digits),
    street: String(data.logradouro || "").trim(),
    district: String(data.bairro || "").trim(),
    city: String(data.localidade || "").trim(),
    uf: String(data.uf || "").trim().toUpperCase(),
    provider: "opencep",
  };
}

function offlineRegionalFallback(digits) {
  const num = Number(digits);
  if (num >= 86180000 && num <= 86199999) {
    return { cep: formatCep(digits), street: "", district: "", city: "Cambé", uf: "PR", provider: "regional_fallback" };
  }
  if (num >= 86000000 && num <= 86124999) {
    return { cep: formatCep(digits), street: "", district: "", city: "Londrina", uf: "PR", provider: "regional_fallback" };
  }
  return null;
}

export async function lookupCepInProviders(rawCep) {
  const digits = String(rawCep || "").replace(/\D+/g, "");
  if (!/^\d{8}$/.test(digits)) {
    throw Object.assign(new Error("CEP inválido. Informe 8 dígitos."), { status: 400, code: "INVALID_CEP" });
  }

  const cached = cepCache.get(digits);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.data, cached: true };
  }

  const found =
    (await tryBrasilApi(digits)) ||
    (await tryViaCep(digits)) ||
    (await tryOpenCep(digits)) ||
    offlineRegionalFallback(digits);

  if (!found) {
    throw Object.assign(new Error("CEP não encontrado."), { status: 404, code: "CEP_NOT_FOUND" });
  }

  cepCache.set(digits, { data: found, expiresAt: Date.now() + CACHE_TTL_MS });
  return { ...found, cached: false };
}
