// Peças de UI reutilizadas na home, loja e produto.

import { h, icon, toast } from "./dom.js";
import { money } from "./format.js";
import * as store from "./store.js";

export function modeTag(product) {
  return product.mode === "pronta"
    ? h("span", { class: "tag tag--pronta" }, icon("package"), "Pronta entrega")
    : h("span", { class: "tag tag--demanda" }, icon("brush"), "Sob demanda");
}

export function availability(product) {
  const cfg = store.settings();
  if (product.mode === "pronta") {
    if (product.stock <= 0) return "Esgotado";
    return product.stock <= 3 ? `Últimas ${product.stock} unidades` : `Envio em até ${cfg.readyShipDays} dias úteis`;
  }
  return `Produção em ${product.leadDays} dias úteis`;
}

// Selos: Promoção e Últimas unidades são automáticos; Novidade e Mais vendido vêm do painel
const BADGE_LABELS = { promocao: "Promoção", novidade: "Novidade", mais_vendido: "Mais vendido", ultimas: "Últimas unidades" };

export const isOnSale = (product) => Number(product.compareAtPrice) > Number(product.price);

export function productBadgeKeys(product) {
  const keys = [];
  if (isOnSale(product)) keys.push("promocao");
  for (const badge of product.badges || []) if (BADGE_LABELS[badge]) keys.push(badge);
  if (product.mode === "pronta" && product.stock > 0 && product.stock <= 3) keys.push("ultimas");
  return keys;
}

export function productBadges(product) {
  const keys = productBadgeKeys(product);
  if (!keys.length) return null;
  return h("div", { class: "product-badges" },
    keys.map((key) => h("span", { class: `product-badge product-badge--${key}`, text: BADGE_LABELS[key] })));
}

// Preço com "de / por" quando houver promoção; leitores de tela ouvem "De R$ X por R$ Y"
export function priceBlock(product, { amount = product.price, prefix = null, attrs = {} } = {}) {
  const sale = isOnSale(product) && amount === product.price;
  return h("p", {
    class: `price${sale ? " price--promo" : ""}`,
    "aria-label": sale ? `De ${money(product.compareAtPrice)} por ${money(amount)}` : null,
    ...attrs,
  },
  prefix ? h("small", { text: prefix }) : null,
  sale ? h("span", { class: "price__was", "aria-hidden": "true", text: money(product.compareAtPrice) }) : null,
  money(amount));
}

const hasVariants = (p) => (p.options || []).some((o) => o.type === "select" && o.choices.some((c) => c.delta > 0));

export function productCard(product, { headingLevel = "h3" } = {}) {
  const line = store.lineBySlug(product.line);
  const url = `/produto.html?p=${encodeURIComponent(product.slug)}`;
  const needsForm = product.options.length > 0;
  const soldOut = product.mode === "pronta" && product.stock <= 0;

  let action;
  if (soldOut) action = h("span", { class: "tag" }, "Esgotado");
  else if (needsForm) {
    action = h("a", { class: "btn btn--sm btn--ghost product-card__add", href: url, "aria-label": `Personalizar ${product.name}` }, "Personalizar");
  } else {
    action = h("button", {
      class: "btn btn--sm product-card__add", type: "button", "aria-label": `Adicionar ${product.name} ao carrinho`,
      onclick: () => {
        try {
          store.addToCart({ productId: product.id });
          toast(`${product.name} foi para o carrinho.`);
        } catch (err) {
          toast(err.message, "error");
        }
      },
    }, icon("plus"), "Adicionar");
  }

  return h("article", { class: "bezel product-card", "data-tilt": "" },
    h("div", { class: "bezel__core" },
      h("div", { class: "product-card__media" },
        productBadges(product),
        h("img", { src: product.image, alt: product.name, width: 600, height: 600, loading: "lazy", decoding: "async" })),
      h("div", { class: "product-card__body" },
        h("div", { class: "product-card__meta" }, h("span", { text: line ? line.name : "" }), modeTag(product)),
        h(headingLevel, { class: "product-card__title" }, h("a", { href: url, text: product.name })),
        h("p", { class: "product-card__meta", text: availability(product) }),
        h("div", { class: "product-card__foot" },
          priceBlock(product, { prefix: hasVariants(product) ? "a partir de" : null }),
          action))));
}

export function selectionsSummary(product, selections) {
  if (!product) return "";
  return (product.options || [])
    .filter((o) => o.type !== "photo" && selections?.[o.id])
    .map((o) => `${o.label.replace(/\s*\(.*\)$/, "")}: ${selections[o.id]}`)
    .join(" | ");
}
