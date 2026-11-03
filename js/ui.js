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
        h("img", { src: product.image, alt: product.name, width: 600, height: 600, loading: "lazy", decoding: "async" })),
      h("div", { class: "product-card__body" },
        h("div", { class: "product-card__meta" }, h("span", { text: line ? line.name : "" }), modeTag(product)),
        h(headingLevel, { class: "product-card__title" }, h("a", { href: url, text: product.name })),
        h("p", { class: "product-card__meta", text: availability(product) }),
        h("div", { class: "product-card__foot" },
          h("p", { class: "price" }, hasVariants(product) ? h("small", { text: "a partir de" }) : null, money(product.price)),
          action))));
}

export function selectionsSummary(product, selections) {
  if (!product) return "";
  return (product.options || [])
    .filter((o) => o.type !== "photo" && selections?.[o.id])
    .map((o) => `${o.label.replace(/\s*\(.*\)$/, "")}: ${selections[o.id]}`)
    .join(" | ");
}
