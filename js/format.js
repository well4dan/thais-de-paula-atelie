// Formatação pt-BR e pequenos utilitários puros.

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export const money = (cents) => brl.format((Number(cents) || 0) / 100);
export const date = (iso) => dateFmt.format(new Date(iso));
export const dateTime = (iso) => dateTimeFmt.format(new Date(iso));

export const onlyDigits = (value) => String(value ?? "").replace(/\D+/g, "");

export function maskPhone(value) {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
}

export function maskCep(value) {
  const d = onlyDigits(value).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function maskCpf(value) {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

export function isValidCpf(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let s1 = 0;
  for (let i = 0; i < 9; i += 1) s1 += Number(cpf[i]) * (10 - i);
  let d1 = (s1 * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(cpf[9])) return false;
  let s2 = 0;
  for (let i = 0; i < 10; i += 1) s2 += Number(cpf[i]) * (11 - i);
  let d2 = (s2 * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(cpf[10]);
}

export function passwordStrength(pw) {
  const s = String(pw || "");
  const rules = {
    length: s.length >= 10,
    lower: /[a-z]/.test(s),
    upper: /[A-Z]/.test(s),
    digit: /\d/.test(s),
    symbol: /[^A-Za-z0-9]/.test(s),
  };
  const passed = Object.values(rules).filter(Boolean).length;
  return { rules, passed, valid: passed === 5 };
}

export function maskCard(value) {
  return onlyDigits(value).slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ");
}

export function maskExpiry(value) {
  const d = onlyDigits(value).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

export function luhnValid(number) {
  const d = onlyDigits(number);
  if (d.length < 13) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i += 1) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

export function cardBrand(number) {
  const d = onlyDigits(number);
  if (/^4/.test(d)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(d)) return "Mastercard";
  if (/^3[47]/.test(d)) return "Amex";
  if (/^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(d)) return "Elo";
  return "Cartão";
}

export const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value).trim());

export function businessDaysFromNow(days) {
  const d = new Date();
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) added += 1;
  }
  return d;
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

export function slugify(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export function waLink(phone, message) {
  return `https://wa.me/${onlyDigits(phone)}?text=${encodeURIComponent(message)}`;
}
