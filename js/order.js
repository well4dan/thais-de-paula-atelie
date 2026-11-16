// Página de acompanhamento de pedido: confirmação, linha do tempo, resumo e botão para enviar no WhatsApp.

import { $, h, icon, clear, toast, params } from "./dom.js";
import { money, dateTime, waLink } from "./format.js";
import * as store from "./store.js";
import { renderFakeQrSvg, renderBarcode } from "./payment-sim.js";

const STEPS = [
  { key: "aguardando", label: "Pedido recebido" },
  { key: "pago", label: "Pagamento confirmado" },
  { key: "producao", label: "Em produção no ateliê" },
  { key: "pronto", label: "Pronto" },
  { key: "enviado", label: "Enviado ou retirado" },
];

let lookupMessage = { code: "", text: "" };

function buildTimeline(status) {
  const flowIndex = store.STATUS_FLOW.indexOf(status);
  return h("ol", { class: "timeline", "aria-label": "Progresso do pedido" },
    STEPS.map((st, idx) => {
      let cls = "";
      if (status === "cancelado") cls = "";
      else if (idx < flowIndex || status === "concluido") cls = "is-done";
      else if (idx === flowIndex) cls = "is-current";
      return h("li", { class: cls }, st.label);
    }));
}

// Pedido consultado no servidor: só status, prazo e itens (sem dados pessoais nem valores)
function renderTracking(order) {
  const root = clear($("#order-root"));
  const itemsList = h("div", {}, order.items.map((it) => h("div", { class: "cart-item" },
    h("img", { class: "cart-item__img", src: it.image, alt: "", width: 76, height: 76 }),
    h("div", {}, h("p", { class: "cart-item__name", text: `${it.qty}x ${it.name}` })))));
  const last = order.history[order.history.length - 1];
  root.append(h("div", { class: "bezel" },
    h("div", { class: "bezel__core checkout-step" },
      h("span", { class: "tag tag--pronta", text: store.STATUS[order.status]?.label || order.status }),
      h("h1", { class: "section-title", style: "margin-top:0.5rem", text: `Pedido ${order.id}` }),
      h("p", { class: "muted", text: `Realizado em ${dateTime(order.createdAt)}${last?.note ? ` | ${last.note}` : ""}` }),
      order.shipping?.serviceLabel ? h("p", { class: "field__hint", style: "margin-top:0.35rem", text: `Entrega: ${order.shipping.serviceLabel}` }) : null,
      order.shipping?.trackingCode
        ? h("p", { class: "field__hint", style: "margin-top:0.25rem" },
            `Rastreio Loggi: ${order.shipping.trackingCode} `,
            order.shipping.trackingUrl
              ? h("a", { class: "link-btn", href: order.shipping.trackingUrl, target: "_blank", rel: "noopener noreferrer" }, "Acompanhar entrega")
              : null)
        : null,
      buildTimeline(order.status),
      h("h2", { style: "font-size:1.5rem;margin:1.5rem 0 0.75rem", text: "Itens da encomenda" }),
      itemsList)));
}

async function lookupOrder(code, phone) {
  const phoneLast4 = String(phone || "").replace(/\D+/g, "").slice(-4);
  if (!code) return;
  const local = store.orderById(code);
  if (local) {
    history.replaceState(null, "", `/pedido.html?id=${encodeURIComponent(code)}`);
    renderOrder(local);
    return;
  }
  if (phoneLast4.length !== 4) {
    lookupMessage = { code, text: "Informe também os 4 últimos dígitos do telefone usado na compra." };
    renderOrder(null);
    return;
  }
  try {
    const res = await fetch(`/api/v1/store/orders/${encodeURIComponent(code)}/track?phone=${phoneLast4}`, { credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.order) {
      renderTracking(data.order);
      return;
    }
    lookupMessage = { code, text: data.message || "Pedido não encontrado. Confira o código e o telefone." };
  } catch {
    lookupMessage = { code, text: "Não foi possível consultar agora. Fale com o ateliê pelo WhatsApp." };
  }
  renderOrder(null);
}

function renderOrder(order) {
  const root = clear($("#order-root"));
  if (!order) {
    root.append(h("div", { class: "bezel" },
      h("div", { class: "bezel__core checkout-step empty" },
        icon("receipt"),
        h("h2", { text: "Consulte seu pedido" }),
        h("p", { text: "Digite o código do pedido (ex.: TP-2026-0022) e os 4 últimos dígitos do telefone usado na compra." }),
        h("form", {
          style: "display:flex;gap:0.5rem;flex-wrap:wrap;justify-content:center;margin-top:0.5rem",
          onsubmit: (e) => {
            e.preventDefault();
            lookupOrder($("#lookup-input").value.trim().toUpperCase(), $("#lookup-phone").value);
          },
        },
          h("input", { class: "input", id: "lookup-input", type: "text", placeholder: "TP-2026-0022", style: "width:200px", maxlength: "40", value: lookupMessage.code || "", "aria-label": "Código do pedido" }),
          h("input", { class: "input", id: "lookup-phone", type: "text", inputmode: "numeric", placeholder: "4 últimos dígitos do telefone", style: "width:220px", maxlength: "4", "aria-label": "4 últimos dígitos do telefone usado na compra" }),
          h("button", { class: "btn btn--plain", type: "submit" }, "Buscar pedido")),
        lookupMessage.text ? h("p", { class: "field__error", role: "alert", style: "margin-top:0.75rem", text: lookupMessage.text }) : null)));
    return;
  }

  const timeline = buildTimeline(order.status);

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
  const payBox = buildPaymentActionBox(order);

  root.append(
    h("div", { class: "bezel" },
      h("div", { class: "bezel__core checkout-step" },
        h("div", { style: "display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:1rem" },
          h("div", {},
            h("span", { class: "tag tag--pronta", text: store.STATUS[order.status]?.label || order.status }),
            h("h1", { class: "section-title", style: "margin-top:0.5rem", text: `Pedido ${order.id}` }),
            h("p", { class: "muted", text: `Realizado em ${dateTime(order.createdAt)} por ${order.customer.name}` })),
          h("div", { style: "display:flex;gap:0.6rem;flex-wrap:wrap" },
            order.status === "aguardando" && !serverSynced ? h("button", {
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
            h("p", { class: "field__hint", style: "margin-top:0.5rem", text: `Forma de pagamento: ${(order.payment?.method || "pix").toUpperCase()} (${order.payment?.status || "pendente"})` }),
            h("p", { class: "field__hint", text: order.shipping?.method === "envio" ? `${order.shipping.serviceLabel || "Entrega"}: ${order.shipping.street}, ${order.shipping.number} (${order.shipping.city}/${order.shipping.uf})` : "Entrega: Retirada combinada pelo WhatsApp" }),
            order.shipping?.trackingCode
              ? h("div", { style: "margin-top:0.35rem;display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center" },
                  h("span", { class: "field__hint", text: `Rastreio Loggi: ${order.shipping.trackingCode}` }),
                  order.shipping.trackingUrl
                    ? h("a", { class: "link-btn", href: order.shipping.trackingUrl, target: "_blank", rel: "noopener noreferrer" }, "Rastrear na Loggi")
                    : null)
              : null,
            payBox))))));
}

function buildPaymentActionBox(order) {
  const pay = order.payment || {};
  const isWaiting = order.status === "aguardando" || pay.status === "pendente";

  if (!isWaiting) {
    if (pay.checkoutUrl) {
      return h("div", { style: "margin-top:0.75rem" },
        h("a", {
          class: "btn btn--sm btn--ghost",
          href: pay.checkoutUrl,
          target: "_blank",
          rel: "noopener noreferrer",
        }, "Ver comprovante / fatura no Asaas"));
    }
    return null;
  }

  const children = [h("strong", { text: "Pagamento aguardando confirmação" })];

  if (pay.method === "pix" && pay.pixQrPayload) {
    const qrEl = pay.pixQrImage
      ? h("img", { src: pay.pixQrImage, alt: "QR Code PIX do pedido", width: 156, height: 156, style: "border-radius:10px;background:#fff;padding:0.35rem" })
      : renderFakeQrSvg();
    children.push(
      h("div", { style: "display:flex;flex-wrap:wrap;gap:1rem;align-items:center;margin-top:0.5rem" },
        qrEl,
        h("div", { style: "flex:1;min-width:200px;display:grid;gap:0.5rem" },
          h("code", { style: "font-size:0.75rem;word-break:break-all;background:var(--paper);padding:0.5rem;border-radius:8px;border:1px solid var(--line)", text: pay.pixQrPayload }),
          h("button", {
            class: "btn btn--sm btn--plain",
            type: "button",
            onclick: () => {
              navigator.clipboard?.writeText(pay.pixQrPayload);
              toast("Código PIX Copia e Cola copiado!");
            },
          }, icon("copy"), "Copiar código PIX (Copia e Cola)")))
    );
  }

  if (pay.method === "boleto" && pay.boletoLine) {
    children.push(
      h("div", { style: "display:grid;gap:0.5rem;margin-top:0.5rem" },
        renderBarcode(),
        h("code", { style: "font-size:0.78rem;word-break:break-all;background:var(--paper);padding:0.5rem;border-radius:8px;border:1px solid var(--line)", text: pay.boletoLine }),
        h("button", {
          class: "btn btn--sm btn--ghost",
          type: "button",
          onclick: () => {
            navigator.clipboard?.writeText(pay.boletoLine);
            toast("Linha digitável do boleto copiada!");
          },
        }, icon("copy"), "Copiar linha digitável"))
    );
  }

  if (pay.checkoutUrl) {
    children.push(
      h("a", {
        class: "btn btn--sm",
        style: "margin-top:0.5rem;width:100%;justify-content:center",
        href: pay.checkoutUrl,
        target: "_blank",
        rel: "noopener noreferrer",
      }, "Pagar ou abrir fatura segura no Asaas")
    );
  }

  return children.length > 1
    ? h("div", { style: "margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid var(--line);display:grid;gap:0.35rem" }, ...children)
    : null;
}

// Status vem sempre do servidor quando ele existe: o ateliê muda as etapas no painel, não neste navegador
let serverSynced = false;

async function refreshFromServer(order) {
  const phoneLast4 = String(order?.customer?.phone || "").replace(/\D+/g, "").slice(-4);
  if (!order || phoneLast4.length !== 4) return;
  try {
    const res = await fetch(`/api/v1/store/orders/${encodeURIComponent(order.id)}/track?phone=${phoneLast4}`, { credentials: "same-origin" });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.order) return;
    serverSynced = true;
    store.mergeServerOrders([data.order]);
    renderOrder(store.orderById(order.id));
  } catch {
    // Sem servidor (demonstração estática): segue com a cópia deste navegador
  }
}

const id = params().get("id");
const found = id ? store.orderById(id) : store.orders()[0];
if (!found && id) lookupMessage = { code: id, text: "" };
renderOrder(found);
refreshFromServer(found);

const REFRESH_MS = 60 * 1000;
setInterval(() => {
  if (document.visibilityState === "visible") refreshFromServer(id ? store.orderById(id) : store.orders()[0]);
}, REFRESH_MS);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshFromServer(id ? store.orderById(id) : store.orders()[0]);
});
window.addEventListener("storage", () => {
  const current = id ? store.orderById(id) : store.orders()[0];
  if (current) renderOrder(current);
});
