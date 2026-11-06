// Repositório da demo sobre localStorage. Numa loja real, isto vira API + banco com RLS.

import { LINES, PRODUCTS, COUPONS, SETTINGS } from "./data/seed.js";
import { buildDemoOrders } from "./data/demo-orders.js";

const NS = "tp:v1:";
const KEYS = { products: "products", orders: "orders", coupons: "coupons", settings: "settings", cart: "cart", seeded: "seeded" };

export const STATUS = {
  aguardando: { label: "Aguardando pagamento", tone: "warn" },
  pago: { label: "Pago", tone: "ok" },
  producao: { label: "Em produção", tone: "rose" },
  pronto: { label: "Pronto", tone: "ok" },
  enviado: { label: "Enviado ou retirado", tone: "ok" },
  concluido: { label: "Concluído", tone: "ok" },
  cancelado: { label: "Cancelado", tone: "danger" },
};
export const STATUS_FLOW = ["aguardando", "pago", "producao", "pronto", "enviado", "concluido"];

export class StoreError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(NS + key, JSON.stringify(value));
  } catch {
    throw new StoreError("storage_full", "O armazenamento do navegador está cheio. Tente uma foto menor ou limpe os dados da demo.");
  }
}

const clone = (v) => JSON.parse(JSON.stringify(v));

function bgSync(url, method = "POST", body = {}) {
  if (typeof fetch !== "function") return;
  fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  }).catch(() => {});
}

export async function pullFromPostgres() {
  if (typeof fetch !== "function") return;
  try {
    const res = await fetch("/api/v1/store/snapshot", { credentials: "same-origin" });
    if (!res.ok) return;
    const snap = await res.json();
    if (Array.isArray(snap.products) && snap.products.length) write(KEYS.products, snap.products);
    if (Array.isArray(snap.coupons) && snap.coupons.length) write(KEYS.coupons, snap.coupons);
    if (snap.settings && Object.keys(snap.settings).length) write(KEYS.settings, snap.settings);
    if (Array.isArray(snap.orders) && snap.orders.length) write(KEYS.orders, snap.orders);
    write(KEYS.seeded, true);
    window.dispatchEvent(new Event("storage"));
  } catch {
    // Fallback local
  }
}

export function init() {
  if (!read(KEYS.seeded, false)) {
    write(KEYS.products, clone(PRODUCTS));
    write(KEYS.coupons, clone(COUPONS));
    write(KEYS.settings, clone(SETTINGS));
    write(KEYS.orders, buildDemoOrders(PRODUCTS));
    write(KEYS.seeded, true);
  }
  pullFromPostgres();
}

export function resetDemo() {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(NS + k));
  init();
  bgSync("/api/v1/store/reset", "POST", {});
}

/* Linhas e produtos */
export const lines = () => LINES;
export const lineBySlug = (slug) => LINES.find((l) => l.slug === slug);

export function products({ includeInactive = false } = {}) {
  const all = read(KEYS.products, []);
  return includeInactive ? all : all.filter((p) => p.active);
}

export const productById = (id) => products({ includeInactive: true }).find((p) => p.id === id);
export const productBySlug = (slug) => products().find((p) => p.slug === slug);

export function saveProduct(input) {
  const all = products({ includeInactive: true });
  const product = { ...input };
  if (!product.name || product.name.trim().length < 3) throw new StoreError("invalid", "Nome muito curto.");
  if (!Number.isInteger(product.price) || product.price <= 0) throw new StoreError("invalid", "Preço inválido.");
  if (product.mode === "pronta" && (!Number.isInteger(product.stock) || product.stock < 0)) throw new StoreError("invalid", "Estoque inválido.");
  if (product.mode === "demanda" && (!Number.isInteger(product.leadDays) || product.leadDays < 1)) throw new StoreError("invalid", "Prazo inválido.");
  const slugTaken = all.some((p) => p.slug === product.slug && p.id !== product.id);
  if (slugTaken) product.slug = `${product.slug}-${Date.now().toString(36).slice(-4)}`;
  const idx = all.findIndex((p) => p.id === product.id);
  if (idx >= 0) all[idx] = product;
  else {
    product.id = `p${Date.now().toString(36)}`;
    all.push(product);
  }
  write(KEYS.products, all);
  bgSync("/api/v1/store/products", "POST", { product });
  return product;
}

export function removeProduct(id) {
  write(KEYS.products, products({ includeInactive: true }).filter((p) => p.id !== id));
  bgSync("/api/v1/store/products", "DELETE", { id });
}

function adjustStock(productId, delta) {
  const all = products({ includeInactive: true });
  const p = all.find((x) => x.id === productId);
  if (p && p.mode === "pronta") {
    p.stock = Math.max(0, (p.stock || 0) + delta);
    write(KEYS.products, all);
  }
}

/* Preço: sempre calculado a partir do catálogo, nunca do que o carrinho guardou */
export function unitPrice(product, selections = {}) {
  let price = product.price;
  for (const option of product.options || []) {
    if (option.type !== "select") continue;
    const choice = option.choices.find((c) => c.label === selections[option.id]);
    if (choice) price += choice.delta;
  }
  return price;
}

export function minPrice(product) {
  return product.price;
}

/* Carrinho */
export const cart = () => read(KEYS.cart, []);

function saveCart(items) {
  write(KEYS.cart, items);
  window.dispatchEvent(new CustomEvent("tp:cart", { detail: { items } }));
}

export function cartCount() {
  return cart().reduce((n, i) => n + i.qty, 0);
}

export function addToCart({ productId, qty = 1, selections = {}, photo = null, attachments = [] }) {
  const product = productById(productId);
  if (!product || !product.active) throw new StoreError("not_found", "Produto indisponível.");
  const items = cart();
  const hasPersonal = Object.values(selections).some(Boolean) || photo || (attachments && attachments.length > 0);
  const same = !hasPersonal && items.find((i) => i.productId === productId && !i.photo && !(i.attachments && i.attachments.length) && !Object.values(i.selections).some(Boolean));
  const already = items.filter((i) => i.productId === productId).reduce((n, i) => n + i.qty, 0);
  if (product.mode === "pronta" && already + qty > product.stock) {
    throw new StoreError("stock", `Só temos ${product.stock} em estoque.`);
  }
  if (same) same.qty += qty;
  else items.push({ key: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, productId, qty, selections, photo, attachments });
  saveCart(items);
}

export function updateCartQty(key, qty) {
  const items = cart();
  const item = items.find((i) => i.key === key);
  if (!item) return;
  const product = productById(item.productId);
  const others = items.filter((i) => i.productId === item.productId && i.key !== key).reduce((n, i) => n + i.qty, 0);
  if (product?.mode === "pronta" && qty + others > product.stock) throw new StoreError("stock", `Só temos ${product.stock} em estoque.`);
  item.qty = Math.max(1, Math.min(99, qty));
  saveCart(items);
}

export function removeFromCart(key) {
  saveCart(cart().filter((i) => i.key !== key));
}

export function clearCart() {
  saveCart([]);
}

/* Cupons */
export const coupons = () => read(KEYS.coupons, []);

export function findCoupon(code) {
  const c = coupons().find((x) => x.code === String(code || "").trim().toUpperCase());
  return c && c.active ? c : null;
}

export function saveCoupon(coupon) {
  const code = String(coupon.code || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{3,20}$/.test(code)) throw new StoreError("invalid", "Código deve ter de 3 a 20 letras ou números.");
  if (!(coupon.value > 0) || (coupon.type === "percent" && coupon.value > 90)) throw new StoreError("invalid", "Valor de desconto inválido.");
  const list = coupons().filter((c) => c.code !== code);
  const saved = { ...coupon, code };
  list.push(saved);
  write(KEYS.coupons, list);
  bgSync("/api/v1/store/coupons", "POST", { coupon: saved });
}

export function removeCoupon(code) {
  write(KEYS.coupons, coupons().filter((c) => c.code !== code));
  bgSync("/api/v1/store/coupons", "DELETE", { code });
}

/* Configurações */
export const settings = () => ({ ...SETTINGS, ...read(KEYS.settings, {}) });
export function saveSettings(patch) {
  const next = { ...settings(), ...patch };
  write(KEYS.settings, next);
  bgSync("/api/v1/store/settings", "PUT", { settings: next });
}

/* Totais */
export function computeTotals({ items = cart(), couponCode = "", shippingMethod = "retirada" } = {}) {
  const cfg = settings();
  const errors = [];
  const rows = [];
  for (const item of items) {
    const product = productById(item.productId);
    if (!product || !product.active) {
      errors.push("Um item do carrinho não está mais disponível.");
      continue;
    }
    if (product.mode === "pronta" && item.qty > product.stock) errors.push(`${product.name}: só ${product.stock} em estoque.`);
    const unit = unitPrice(product, item.selections);
    rows.push({ item, product, unit, total: unit * item.qty });
  }
  const subtotal = rows.reduce((s, r) => s + r.total, 0);
  let discount = 0;
  let coupon = null;
  let couponError = "";
  if (couponCode) {
    coupon = findCoupon(couponCode);
    if (!coupon) couponError = "Cupom inválido ou expirado.";
    else if (subtotal < coupon.minOrder) {
      couponError = `Cupom válido para pedidos a partir de ${(coupon.minOrder / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`;
      coupon = null;
    } else discount = coupon.type === "percent" ? Math.round((subtotal * coupon.value) / 100) : Math.min(coupon.value, subtotal);
  }
  const shipping = shippingMethod === "envio" && subtotal - discount < cfg.freeShippingMin ? cfg.shippingFlat : 0;
  const maxLead = rows.reduce((m, r) => Math.max(m, r.product.mode === "demanda" ? r.product.leadDays : cfg.readyShipDays), 0);
  return { rows, subtotal, discount, coupon, couponError, shipping, total: subtotal - discount + shipping, errors, maxLead };
}

/* Pedidos */
export const orders = () => read(KEYS.orders, []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export const orderById = (id) => orders().find((o) => o.id === id);

function nextOrderId(list) {
  const year = new Date().getFullYear();
  const max = list.reduce((m, o) => Math.max(m, Number(o.id.split("-")[2]) || 0), 0);
  return `TP-${year}-${String(max + 1).padStart(4, "0")}`;
}

export function createOrder({ customer, shipping, payment, couponCode }) {
  const totals = computeTotals({ couponCode, shippingMethod: shipping.method });
  if (!totals.rows.length) throw new StoreError("empty", "Seu carrinho está vazio.");
  if (totals.errors.length) throw new StoreError("stock", totals.errors[0]);
  const list = read(KEYS.orders, []);
  const now = new Date().toISOString();
  const status = payment.status === "aprovado" ? "pago" : "aguardando";
  const order = {
    id: nextOrderId(list),
    createdAt: now,
    customer,
    shipping,
    payment,
    coupon: totals.coupon?.code || null,
    items: totals.rows.map((r) => ({
      productId: r.product.id, name: r.product.name, image: r.product.image, mode: r.product.mode,
      qty: r.item.qty, unit: r.unit, selections: r.item.selections, photo: r.item.photo || null,
      attachments: Array.isArray(r.item.attachments) ? r.item.attachments : [],
    })),
    totals: { subtotal: totals.subtotal, discount: totals.discount, shipping: totals.shipping, total: totals.total },
    leadDays: totals.maxLead,
    status,
    history: [{ at: now, status, note: status === "pago" ? "Pagamento aprovado (simulado)." : "Pedido criado." }],
  };
  list.push(order);
  try {
    write(KEYS.orders, list);
  } catch {
    order.items.forEach((i) => { i.photo = i.photo ? "removida" : null; });
    write(KEYS.orders, list);
  }
  order.items.forEach((i) => adjustStock(i.productId, -i.qty));
  clearCart();
  bgSync("/api/v1/store/orders", "POST", { order });
  return order;
}

export function setOrderStatus(id, status, note = "") {
  const list = read(KEYS.orders, []);
  const order = list.find((o) => o.id === id);
  if (!order || !STATUS[status] || order.status === status) return order;
  if (status === "cancelado") order.items.forEach((i) => adjustStock(i.productId, i.qty));
  if (order.status === "cancelado") order.items.forEach((i) => adjustStock(i.productId, -i.qty));
  if (status === "pago" && order.payment) order.payment.status = "aprovado";
  order.status = status;
  order.history.push({ at: new Date().toISOString(), status, note: note || STATUS[status].label });
  write(KEYS.orders, list);
  bgSync("/api/v1/store/orders/status", "PATCH", {
    id: order.id,
    status: order.status,
    payment: order.payment,
    history: order.history,
  });
  return order;
}

export async function purgeOrderAttachments(orderId) {
  const list = read(KEYS.orders, []);
  const order = list.find((o) => o.id === orderId);
  if (order) {
    const now = new Date().toISOString();
    order.items.forEach((it) => {
      if (it.photo) it.photo = "removida";
      if (Array.isArray(it.attachments)) {
        it.attachments.forEach((a) => {
          a.purgedAt = now;
        });
      }
    });
    write(KEYS.orders, list);
  }
  try {
    await fetch(`/api/v1/store/orders/${encodeURIComponent(orderId)}/attachments`, {
      method: "DELETE",
      credentials: "same-origin",
    });
  } catch {
    // Fallback local já atualizado
  }
}
