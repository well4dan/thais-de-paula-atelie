// Painel Admin Oculto (/painel-tp/): login validado no servidor, métricas, pedidos, produtos, cupons, config e CSV.
// Sem servidor Node (demonstração estática na Vercel) o painel entra em modo demonstração com PIN e dados fictícios locais.

import { $, $$, h, icon, clear, toast } from "../dom.js";
import { money, dateTime } from "../format.js";
import * as store from "../store.js";
import { renderSiteTab } from "./site-content.js";
import { renderProducts } from "./products.js";

store.init();

const DEMO_SESSION_KEY = "tp:admin-demo-unlocked";
const DEMO_PIN = "2611";
let activeTab = "visao";
let statusFilter = "todos";
let accessMode = "checking"; // "checking" | "server" | "demo"
let serverAuthenticated = false;
let serverCsrfToken = "";

function isUnlocked() {
  if (accessMode === "server") return serverAuthenticated;
  if (accessMode === "demo") {
    try {
      return sessionStorage.getItem(DEMO_SESSION_KEY) === "1";
    } catch {
      return false;
    }
  }
  return false;
}

function syncLockScreen() {
  const ok = isUnlocked();
  $("#admin-lock").hidden = ok;
  $("#admin-shell").hidden = !ok;
  $("#admin-login-form").hidden = ok || accessMode !== "server";
  $("#pin-form").hidden = ok || accessMode !== "demo";
  const intro = {
    checking: "Verificando o acesso...",
    server: "Área restrita. Entre com o e-mail e a senha da administradora.",
    demo: "Versão de demonstração. Digite o PIN para conhecer o painel.",
  };
  $("#lock-intro").textContent = intro[accessMode];
  if (ok) renderActiveTab();
}

async function startServerSession(csrfToken) {
  serverCsrfToken = csrfToken || "";
  store.setAdminCsrfToken(serverCsrfToken);
  serverAuthenticated = true;
  syncLockScreen();
  await store.pullFromPostgres({ admin: true });
}

async function detectAccessMode() {
  try {
    const res = await fetch("/api/v1/admin/me", { credentials: "same-origin" });
    const isJson = (res.headers.get("content-type") || "").includes("application/json");
    if (res.ok && isJson) {
      accessMode = "server";
      await startServerSession((await res.json()).csrfToken);
      return;
    }
    accessMode = isJson && (res.status === 401 || res.status === 503) ? "server" : "demo";
  } catch {
    accessMode = "demo";
  }
  syncLockScreen();
}

$("#admin-login-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = $("#admin-login-error");
  const submit = $("#admin-login-submit");
  errorEl.textContent = "";
  submit.disabled = true;
  try {
    const res = await fetch("/api/v1/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email: $("#admin-email").value.trim(), password: $("#admin-password").value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      errorEl.textContent = data.message || "Não foi possível entrar. Tente novamente.";
      return;
    }
    $("#admin-password").value = "";
    await startServerSession(data.csrfToken);
  } catch {
    errorEl.textContent = "Sem conexão com o servidor. Tente novamente.";
  } finally {
    submit.disabled = false;
  }
});

$("#pin-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  if (($("#pin-input")?.value || "").trim() === DEMO_PIN) {
    try {
      sessionStorage.setItem(DEMO_SESSION_KEY, "1");
    } catch {
      // Sem sessionStorage o acesso dura só até recarregar a página
    }
    $("#pin-error").textContent = "";
    syncLockScreen();
  } else {
    $("#pin-error").textContent = "PIN incorreto.";
  }
});

function lockServerSession(message) {
  serverAuthenticated = false;
  serverCsrfToken = "";
  store.setAdminCsrfToken("");
  store.forgetAdminOrders();
  syncLockScreen();
  if (message) $("#admin-login-error").textContent = message;
}

$("#btn-logout")?.addEventListener("click", async () => {
  if (accessMode === "server") {
    await fetch("/api/v1/admin/logout", {
      method: "POST",
      headers: { "X-CSRF-Token": serverCsrfToken },
      credentials: "same-origin",
    }).catch(() => {});
    lockServerSession("");
    return;
  }
  try {
    sessionStorage.removeItem(DEMO_SESSION_KEY);
  } catch {
    // Nada a limpar
  }
  syncLockScreen();
});

window.addEventListener("tp:admin-expired", () => lockServerSession("Sua sessão expirou. Entre novamente."));

$("#btn-reset-demo")?.addEventListener("click", async () => {
  await store.resetDemo();
  toast("Dados de demonstração restaurados!");
  renderActiveTab();
});

$("#btn-export-csv")?.addEventListener("click", () => {
  const rows = [
    ["Codigo", "Data", "Cliente", "WhatsApp", "Status", "Pagamento", "Entrega", "Total_BRL"],
  ];
  for (const o of store.orders()) {
    rows.push([
      o.id,
      o.createdAt,
      `"${o.customer.name.replace(/"/g, '""')}"`,
      o.customer.phone,
      o.status,
      o.payment.method,
      o.shipping.method,
      (o.totals.total / 100).toFixed(2),
    ]);
  }
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `pedidos-thais-de-paula-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$$("[data-admin-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    activeTab = btn.dataset.adminTab;
    $$("[data-admin-tab]").forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
    renderActiveTab();
  });
});

function renderActiveTab() {
  const view = clear($("#admin-view"));
  if (!view) return;
  if (activeTab === "visao") renderOverview(view);
  else if (activeTab === "pedidos") renderOrders(view);
  else if (activeTab === "site") renderSiteTab(view);
  else if (activeTab === "produtos") renderProducts(view, { rerender: renderActiveTab });
  else if (activeTab === "cupons") renderCoupons(view);
  else if (activeTab === "config") renderSettings(view);
}

/* 1. Visão Geral */
function renderOverview(view) {
  const list = store.orders();
  const valid = list.filter((o) => o.status !== "cancelado");
  const revenue = valid.reduce((s, o) => s + o.totals.total, 0);
  const avg = valid.length ? Math.round(revenue / valid.length) : 0;
  const pending = list.filter((o) => o.status === "aguardando" || o.status === "pago" || o.status === "producao").length;

  const days = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const sum = valid.filter((o) => o.createdAt.slice(0, 10) === key).reduce((s, o) => s + o.totals.total, 0);
    days.push({ label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`, sum });
  }
  const maxDay = Math.max(1, ...days.map((d) => d.sum));

  view.append(
    h("div", { class: "kpi-grid" },
      h("div", { class: "kpi-card" }, h("span", { text: "Faturamento simulado" }), h("strong", { text: money(revenue) })),
      h("div", { class: "kpi-card" }, h("span", { text: "Total de pedidos" }), h("strong", { text: String(list.length) })),
      h("div", { class: "kpi-card" }, h("span", { text: "Ticket médio" }), h("strong", { text: money(avg) })),
      h("div", { class: "kpi-card" }, h("span", { text: "Em aberto / produção" }), h("strong", { text: String(pending) }))),
    h("div", { class: "admin-card", style: "margin-bottom:1.5rem" },
      h("h2", { style: "font-size:1.5rem", text: "Vendas dos últimos 14 dias" }),
      h("div", { class: "chart-bars" },
        days.map((d) => h("div", { class: "chart-bar", title: `${d.label}: ${money(d.sum)}` },
          h("div", { class: "chart-bar__fill", style: `height:${Math.max(5, Math.round((d.sum / maxDay) * 100))}%` }),
          h("span", { class: "chart-bar__lbl", text: d.label.slice(0, 2) }))))),
    h("div", { class: "admin-card" },
      h("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem" },
        h("h2", { style: "font-size:1.5rem", text: "Pedidos recentes" }),
        h("button", {
          class: "btn btn--sm btn--ghost", type: "button",
          onclick: () => {
            activeTab = "pedidos";
            $$("[data-admin-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.adminTab === "pedidos")));
            renderActiveTab();
          },
        }, "Ver todos os pedidos")),
      buildOrdersTable(list.slice(0, 6))));
}

/* 2. Pedidos */
function buildOrdersTable(list) {
  return h("table", { class: "admin-table" },
    h("thead", {}, h("tr", {},
      h("th", { text: "Código" }),
      h("th", { text: "Data" }),
      h("th", { text: "Cliente" }),
      h("th", { text: "Itens" }),
      h("th", { text: "Total" }),
      h("th", { text: "Status" }),
      h("th", { text: "Ações" }))),
    h("tbody", {}, list.map((o) => h("tr", {},
      h("td", {}, h("strong", { text: o.id })),
      h("td", { text: dateTime(o.createdAt) }),
      h("td", {}, h("div", { text: o.customer.name }), h("div", { class: "field__hint", text: o.customer.phone })),
      h("td", { text: o.items.map((i) => `${i.qty}x ${i.name}`).join(", ") }),
      h("td", { text: money(o.totals.total) }),
      h("td", {},
        h("select", {
          class: "select", style: "min-height:36px;padding:0.3rem 0.6rem;width:auto",
          "aria-label": `Status do pedido ${o.id}`,
          onchange: (e) => {
            store.setOrderStatus(o.id, e.target.value);
            toast(`Pedido ${o.id} atualizado!`);
            renderActiveTab();
          },
        }, Object.entries(store.STATUS).map(([k, v]) => h("option", { value: k, selected: o.status === k, text: v.label })))),
      h("td", {},
        h("div", { style: "display:flex;gap:0.4rem;flex-wrap:wrap" },
          h("button", {
            class: "btn btn--sm btn--ghost", type: "button",
            onclick: () => openOrderDialog(o),
          }, "Detalhes"),
          orderHasActiveImages(o)
            ? h("a", {
                class: "btn btn--sm btn--ghost",
                href: `/api/v1/store/orders/${encodeURIComponent(o.id)}/attachments.zip`,
                download: `${o.id}-fotos-cliente.zip`,
                title: "Baixar todas as fotos enviadas neste pedido em .ZIP",
              }, icon("download"), "Baixar .ZIP")
            : null))))));
}

function orderHasActiveImages(o) {
  for (const it of o.items || []) {
    if (it.photo && it.photo !== "removida" && it.photo !== "expirada_7_dias") return true;
    if (Array.isArray(it.attachments)) {
      for (const a of it.attachments) {
        const expired = Boolean(a.purgedAt) || (a.expiresAt && new Date(a.expiresAt).getTime() <= Date.now());
        if (!expired) return true;
      }
    }
  }
  return false;
}

function formatRemainingRetention(att, orderCreatedAt) {
  if (att?.purgedAt) {
    return "Apagada do banco (ciclo de 7 dias concluído)";
  }
  const expMs = att?.expiresAt
    ? new Date(att.expiresAt).getTime()
    : new Date(orderCreatedAt).getTime() + 7 * 24 * 60 * 60 * 1000;
  const diffMs = expMs - Date.now();
  if (diffMs <= 0) {
    return "Expirada (7 dias) - será removida na próxima varredura";
  }
  const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  return `Disponível para download (apaga automaticamente em ${days} dia${days > 1 ? "s" : ""})`;
}

function openOrderDialog(o) {
  const dlg = $("#admin-dialog");
  const body = clear($("#admin-dialog-body"));
  $("#admin-dialog-title").textContent = `Pedido ${o.id}`;

  let hasActiveImages = false;
  const items = h("div", { style: "display:grid;gap:0.75rem" });
  for (const it of o.items) {
    const opts = Object.entries(it.selections || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" | ");
    const validPhoto = it.photo && it.photo !== "removida" && it.photo !== "expirada_7_dias";
    if (validPhoto) hasActiveImages = true;

    const attBlocks = h("div", { style: "display:grid;gap:0.35rem;margin-top:0.35rem" });
    const atts = Array.isArray(it.attachments) ? it.attachments : [];

    if (atts.length > 0) {
      for (const att of atts) {
        const isPurged = Boolean(att.purgedAt) || (att.expiresAt && new Date(att.expiresAt).getTime() <= Date.now());
        if (!isPurged) hasActiveImages = true;
        const sizeKb = Math.max(1, Math.round((att.sizeBytes || 0) / 1024));
        const retentionText = formatRemainingRetention(att, o.createdAt);

        attBlocks.append(
          h("div", { style: "display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem;font-size:0.84rem" },
            h("span", { text: `📎 ${att.fileName || "imagem.jpg"} (${sizeKb} KB) · ${retentionText}` }),
            !isPurged && att.id
              ? h("a", {
                  href: `/api/v1/store/attachments/${encodeURIComponent(att.id)}/download`,
                  download: `${o.id}_${att.fileName || "arte.jpg"}`,
                  class: "link-btn",
                }, "Baixar arquivo original")
              : null
          )
        );
      }
    } else if (validPhoto) {
      attBlocks.append(
        h("a", {
          href: it.photo,
          download: `${o.id}-${it.productId}.jpg`,
          class: "link-btn",
        }, "Baixar foto enviada pelo cliente (expira em 7 dias)")
      );
    } else if (it.photo === "removida" || it.photo === "expirada_7_dias") {
      attBlocks.append(
        h("span", { class: "field__hint", text: "Imagem apagada do banco (prazo de 7 dias ou exclusão pós-arte)." })
      );
    }

    items.append(h("div", { class: "cart-item" },
      h("img", { class: "cart-item__img", src: validPhoto ? it.photo : it.image, alt: "", width: 76, height: 76 }),
      h("div", {},
        h("strong", { text: `${it.qty}x ${it.name}` }),
        opts ? h("p", { class: "cart-item__opts", text: `Personalização: ${opts}` }) : h("p", { class: "cart-item__opts", text: "Sem personalização (pronta entrega)" }),
        attBlocks)));
  }

  const actionsBar = h("div", { style: "margin-top:1rem;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:0.75rem" },
    h("strong", { text: `Total: ${money(o.totals.total)} (${o.payment.method.toUpperCase()})` }),
    h("div", { style: "display:flex;flex-wrap:wrap;gap:0.5rem" },
      hasActiveImages
        ? h("a", {
            class: "btn btn--sm btn--plain",
            href: `/api/v1/store/orders/${encodeURIComponent(o.id)}/attachments.zip`,
            download: `${o.id}-fotos-cliente.zip`,
          }, icon("download"), "Baixar todas as fotos (.ZIP)")
        : null,
      hasActiveImages
        ? h("button", {
            class: "btn btn--sm btn--ghost",
            type: "button",
            onclick: async () => {
              await store.purgeOrderAttachments(o.id);
              toast(`Imagens do pedido ${o.id} apagadas do banco!`);
              const refreshed = store.orderById(o.id) || o;
              openOrderDialog(refreshed);
              renderActiveTab();
            },
          }, "Apagar imagens agora (Arte pronta)")
        : null,
      h("a", { class: "btn btn--sm btn--ghost", href: `/pedido.html?id=${encodeURIComponent(o.id)}`, target: "_blank", rel: "noopener noreferrer" }, "Abrir visão do cliente")));

  body.append(
    h("p", { text: `Cliente: ${o.customer.name} (${o.customer.email} | ${o.customer.phone})` }),
    h("p", { class: "muted", style: "margin-top:0.25rem", text: o.shipping.method === "envio" ? `Envio: ${o.shipping.street}, ${o.shipping.number} - ${o.shipping.city}/${o.shipping.uf} (CEP ${o.shipping.cep})` : "Retirada combinada pelo WhatsApp" }),
    h("p", { class: "field__hint", style: "margin-top:0.35rem", text: "Política de armazenamento: as imagens enviadas pelos clientes ficam disponíveis para download original e são apagadas automaticamente do banco após 7 dias." }),
    h("hr", { style: "border:0;border-top:1px solid var(--line);margin:1rem 0" }),
    items,
    actionsBar);
  dlg.showModal();
}

function renderOrders(view) {
  const all = store.orders();
  const filtered = statusFilter === "todos" ? all : all.filter((o) => o.status === statusFilter);

  const chips = h("div", { class: "chips", style: "margin-bottom:1.25rem" },
    h("button", {
      class: "chip", type: "button", "aria-pressed": String(statusFilter === "todos"),
      onclick: () => { statusFilter = "todos"; renderActiveTab(); },
    }, `Todos (${all.length})`),
    Object.entries(store.STATUS).map(([k, v]) => h("button", {
      class: "chip", type: "button", "aria-pressed": String(statusFilter === k),
      onclick: () => { statusFilter = k; renderActiveTab(); },
    }, `${v.label} (${all.filter((o) => o.status === k).length})`)));

  view.append(
    h("div", { class: "admin-card" },
      h("h2", { style: "font-size:1.6rem;margin-bottom:1rem", text: "Gerenciar pedidos" }),
      chips,
      buildOrdersTable(filtered)));
}

/* 3. Produtos */
/* 4. Cupons */
function renderCoupons(view) {
  const list = store.coupons();
  view.append(
    h("div", { class: "admin-card" },
      h("h2", { style: "font-size:1.6rem;margin-bottom:1rem", text: "Cupons de desconto" }),
      h("form", {
        style: "display:flex;flex-wrap:wrap;gap:0.75rem;align-items:flex-end;margin-bottom:1.5rem",
        onsubmit: (e) => {
          e.preventDefault();
          try {
            const type = $("#cp-type").value;
            const rawVal = Number($("#cp-val").value);
            store.saveCoupon({
              code: $("#cp-code").value,
              type,
              value: type === "percent" ? rawVal : Math.round(rawVal * 100),
              minOrder: Math.round(Number($("#cp-min").value || 0) * 100),
              firstPurchaseOnly: Boolean($("#cp-first")?.checked),
              singleUsePerCustomer: true,
              active: true,
            });
            toast("Cupom salvo!");
            renderActiveTab();
          } catch (err) {
            toast(err.message, "error");
          }
        },
      },
        h("div", { class: "field" }, h("label", { for: "cp-code", text: "Código" }), h("input", { class: "input", id: "cp-code", placeholder: "MIMO10", required: true })),
        h("div", { class: "field" },
          h("label", { for: "cp-type", text: "Tipo" }),
          h("select", { class: "select", id: "cp-type" },
            h("option", { value: "percent", text: "Porcentagem (%)" }),
            h("option", { value: "fixed", text: "Valor fixo (R$)" }))),
        h("div", { class: "field" }, h("label", { for: "cp-val", text: "Desconto" }), h("input", { class: "input", id: "cp-val", type: "number", value: "10", required: true })),
        h("div", { class: "field" }, h("label", { for: "cp-min", text: "Pedido mínimo (R$)" }), h("input", { class: "input", id: "cp-min", type: "number", value: "0" })),
        h("label", { class: "check", style: "margin-bottom:0.5rem" },
          h("input", { type: "checkbox", id: "cp-first" }),
          h("span", { text: "Exclusivo 1ª compra" })),
        h("button", { class: "btn btn--sm", type: "submit" }, "Adicionar cupom")),
      h("table", { class: "admin-table" },
        h("thead", {}, h("tr", {}, h("th", { text: "Código" }), h("th", { text: "Desconto" }), h("th", { text: "Mínimo" }), h("th", { text: "Regra" }), h("th", { text: "Ação" }))),
        h("tbody", {}, list.map((c) => h("tr", {},
          h("td", {}, h("strong", { text: c.code })),
          h("td", { text: c.type === "percent" ? `${c.value}%` : money(c.value) }),
          h("td", { text: money(c.minOrder) }),
          h("td", { text: c.firstPurchaseOnly ? "1ª compra / 1x por cliente" : "1x por cliente" }),
          h("td", {}, h("button", {
            class: "btn btn--sm btn--ghost", type: "button",
            onclick: () => { store.removeCoupon(c.code); renderActiveTab(); },
          }, "Remover"))))))));
}

/* 5. Configurações */
function renderSettings(view) {
  const cfg = store.settings();
  view.append(
    h("div", { class: "admin-card", style: "max-width:640px" },
      h("h2", { style: "font-size:1.6rem;margin-bottom:1rem", text: "Configurações da loja e frete" }),
      h("form", {
        class: "form-grid",
        onsubmit: (e) => {
          e.preventDefault();
          store.saveSettings({
            whatsapp: $("#st-wa").value.trim(),
            shippingFlat: Math.round(Number($("#st-ship").value) * 100),
            freeShippingMin: Math.round(Number($("#st-free").value) * 100),
            readyShipDays: Number($("#st-days").value),
          });
          toast("Configurações salvas!");
        },
      },
        h("div", { class: "field" }, h("label", { for: "st-wa", text: "WhatsApp (com DDI 55)" }), h("input", { class: "input", id: "st-wa", value: cfg.whatsapp })),
        h("div", { class: "field" }, h("label", { for: "st-days", text: "Prazo saída pronta entrega (dias úteis)" }), h("input", { class: "input", id: "st-days", type: "number", value: String(cfg.readyShipDays) })),
        h("div", { class: "field" }, h("label", { for: "st-ship", text: "Frete fixo Correios (R$)" }), h("input", { class: "input", id: "st-ship", type: "number", step: "0.10", value: (cfg.shippingFlat / 100).toFixed(2) })),
        h("div", { class: "field" }, h("label", { for: "st-free", text: "Frete grátis acima de (R$)" }), h("input", { class: "input", id: "st-free", type: "number", step: "1", value: (cfg.freeShippingMin / 100).toFixed(0) })),
        h("div", { class: "full" }, h("button", { class: "btn btn--plain", type: "submit" }, "Salvar configurações")))));
}

$("#admin-dialog-close")?.addEventListener("click", () => $("#admin-dialog")?.close());
syncLockScreen();
detectAccessMode();
window.addEventListener("storage", () => { if (isUnlocked()) renderActiveTab(); });
