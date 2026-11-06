// Área Logada do Cliente (minha-conta.html):
// Edição de Nome, WhatsApp e Endereço, histórico de consentimento e Autoatendimento LGPD (Exportar / Excluir Conta).

import { $, h, clear, toast } from "./dom.js";
import { maskPhone, maskCep, dateTime, money } from "./format.js";
import {
  fetchCurrentUser,
  updateMyProfile,
  logoutAccount,
  exportMyLgpdData,
  deleteMyAccount,
} from "./auth-client.js";
import * as store from "./store.js";

function populateForm(user) {
  $("#me-name").value = user.name || "";
  $("#me-email").value = user.email || "";
  $("#me-cpf").value = user.cpfMasked || "***.***.***-**";
  $("#me-phone").value = maskPhone(user.phone || "");

  const addr = user.address || {};
  $("#me-cep").value = addr.cep || "";
  $("#me-city").value = addr.city || "";
  $("#me-street").value = addr.street || "";
  $("#me-number").value = addr.number || "";
  $("#me-complement").value = addr.complement || "";
  $("#me-district").value = addr.district || "";
  $("#me-uf").value = addr.uf || "PR";

  const consentBox = clear($("#me-consents"));
  for (const c of user.consents || []) {
    consentBox.append(
      h("li", { class: "field__hint" },
        `Aceite registrado em ${dateTime(c.accepted_at)} (Termos ${c.terms_version} | LGPD ${c.lgpd_version})`)
    );
  }
}

function renderMyOrders(user) {
  const wrap = clear($("#me-orders"));
  const emailLower = (user.email || "").toLowerCase();
  const list = store.orders().filter((o) => (o.customer?.email || "").toLowerCase() === emailLower);

  if (!list.length) {
    wrap.append(
      h("p", { class: "muted", text: "Você ainda não possui pedidos vinculados a este e-mail neste navegador." }),
      h("a", { class: "btn btn--sm btn--ghost", href: "/loja.html", style: "margin-top:0.75rem" }, "Ir para a loja")
    );
    return;
  }

  for (const o of list) {
    wrap.append(
      h("div", { class: "cart-item", style: "grid-template-columns:1fr auto;align-items:center" },
        h("div", {},
          h("strong", { text: `Pedido ${o.id}` }),
          h("p", { class: "cart-item__opts", text: `${dateTime(o.createdAt)} · ${store.STATUS[o.status]?.label || o.status}` }),
          h("p", { class: "price", style: "font-size:var(--t-md);margin-top:0.2rem", text: money(o.totals.total) })),
        h("a", { class: "btn btn--sm btn--ghost", href: `/pedido.html?id=${encodeURIComponent(o.id)}` }, "Acompanhar"))
    );
  }
}

async function init() {
  const user = await fetchCurrentUser({ force: true });
  if (!user) {
    location.href = "/conta.html?next=/minha-conta.html";
    return;
  }

  $("#me-greeting").textContent = `Olá, ${user.name.split(" ")[0]}!`;
  populateForm(user);
  renderMyOrders(user);

  $("#me-phone")?.addEventListener("input", (e) => { e.target.value = maskPhone(e.target.value); });
  $("#me-cep")?.addEventListener("input", (e) => { e.target.value = maskCep(e.target.value); });

  $("#profile-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#profile-save");
    btn.disabled = true;
    try {
      const updated = await updateMyProfile({
        name: $("#me-name").value.trim(),
        phone: $("#me-phone").value.trim(),
        address: {
          cep: $("#me-cep").value.trim(),
          city: $("#me-city").value.trim(),
          street: $("#me-street").value.trim(),
          number: $("#me-number").value.trim(),
          complement: $("#me-complement").value.trim(),
          district: $("#me-district").value.trim(),
          uf: $("#me-uf").value.trim().toUpperCase(),
        },
      });
      populateForm(updated);
      toast("Dados e endereço atualizados com sucesso!");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      btn.disabled = false;
    }
  });

  $("#btn-logout-account")?.addEventListener("click", async () => {
    await logoutAccount();
    location.href = "/conta.html";
  });

  $("#btn-export-lgpd")?.addEventListener("click", async () => {
    try {
      const data = await exportMyLgpdData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `meus-dados-lgpd-thais-de-paula-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast("Arquivo de portabilidade LGPD baixado!");
    } catch (err) {
      toast(err.message, "error");
    }
  });

  const delDialog = $("#delete-dialog");
  $("#btn-open-delete")?.addEventListener("click", () => delDialog?.showModal());
  $("#btn-cancel-delete")?.addEventListener("click", () => delDialog?.close());

  $("#delete-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = $("#del-password").value;
    if (!pw) return;
    try {
      await deleteMyAccount(pw);
      delDialog?.close();
      toast("Sua conta e seus dados pessoais foram excluídos.");
      setTimeout(() => { location.href = "/"; }, 900);
    } catch (err) {
      $("#del-error").textContent = err.message;
      toast(err.message, "error");
    }
  });
}

init();
