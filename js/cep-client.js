// Cliente compartilhado de busca automática de CEP (Server Cache + BrasilAPI v2 + ViaCEP + OpenCEP)

import { $, toast } from "./dom.js";
import { maskCep, onlyDigits } from "./format.js";

const clientCepCache = new Map();

async function fetchDirectFromPublicApis(digits) {
  const attempts = [
    async () => {
      const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${digits}`);
      if (!r.ok) return null;
      const d = await r.json();
      if (!d?.city || !d?.state) return null;
      return { cep: maskCep(digits), street: d.street || "", district: d.neighborhood || "", city: d.city, uf: d.state.toUpperCase() };
    },
    async () => {
      const r = await fetch(`https://opencep.com/v1/${digits}.json`);
      if (!r.ok) return null;
      const d = await r.json();
      if (!d?.localidade || !d?.uf) return null;
      return { cep: maskCep(digits), street: d.logradouro || "", district: d.bairro || "", city: d.localidade, uf: d.uf.toUpperCase() };
    },
    async () => {
      const r = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      if (!r.ok) return null;
      const d = await r.json();
      if (d?.erro || !d?.localidade || !d?.uf) return null;
      return { cep: maskCep(digits), street: d.logradouro || "", district: d.bairro || "", city: d.localidade, uf: d.uf.toUpperCase() };
    },
  ];
  for (const run of attempts) {
    try {
      const res = await run();
      if (res) return res;
    } catch {
      // Tenta próximo provedor gratuito
    }
  }
  return null;
}

export async function fetchAddressByCep(rawCep) {
  const digits = onlyDigits(rawCep);
  if (digits.length !== 8) return null;
  if (clientCepCache.has(digits)) return clientCepCache.get(digits);

  try {
    const res = await fetch(`/api/v1/cep/${digits}`, { credentials: "same-origin" });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data?.address) {
        clientCepCache.set(digits, data.address);
        return data.address;
      }
    } else if (res.status === 404) {
      return { notFound: true };
    }
  } catch {
    // Modo estático sem servidor Node: consulta APIs públicas diretamente
  }

  const fallback = await fetchDirectFromPublicApis(digits);
  if (fallback) {
    clientCepCache.set(digits, fallback);
    return fallback;
  }
  return null;
}

export function bindCepLookup({
  cepSelector,
  streetSelector,
  districtSelector,
  citySelector,
  ufSelector,
  numberSelector,
  onAddressFilled,
}) {
  const cepEl = $(cepSelector);
  if (!cepEl) return;

  let lastLookedUp = "";

  async function runLookup({ focusNumber = true } = {}) {
    const digits = onlyDigits(cepEl.value);
    if (digits.length !== 8 || digits === lastLookedUp) return;
    lastLookedUp = digits;

    const addr = await fetchAddressByCep(digits);
    if (!addr) return;
    if (addr.notFound) {
      toast("CEP não encontrado. Preencha o endereço manualmente.", "error");
      return;
    }

    const streetEl = streetSelector ? $(streetSelector) : null;
    const districtEl = districtSelector ? $(districtSelector) : null;
    const cityEl = citySelector ? $(citySelector) : null;
    const ufEl = ufSelector ? $(ufSelector) : null;
    const numberEl = numberSelector ? $(numberSelector) : null;

    if (streetEl && addr.street) {
      streetEl.value = addr.street;
      streetEl.removeAttribute("aria-invalid");
    }
    if (districtEl && addr.district) {
      districtEl.value = addr.district;
      districtEl.removeAttribute("aria-invalid");
    }
    if (cityEl && addr.city) {
      cityEl.value = addr.city;
      cityEl.removeAttribute("aria-invalid");
    }
    if (ufEl && addr.uf) {
      ufEl.value = addr.uf;
      ufEl.removeAttribute("aria-invalid");
    }

    if (typeof onAddressFilled === "function") {
      onAddressFilled(addr);
    }

    if (focusNumber && numberEl && !numberEl.value.trim()) {
      numberEl.focus();
    }
  }

  cepEl.addEventListener("input", (e) => {
    e.target.value = maskCep(e.target.value);
    const digits = onlyDigits(e.target.value);
    if (digits.length < 8) lastLookedUp = "";
    if (digits.length === 8) runLookup({ focusNumber: true });
  });

  cepEl.addEventListener("blur", () => {
    const digits = onlyDigits(cepEl.value);
    if (digits.length === 8) runLookup({ focusNumber: false });
  });
}
