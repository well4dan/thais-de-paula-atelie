// Validação estrita de entrada em runtime (Camada 2 e Camada 8).
// Rejeita campos inválidos, valida algoritmo oficial de CPF (módulo 11), CEP, UF e política de senha forte.

export const TERMS_VERSION = "v1.0-2026-11-05";
export const LGPD_VERSION = "v1.0-2026-11-05";

const VALID_UFS = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);

export class ValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.code = "VALIDATION_ERROR";
    this.status = 422;
    this.details = details;
  }
}

export const onlyDigits = (v) => String(v ?? "").replace(/\D+/g, "");

export function isValidCpf(raw) {
  const cpf = onlyDigits(raw);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let sum1 = 0;
  for (let i = 0; i < 9; i += 1) sum1 += Number(cpf[i]) * (10 - i);
  let d1 = (sum1 * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(cpf[9])) return false;

  let sum2 = 0;
  for (let i = 0; i < 10; i += 1) sum2 += Number(cpf[i]) * (11 - i);
  let d2 = (sum2 * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(cpf[10]);
}

export function isStrongPassword(pw) {
  const s = String(pw ?? "");
  if (s.length < 10 || s.length > 128) return false;
  const hasLower = /[a-z]/.test(s);
  const hasUpper = /[A-Z]/.test(s);
  const hasDigit = /\d/.test(s);
  const hasSymbol = /[^A-Za-z0-9]/.test(s);
  return hasLower && hasUpper && hasDigit && hasSymbol;
}

export function isValidEmail(email) {
  const s = String(email ?? "").trim().toLowerCase();
  return s.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

export function sanitizeText(value, maxLen = 160) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F<>]/g, "")
    .trim()
    .slice(0, maxLen);
}

export function validateAddress(addr = {}, errors = {}) {
  const cepDigits = onlyDigits(addr.cep);
  if (cepDigits.length !== 8) errors.cep = "Informe um CEP válido com 8 dígitos.";
  const street = sanitizeText(addr.street, 160);
  if (street.length < 3) errors.street = "Informe a rua ou avenida.";
  const number = sanitizeText(addr.number, 30);
  if (number.length < 1) errors.number = "Informe o número do endereço.";
  const complement = sanitizeText(addr.complement, 80);
  const district = sanitizeText(addr.district, 100);
  if (district.length < 2) errors.district = "Informe o bairro.";
  const city = sanitizeText(addr.city, 100);
  if (city.length < 2) errors.city = "Informe a cidade.";
  const uf = sanitizeText(addr.uf, 2).toUpperCase();
  if (!VALID_UFS.has(uf)) errors.uf = "Selecione uma UF válida (ex.: PR, SP).";

  return {
    cep: `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}`,
    street,
    number,
    complement,
    district,
    city,
    uf,
  };
}

export function validateRegistration(body = {}) {
  const errors = {};
  const name = sanitizeText(body.name, 120);
  if (name.length < 3 || !name.includes(" ")) {
    errors.name = "Informe seu nome e sobrenome completos.";
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) errors.email = "Informe um e-mail válido.";

  const phoneDigits = onlyDigits(body.phone);
  if (phoneDigits.length < 10 || phoneDigits.length > 11) {
    errors.phone = "Informe um WhatsApp/telefone válido com DDD.";
  }

  const cpfDigits = onlyDigits(body.cpf);
  if (!isValidCpf(cpfDigits)) {
    errors.cpf = "CPF inválido. Confira os 11 dígitos informados.";
  }

  const password = String(body.password ?? "");
  if (!isStrongPassword(password)) {
    errors.password = "A senha deve ter no mínimo 10 caracteres, incluindo letra maiúscula, minúscula, número e símbolo.";
  }

  const address = validateAddress(body.address || {}, errors);

  if (body.acceptTerms !== true) {
    errors.acceptTerms = "Você precisa ler e aceitar os Termos de Uso do site para concluir o cadastro.";
  }
  if (body.acceptLgpd !== true) {
    errors.acceptLgpd = "Você precisa ler e aceitar o Termo de Consentimento e Privacidade (LGPD) para concluir o cadastro.";
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError("Confira os campos destacados antes de concluir o cadastro.", errors);
  }

  return {
    name,
    email,
    phone: phoneDigits,
    cpfDigits,
    password,
    address,
    termsVersion: TERMS_VERSION,
    lgpdVersion: LGPD_VERSION,
  };
}

export function validateProfileUpdate(body = {}) {
  const errors = {};
  const name = sanitizeText(body.name, 120);
  if (name.length < 3 || !name.includes(" ")) {
    errors.name = "Informe seu nome e sobrenome completos.";
  }
  const phoneDigits = onlyDigits(body.phone);
  if (phoneDigits.length < 10 || phoneDigits.length > 11) {
    errors.phone = "Informe um WhatsApp/telefone válido com DDD.";
  }
  const address = validateAddress(body.address || {}, errors);
  if (Object.keys(errors).length > 0) {
    throw new ValidationError("Confira os campos destacados.", errors);
  }
  return { name, phone: phoneDigits, address };
}
