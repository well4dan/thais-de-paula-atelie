// Página de acompanhamento de pedido: confirmação, linha do tempo, resumo e botão para enviar no WhatsApp.

import { $, h, icon, clear, toast, params } from "./dom.js";
import { money, dateTime, waLink } from "./format.js";
import * as store from "./store.js";

const STEPS = [
  { key: "aguardando", label: "Pedido recebido" },
  { key: "pago", label: "Pagamento confirmado" },
  { key: "producao", label: "Em produção no ateliê" },
  { key: "pronto", label: "Pronto" },
  { key: "enviado", label: "Enviado ou retirado" },
];

function renderOrder(order) {
  const root = clear($("#order-root"));
  if (!order) {
    root.append(h("div", { class: "bezel" },
      h("div", { class: "bezel__core checkout-step empty" },
        icon("receipt"),
        h("h2", { text: "Consulte seu pedido" }),
        h("p", { text: "Digite o código do pedido (ex.: TP-2026-0022) ou escolha o último pedido feito neste navegador." }),
        h("form", {
          style: "display:flex;gap:0.5rem;flex-wrap:wrap;justify-content:center;margin-top:0.5rem",
          onsubmit: (e) => {
            e.preventDefault();
            const code = $("#lookup-input").value.trim().toUpperCase();
            if (code) location.href = `/pedido.html?id=${encodeURIComponent(code)}`;
          },
        },
          h("input", { class: "input", id: "lookup-input", type: "text", placeholder: "TP-2026-0022", style: "width:220px", "aria-label": "Código do pedido" }),
          h("button", { class: "btn btn--plain", type: "submit" }, "Buscar pedido")))));
    return;
  }

  const flowIndex = store.STATUS_FLOW.indexOf(order.status);
  const timeline = h("ol", { class: "timeline", "aria-label": "Progresso do pedido" },
    STEPS.map((st, idx) => {
      let cls = "";
      if (order.status === "cancelado") cls = "";
      else if (idx < flowIndex || order.status === "concluido") cls = "is-done";
      else if (idx === flowIndex) cls = "is-current";
      return h("li", { class: cls }, st.label);
    }));

  const itemsList = h("div", {});
  for (const it of order.items) {
    const opts = Object.entries(it.selections || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" | ");
    itemsList.append(h("div", { class: "cart-item" },
      h("img", { class: "cart-item__img", src: it.photo && it.photo !== "removida" ? it.photo : it.image, alt: "", width: 76, height: 76 }),
      h("div", {},
        h("p", { class: "cart-item__name", text: `${it.qty}x ${it.name}` }),
        opts ? h("p", { class: "cart-item__opts", text: opts }) : null,
        it.photo ? h("p", { class: "cart-item__opts", text: "Foto personalizada anexada" }) : null,
        h("p", { class: "price", style: "margin-top:0.25rem;font-size:var(--t-md)", text: money(it.unit * it.qty) }))));
  }

  const cfg = store.settings();
  const waMsg = `Olá, Thaís! Fiz o pedido ${order.id} no site (${money(order.totals.total)}) em nome de ${order.customer.name}.`;

  root.append(
    h("div", { class: "bezel" },
      h("div", { class: "bezel__core checkout-step" },
        h("div", { style: "display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:1rem" },
          h("div", {},
            h("span", { class: "tag tag--pronta", text: store.STATUS[order.status]?.label || order.status }),
            h("h1", { class: "section-title", style: "margin-top:0.5rem", text: `Pedido ${order.id}` }),
            h("p", { class: "muted", text: `Realizado em ${dateTime(order.createdAt)} por ${order.customer.name}` })),
          h("div", { style: "display:flex;gap:0.6rem;flex-wrap:wrap" },
            order.status === "aguardando" ? h("button", {
              class: "btn btn--sm btn--rose", type: "button",
              onclick: () => {
                const updated = store.setOrderStatus(order.id, "pago", "Pagamento confirmado na simulação.");
                toast("Pagamento simulado confirmado!");
                renderOrder(updated);
              },
            }, icon("check"), "Simular confirmação do pagamento") : null,
            h("a", { class: "btn btn--sm", href: waLink(cfg.whatsapp, waMsg), target: "_blank", rel: "noopener noreferrer" },
              icon("whatsapp"), "Enviar resumo no WhatsApp"))),
        timeline,
        h("div", { class: "checkout-grid", style: "margin-top:1.5rem" },
          h("div", {},
            h("h2", { style: "font-size:1.5rem;margin-bottom:0.75rem", text: "Itens da encomenda" }),
            itemsList),
          h("div", { class: "pay-box", style: "margin-top:0;display:grid;gap:0.5rem" },
            h("h2", { style: "font-size:1.4rem", text: "Resumo financeiro" }),
            h("div", { class: "drawer__row" }, h("span", { text: "Subtotal" }), h("span", { text: money(order.totals.subtotal) })),
            order.totals.discount > 0 ? h("div", { class: "drawer__row" }, h("span", { text: "Desconto" }), h("span", { text: `- ${money(order.totals.discount)}` })) : null,
            h("div", { class: "drawer__row" }, h("span", { text: "Entrega" }), h("span", { text: order.totals.shipping === 0 ? "Grátis" : money(order.totals.shipping) })),
            h("div", { class: "drawer__row drawer__row--total" }, h("span", { text: "Total" }), h("span", { text: money(order.totals.total) })),
            h("p", { class: "field__hint", style: "margin-top:0.5rem", text: `Forma de pagamento: ${order.payment.method.toUpperCase()} (${order.payment.status})` }),
            h("p", { class: "field__hint", text: order.shipping.method === "envio" ? `Entrega: ${order.shipping.street}, ${order.shipping.number} (${order.shipping.city}/${order.shipping.uf})` : "Entrega: Retirada combinada pelo WhatsApp" }))))));
}

const id = params().get("id");
const found = id ? store.orderById(id) : store.orders()[0];
renderOrder(found);
window.addEventListener("storage", () => renderOrder(id ? store.orderById(id) : store.orders()[0]));
