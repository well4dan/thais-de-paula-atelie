// Faixas promocionais no painel: lista ordenável, liga/desliga, agendamento e formulário com prévia na cor escolhida.

import { $, h, icon, clear, toast } from "../dom.js";
import { adminApi } from "./api.js";
import { sortableList } from "./sortable.js";
import { stateChip, periodFields, readPeriod, toggleSwitch, showFieldErrors, confirmDelete, linkSuggestions } from "./site-shared.js";

const THEMES = [
  ["cacau", "Marrom cacau"],
  ["rosa", "Rosa queimado"],
  ["salvia", "Verde sálvia"],
  ["dourado", "Dourado folha"],
];

const FIELD_IDS = { text: "st-text", linkUrl: "st-link", linkLabel: "st-link-label", startsAt: "st-start", endsAt: "st-end" };

function stripPreview(data) {
  return h("div", { class: `promo-strip promo-strip--${data.theme} promo-strip--preview` },
    h("div", { class: "promo-strip__track" },
      h("p", { class: "promo-strip__item" },
        h("span", { text: data.text || "Texto da faixa" }),
        data.linkUrl ? h("span", { class: "promo-strip__link" }, data.linkLabel || "Ver mais", icon("arrow-right")) : null)));
}

function openStripForm({ strip, onSaved }) {
  const dlg = $("#admin-dialog");
  const body = clear($("#admin-dialog-body"));
  $("#admin-dialog-title").textContent = strip ? "Editar faixa promocional" : "Nova faixa promocional";
  const data = { text: "", linkUrl: "", linkLabel: "", theme: "cacau", active: true, dismissible: true, startsAt: null, endsAt: null, ...(strip || {}) };
  const preview = h("div", { class: "strip-preview" });
  const refresh = () => preview.replaceChildren(stripPreview(data));
  const bind = (key) => (e) => { data[key] = e.target.value; refresh(); };

  const form = h("form", { class: "form-grid", novalidate: true },
    h("div", { class: "full" }, h("p", { class: "field__label", text: "Prévia" }), preview),
    h("div", { class: "field full" },
      h("label", { for: "st-text", text: "Texto da faixa" }),
      h("input", { class: "input", id: "st-text", maxlength: 140, value: data.text, placeholder: "Ex.: Frete grátis acima de R$ 199", oninput: bind("text") })),
    h("div", { class: "field" },
      h("label", { for: "st-link-label", text: "Texto do link (opcional)" }),
      h("input", { class: "input", id: "st-link-label", maxlength: 30, value: data.linkLabel, placeholder: "Ex.: Ver a loja", oninput: bind("linkLabel") })),
    h("div", { class: "field" },
      h("label", { for: "st-link", text: "Link (opcional)" }),
      h("input", { class: "input", id: "st-link", maxlength: 300, list: "st-links", value: data.linkUrl, placeholder: "/loja.html", oninput: bind("linkUrl") }),
      linkSuggestions("st-links")),
    h("fieldset", { class: "field full choice-row" },
      h("legend", { text: "Cor da faixa" }),
      THEMES.map(([value, label]) => h("label", { class: "check theme-choice" },
        h("input", { type: "radio", name: "st-theme", value, checked: data.theme === value, onchange: () => { data.theme = value; refresh(); } }),
        h("span", { class: `theme-swatch theme-swatch--${value}`, "aria-hidden": "true" }), label))),
    ...periodFields("st", data),
    h("div", { class: "full", style: "display:flex;flex-wrap:wrap;gap:1.25rem" },
      toggleSwitch({ id: "st-active", checked: data.active, label: "Faixa ligada" }),
      toggleSwitch({ id: "st-dismiss", checked: data.dismissible, label: "Cliente pode fechar" })),
    h("div", { class: "full form-actions" },
      h("button", { class: "btn btn--sm btn--ghost", type: "button", onclick: () => dlg.close() }, "Cancelar"),
      h("button", { class: "btn btn--sm", type: "submit", id: "st-save" }, strip ? "Salvar alterações" : "Criar faixa")));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const saveBtn = $("#st-save");
    saveBtn.disabled = true;
    const payload = {
      text: data.text, linkUrl: data.linkUrl, linkLabel: data.linkLabel, theme: data.theme,
      active: $("#st-active").checked, dismissible: $("#st-dismiss").checked, ...readPeriod("st"),
    };
    try {
      await adminApi(strip ? `/api/v1/admin/announcements/${strip.id}` : "/api/v1/admin/announcements", { method: strip ? "PUT" : "POST", body: payload });
      dlg.close();
      toast(strip ? "Faixa atualizada. Já está no site." : "Faixa criada. Já está no site.");
      onSaved();
    } catch (err) {
      if (!showFieldErrors(form, err.details, FIELD_IDS)) toast(err.message, "error");
    } finally {
      saveBtn.disabled = false;
    }
  });

  refresh();
  body.append(form);
  dlg.showModal();
}

export function renderStripSection({ announcements, reload }) {
  const toggle = async (strip, active) => {
    try {
      await adminApi(`/api/v1/admin/announcements/${strip.id}`, { method: "PUT", body: { ...strip, active } });
      toast(active ? "Faixa ligada." : "Faixa desligada.");
    } catch (err) {
      toast(err.message, "error");
    }
    reload();
  };
  const remove = (strip) => confirmDelete({
    title: "Apagar faixa?",
    message: `A faixa "${strip.text}" sai do site e não pode ser recuperada.`,
    onConfirm: async () => {
      await adminApi(`/api/v1/admin/announcements/${strip.id}`, { method: "DELETE" });
      toast("Faixa apagada.");
      reload();
    },
  });

  const row = (s) => h("div", { class: "content-row" },
    h("span", { class: `theme-swatch theme-swatch--${s.theme} theme-swatch--lg`, "aria-hidden": "true" }),
    h("div", { class: "content-row__info" },
      h("strong", { text: s.text }),
      h("div", { class: "content-row__meta" }, stateChip(s), s.linkUrl ? h("span", { class: "field__hint", text: `Link: ${s.linkUrl}` }) : null)),
    h("div", { class: "content-row__actions" },
      toggleSwitch({ id: `st-on-${s.id}`, checked: s.active, label: "Ligada", onChange: (on) => toggle(s, on) }),
      h("button", { class: "btn btn--sm btn--ghost", type: "button", onclick: () => openStripForm({ strip: s, onSaved: reload }) }, icon("pencil"), "Editar"),
      h("button", { class: "icon-btn", type: "button", "aria-label": `Apagar faixa ${s.text}`, onclick: () => remove(s) }, icon("trash"))));

  return h("section", { class: "admin-card site-block", "aria-labelledby": "sec-faixas" },
    h("div", { class: "site-block__head" },
      h("div", {},
        h("h2", { id: "sec-faixas", text: "Faixas promocionais" }),
        h("p", { class: "muted", text: "Aparecem no topo de todas as páginas. Com mais de uma no ar, elas se revezam a cada 5 segundos." })),
      h("button", { class: "btn btn--sm", type: "button", onclick: () => openStripForm({ strip: null, onSaved: reload }) }, icon("plus"), "Nova faixa")),
    announcements.length
      ? sortableList({
        items: announcements, keyOf: (s) => s.id, renderItem: row, label: "Ordem das faixas",
        onReorder: async (ordered) => {
          try {
            await adminApi("/api/v1/admin/announcements-order", { method: "PUT", body: { ids: ordered.map((s) => s.id) } });
            toast("Nova ordem salva.");
          } catch (err) {
            toast(err.message, "error");
            reload();
          }
        },
      })
      : h("div", { class: "empty-state" }, icon("tag"), h("p", { text: "Nenhuma faixa: o topo do site fica sem aviso promocional." })));
}
