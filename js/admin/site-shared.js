// Peças comuns da aba "Site e vitrine": situação no ar/agendado, datas, interruptor e confirmação de exclusão.

import { $, h, clear } from "../dom.js";
import * as store from "../store.js";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Mesma regra do servidor (R1): ativo e dentro do período
export function scheduleState(item, now = Date.now()) {
  if (!item.active) return { key: "off", label: "Desligado" };
  if (item.startsAt && new Date(item.startsAt).getTime() > now) return { key: "scheduled", label: `Agendado para ${dateFmt.format(new Date(item.startsAt))}` };
  if (item.endsAt && new Date(item.endsAt).getTime() <= now) return { key: "ended", label: `Encerrado em ${dateFmt.format(new Date(item.endsAt))}` };
  return { key: "live", label: item.endsAt ? `No ar até ${dateFmt.format(new Date(item.endsAt))}` : "No ar" };
}

export function stateChip(item) {
  const state = scheduleState(item);
  return h("span", { class: `state-chip state-chip--${state.key}`, text: state.label });
}

// <input type="datetime-local"> trabalha no fuso local, sem segundos
export function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null);

export function periodFields(prefix, item) {
  return [
    h("div", { class: "field" },
      h("label", { for: `${prefix}-start`, text: "Começa em (opcional)" }),
      h("input", { class: "input", id: `${prefix}-start`, type: "datetime-local", value: toLocalInput(item.startsAt) })),
    h("div", { class: "field" },
      h("label", { for: `${prefix}-end`, text: "Termina em (opcional)" }),
      h("input", { class: "input", id: `${prefix}-end`, type: "datetime-local", value: toLocalInput(item.endsAt) })),
  ];
}

export function readPeriod(prefix) {
  return { startsAt: fromLocalInput($(`#${prefix}-start`).value), endsAt: fromLocalInput($(`#${prefix}-end`).value) };
}

export function toggleSwitch({ id, checked, label, onChange }) {
  const input = h("input", { type: "checkbox", role: "switch", id, checked, onchange: (e) => onChange?.(e.target.checked) });
  return h("label", { class: "switch", for: id }, input, h("span", { class: "switch__track", "aria-hidden": "true" }), h("span", { text: label }));
}

// Mostra os erros do servidor embaixo do campo certo e foca o primeiro
export function showFieldErrors(form, details, fieldMap) {
  form.querySelectorAll(".field__error[data-generated]").forEach((el) => el.remove());
  let first = null;
  for (const [field, message] of Object.entries(details || {})) {
    const input = form.querySelector(`#${fieldMap[field] || field}`);
    if (!input) continue;
    input.setAttribute("aria-invalid", "true");
    const err = h("span", { class: "field__error", "data-generated": "", role: "alert", text: message });
    input.closest(".field, .img-pick")?.append(err);
    first ||= input;
  }
  first?.focus();
  return Boolean(first);
}

// Confirmação de exclusão no diálogo do painel (nada é apagado sem confirmar)
export function confirmDelete({ title, message, onConfirm }) {
  const dlg = $("#admin-dialog");
  const body = clear($("#admin-dialog-body"));
  $("#admin-dialog-title").textContent = title;
  const confirmBtn = h("button", { class: "btn btn--sm btn--danger", type: "button" }, "Apagar");
  confirmBtn.addEventListener("click", async () => {
    confirmBtn.disabled = true;
    try {
      await onConfirm();
      dlg.close();
    } finally {
      confirmBtn.disabled = false;
    }
  });
  body.append(
    h("p", { text: message }),
    h("div", { style: "display:flex;justify-content:flex-end;gap:0.5rem;margin-top:1.25rem" },
      h("button", { class: "btn btn--sm btn--ghost", type: "button", onclick: () => dlg.close() }, "Cancelar"),
      confirmBtn));
  dlg.showModal();
  confirmBtn.focus();
}

// Sugestões de link: loja, linhas e produtos (a pessoa ainda pode digitar qualquer https://)
export function linkSuggestions(id) {
  return h("datalist", { id },
    h("option", { value: "/loja.html", text: "Loja (todos os produtos)" }),
    store.lines().map((l) => h("option", { value: `/loja.html?linha=${l.slug}`, text: `Linha: ${l.name}` })),
    store.products().map((p) => h("option", { value: `/produto.html?p=${p.slug}`, text: `Produto: ${p.name}` })));
}
