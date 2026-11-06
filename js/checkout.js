// Checkout completo com entrega e pagamento simulado (Pix, Cartão de teste, Boleto).

import { $, $$, h, icon, clear, toast } from "./dom.js";
import { money, maskPhone, maskCep, maskCard, maskExpiry, luhnValid, cardBrand, isEmail, onlyDigits } from "./format.js";
import * as store from "./store.js";
import { selectionsSummary } from "./ui.js";
import { fakePixCode, fakeBoletoLine, renderFakeQrSvg, renderBarcode } from "./payment-sim.js";
import { fetchCurrentUser } from "./auth-client.js";

const state = {
  shippingMethod: "retirada",
  payMethod: "pix",
  couponCode: "",
};

function renderSummary() {
  const box = clear($("#checkout-summary"));
  const totals = store.computeTotals({ couponCode: state.couponCode, shippingMethod: state.shippingMethod });

  if (!totals.rows.length) {
    box.append(h("div", { class: "empty" },
      icon("bag"),
      h("h3", { text: "Seu carrinho está vazio" }),
      h("a", { class: "btn btn--plain", href: "/loja.html" }, "Escolher produtos")));
    $("#checkout-submit")?.setAttribute("disabled", "true");
    return totals;
  }
  $("#checkout-submit")?.removeAttribute("disabled");

  const list = h("div", {});
  for (const r of totals.rows) {
    const sum = selectionsSummary(r.product, r.item.selections);
    list.append(h("div", { class: "cart-item" },
      h("img", { class: "cart-item__img", src: r.item.photo || r.product.image, alt: "", width: 76, height: 76 }),
      h("div", {},
        h("p", { class: "cart-item__name", text: `${r.item.qty}x ${r.product.name}` }),
        sum ? h("p", { class: "cart-item__opts", text: sum }) : null,
        h("p", { class: "price", style: "margin-top:0.25rem;font-size:var(--t-md)", text: money(r.total) }))));
  }

  const couponHint = $("#coupon-feedback");
  if (couponHint) {
    couponHint.textContent = totals.couponError || (totals.coupon ? `Cupom ${totals.coupon.code} aplicado!` : "Dica de demonstração: teste o cupom BEMVINDA10");
    couponHint.style.color = totals.couponError ? "var(--danger)" : "var(--ink-2)";
  }

  box.append(
    list,
    h("div", { style: "display:grid;gap:0.5rem;padding-top:1rem;border-top:1px solid var(--line)" },
      h("div", { class: "drawer__row" }, h("span", { text: "Subtotal" }), h("span", { text: money(totals.subtotal) })),
      totals.discount > 0 ? h("div", { class: "drawer__row" }, h("span", { text: "Desconto" }), h("span", { text: `- ${money(totals.discount)}` })) : null,
      h("div", { class: "drawer__row" }, h("span", { text: "Entrega" }), h("span", { text: totals.shipping === 0 ? "Grátis" : money(totals.shipping) })),
      h("div", { class: "drawer__row drawer__row--total" }, h("span", { text: "Total" }), h("span", { text: money(totals.total) })),
      h("p", { class: "field__hint", text: `Prazo estimado: até ${totals.maxLead} dias úteis.` })));

  renderPayPanel(totals);
  return totals;
}

function renderPayPanel(totals) {
  const panel = clear($("#pay-panel"));
  if (!panel) return;

  if (state.payMethod === "pix") {
    const code = fakePixCode(totals.total);
    panel.append(h("div", { class: "pay-box", style: "display:grid;grid-template-columns:auto 1fr;gap:1.25rem;align-items:center" },
      renderFakeQrSvg(),
      h("div", { style: "display:grid;gap:0.5rem" },
        h("strong", { text: "Pix simulado com aprovação na hora" }),
        h("p", { class: "field__hint", text: "Este QR é ilustrativo. Ao clicar em confirmar pedido, o pagamento será aprovado automaticamente para demonstração." }),
        h("div", { style: "display:flex;gap:0.5rem;flex-wrap:wrap" },
          h("button", {
            class: "btn btn--sm btn--ghost", type: "button",
            onclick: () => { navigator.clipboard?.writeText(code); toast("Código Pix de teste copiado!"); },
          }, icon("copy"), "Copiar código Pix")))));
    return;
  }

  if (state.payMethod === "cartao") {
    panel.append(h("div", { class: "pay-box form-grid" },
      h("div", { class: "full", style: "display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem" },
        h("strong", { text: "Cartão de crédito simulado" }),
        h("button", {
          class: "btn btn--sm btn--ghost", type: "button",
          onclick: () => {
            $("#cc-num").value = "4532 0151 1283 0366";
            $("#cc-name").value = "CLIENTE DEMONSTRACAO";
            $("#cc-exp").value = "12/29";
            $("#cc-cvv").value = "123";
            toast("Cartão de teste preenchido!");
          },
        }, "Preencher cartão de teste")),
      h("div", { class: "field full" },
        h("label", { for: "cc-num", text: "Número do cartão (use o botão de teste acima)" }),
        h("input", { class: "input", id: "cc-num", type: "text", inputmode: "numeric", placeholder: "0000 0000 0000 0000", autocomplete: "off", oninput: (e) => { e.target.value = maskCard(e.target.value); } }),
        h("span", { class: "field__error", id: "err-cc-num" })),
      h("div", { class: "field full" },
        h("label", { for: "cc-name", text: "Nome impresso no cartão" }),
        h("input", { class: "input", id: "cc-name", type: "text", placeholder: "Como está no cartão", autocomplete: "off" }),
        h("span", { class: "field__error", id: "err-cc-name" })),
      h("div", { class: "field" },
        h("label", { for: "cc-exp", text: "Validade (MM/AA)" }),
        h("input", { class: "input", id: "cc-exp", type: "text", inputmode: "numeric", placeholder: "12/29", autocomplete: "off", oninput: (e) => { e.target.value = maskExpiry(e.target.value); } })),
      h("div", { class: "field" },
        h("label", { for: "cc-cvv", text: "Código de segurança" }),
        h("input", { class: "input", id: "cc-cvv", type: "text", inputmode: "numeric", maxLength: 4, placeholder: "123", autocomplete: "off" }))));
    return;
  }

  const line = fakeBoletoLine(totals.total);
  panel.append(h("div", { class: "pay-box", style: "display:grid;gap:0.75rem" },
    h("strong", { text: "Boleto simulado" }),
    renderBarcode(),
    h("code", { style: "font-size:var(--t-xs);word-break:break-all", text: line }),
    h("p", { class: "field__hint", text: "O pedido nascerá como 'Aguardando pagamento' e você poderá aprová-lo na página do pedido ou no painel admin." })));
}

function setErr(id, msg) {
  const el = $(`#err-${id}`);
  const inp = $(`#${id}`);
  if (el) el.textContent = msg;
  if (inp) {
    if (msg) inp.setAttribute("aria-invalid", "true");
    else inp.removeAttribute("aria-invalid");
  }
  return !msg;
}

function validateForm() {
  let ok = true;
  const name = $("#c-name").value.trim();
  const email = $("#c-email").value.trim();
  const phone = onlyDigits($("#c-phone").value);
  ok = setErr("c-name", name.length < 3 ? "Informe seu nome completo." : "") && ok;
  ok = setErr("c-email", !isEmail(email) ? "Informe um e-mail válido." : "") && ok;
  ok = setErr("c-phone", phone.length < 10 ? "Informe um WhatsApp com DDD." : "") && ok;

  if (state.shippingMethod === "envio") {
    ok = setErr("c-cep", onlyDigits($("#c-cep").value).length !== 8 ? "CEP deve ter 8 dígitos." : "") && ok;
    ok = setErr("c-street", $("#c-street").value.trim().length < 3 ? "Informe a rua." : "") && ok;
    ok = setErr("c-number", !$("#c-number").value.trim() ? "Informe o número." : "") && ok;
    ok = setErr("c-city", $("#c-city").value.trim().length < 2 ? "Informe a cidade." : "") && ok;
  }

  if (state.payMethod === "cartao") {
    const num = $("#cc-num")?.value || "";
    const holder = ($("#cc-name")?.value || "").trim();
    ok = setErr("cc-num", !luhnValid(num) ? "Número inválido. Clique em 'Preencher cartão de teste'." : "") && ok;
    ok = setErr("cc-name", holder.length < 3 ? "Informe o titular." : "") && ok;
  }
  return ok;
}

$("#c-phone")?.addEventListener("input", (e) => { e.target.value = maskPhone(e.target.value); });
$("#c-cep")?.addEventListener("input", (e) => { e.target.value = maskCep(e.target.value); });

$$("[data-ship-method]").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.shippingMethod = btn.dataset.shipMethod;
    $$("[data-ship-method]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    const addr = $("#address-fields");
    if (addr) addr.hidden = state.shippingMethod !== "envio";
    renderSummary();
  });
});

$$("[data-pay-method]").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.payMethod = btn.dataset.payMethod;
    $$("[data-pay-method]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    renderSummary();
  });
});

$("#apply-coupon")?.addEventListener("click", () => {
  state.couponCode = ($("#coupon-input")?.value || "").trim();
  renderSummary();
});

$("#checkout-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  // Honeypot anti-bot
  if ($("#c-website")?.value) return;
  if (!validateForm()) {
    toast("Confira os campos destacados.", "error");
    return;
  }

  const customer = {
    name: $("#c-name").value.trim(),
    email: $("#c-email").value.trim(),
    phone: $("#c-phone").value.trim(),
  };

  const shipping = state.shippingMethod === "envio"
    ? {
      method: "envio",
      cep: $("#c-cep").value.trim(),
      street: $("#c-street").value.trim(),
      number: $("#c-number").value.trim(),
      district: $("#c-district").value.trim(),
      city: $("#c-city").value.trim(),
      uf: ($("#c-uf").value.trim() || "PR").toUpperCase(),
    }
    : { method: "retirada" };

  let payment = { method: state.payMethod, status: "aprovado" };
  if (state.payMethod === "cartao") {
    const raw = onlyDigits($("#cc-num").value);
    payment = { method: "cartao", status: "aprovado", brand: cardBrand(raw), last4: raw.slice(-4) };
  } else if (state.payMethod === "boleto") {
    payment = { method: "boleto", status: "pendente" };
  }

  try {
    const order = store.createOrder({ customer, shipping, payment, couponCode: state.couponCode });
    location.href = `/pedido.html?id=${encodeURIComponent(order.id)}`;
  } catch (err) {
    toast(err.message, "error");
  }
});

renderSummary();
window.addEventListener("tp:cart", renderSummary);

fetchCurrentUser().then((user) => {
  if (!user) return;
  if ($("#c-name") && !$("#c-name").value) $("#c-name").value = user.name || "";
  if ($("#c-email") && !$("#c-email").value) $("#c-email").value = user.email || "";
  if ($("#c-phone") && !$("#c-phone").value) $("#c-phone").value = maskPhone(user.phone || "");
  if (user.address) {
    if ($("#c-cep") && !$("#c-cep").value) $("#c-cep").value = user.address.cep || "";
    if ($("#c-city") && !$("#c-city").value) $("#c-city").value = user.address.city || "";
    if ($("#c-street") && !$("#c-street").value) $("#c-street").value = user.address.street || "";
    if ($("#c-number") && !$("#c-number").value) $("#c-number").value = user.address.number || "";
    if ($("#c-district") && !$("#c-district").value) $("#c-district").value = user.address.district || "";
    if ($("#c-uf") && !$("#c-uf").value) $("#c-uf").value = user.address.uf || "PR";
  }
});
