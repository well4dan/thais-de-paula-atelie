// Gaveta do carrinho: montada uma vez e redesenhada a cada evento tp:cart.

import { h, icon, clear, toast, $ } from "./dom.js";
import { money } from "./format.js";
import * as store from "./store.js";
import { selectionsSummary } from "./ui.js";

let drawer;
let lastFocus = null;

function build() {
  drawer = h("div", { class: "drawer", id: "cart-drawer", "aria-hidden": "true" },
    h("div", { class: "drawer__scrim", "data-close": "" }),
    h("aside", { class: "drawer__panel", role: "dialog", "aria-modal": "true", "aria-labelledby": "cart-title" },
      h("div", { class: "drawer__head" },
        h("h2", { id: "cart-title", text: "Seu carrinho" }),
        h("button", { class: "icon-btn", type: "button", "data-close": "", "aria-label": "Fechar carrinho" }, icon("x"))),
      h("div", { class: "drawer__body", id: "cart-body" }),
      h("div", { class: "drawer__foot", id: "cart-foot" })));
  document.body.append(drawer);
  drawer.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawer.classList.contains("is-open")) close();
  });
}

function itemRow(row) {
  const { item, product, unit } = row;
  const summary = selectionsSummary(product, item.selections);
  const setQty = (q) => {
    try {
      store.updateCartQty(item.key, q);
    } catch (err) {
      toast(err.message, "error");
    }
  };
  return h("div", { class: "cart-item" },
    h("img", { class: "cart-item__img", src: item.photo || product.image, alt: "", width: 76, height: 76 }),
    h("div", {},
      h("p", { class: "cart-item__name", text: product.name }),
      summary ? h("p", { class: "cart-item__opts", text: summary }) : null,
      item.photo ? h("p", { class: "cart-item__opts", text: "Foto enviada" }) : null,
      h("div", { class: "cart-item__row" },
        h("div", { class: "qty" },
          h("button", { type: "button", "aria-label": "Diminuir", onclick: () => setQty(item.qty - 1) }, icon("minus")),
          h("output", { "aria-live": "polite", text: String(item.qty) }),
          h("button", { type: "button", "aria-label": "Aumentar", onclick: () => setQty(item.qty + 1) }, icon("plus"))),
        h("span", { class: "price", text: money(unit * item.qty) }),
        h("button", { class: "icon-btn", type: "button", "aria-label": `Remover ${product.name}`, onclick: () => store.removeFromCart(item.key) }, icon("trash")))));
}

export function render() {
  if (!drawer) return;
  const body = clear($("#cart-body", drawer));
  const foot = clear($("#cart-foot", drawer));
  const totals = store.computeTotals();
  if (!totals.rows.length) {
    body.append(h("div", { class: "empty" },
      icon("bag"),
      h("h3", { text: "Carrinho vazio" }),
      h("p", { text: "Escolha um mimo na loja e ele aparece aqui." }),
      h("a", { class: "btn btn--plain", href: "/loja.html" }, "Ver a loja")));
    return;
  }
  totals.rows.forEach((r) => body.append(itemRow(r)));
  const cfg = store.settings();
  const missing = cfg.freeShippingMin - totals.subtotal;
  foot.append(
    h("div", { class: "drawer__row drawer__row--total" }, h("span", { text: "Subtotal" }), h("span", { text: money(totals.subtotal) })),
    h("p", { class: "field__hint", text: missing > 0 ? `Faltam ${money(missing)} para frete grátis no envio.` : "Você ganhou frete grátis no envio." }),
    h("a", { class: "btn btn--block", href: "/checkout.html" }, "Finalizar pedido", h("span", { class: "btn__dot" }, icon("arrow-right"))));
}

export function updateCount() {
  const count = store.cartCount();
  document.querySelectorAll("[data-cart-count]").forEach((el) => {
    el.textContent = String(count);
    el.dataset.empty = String(count === 0);
  });
}

export function open() {
  lastFocus = document.activeElement;
  render();
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  document.documentElement.style.overflow = "hidden";
  setTimeout(() => $("[data-close].icon-btn", drawer)?.focus(), 50);
}

export function close() {
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
  document.documentElement.style.overflow = "";
  lastFocus?.focus?.();
}

export function initCart() {
  build();
  updateCount();
  window.addEventListener("tp:cart", () => {
    updateCount();
    render();
    document.querySelectorAll("[data-cart-count]").forEach((el) => {
      el.animate?.([{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }], { duration: 420, easing: "cubic-bezier(0.32,0.72,0,1)" });
    });
  });
  window.addEventListener("storage", () => {
    updateCount();
    render();
  });
  document.querySelectorAll("[data-open-cart]").forEach((btn) => btn.addEventListener("click", open));
}
