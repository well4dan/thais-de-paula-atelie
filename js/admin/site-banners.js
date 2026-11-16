// Banners do site no painel: listas do topo, do meio e popup, com ordem por arrastar,
// liga/desliga, agendamento e formulário com prévia ao vivo igual ao site.

import { $, h, icon, clear, toast } from "../dom.js";
import { IMAGE_CHOICES } from "../data/seed.js";
import { adminApi } from "./api.js";
import { imagePicker } from "./media-upload.js";
import { sortableList } from "./sortable.js";
import { stateChip, periodFields, readPeriod, toggleSwitch, showFieldErrors, confirmDelete, linkSuggestions } from "./site-shared.js";

const PLACEMENT_INFO = {
  topo: { title: "Banners do topo", lead: "Aparecem no lugar do topo da página inicial, em carrossel. Sem banner no ar, volta o topo padrão com as polaroides.", aspect: "16 / 7", empty: "Nenhum banner no topo: o site mostra o topo padrão." },
  meio: { title: "Banners do meio", lead: "Faixa larga entre \"Como funciona\" e a vitrine de produtos.", aspect: "21 / 7", empty: "Nenhum banner no meio da página." },
  popup: { title: "Popup de entrada", lead: "Janela que abre sozinha na página inicial e na loja. Só o popup mais recente no ar aparece.", aspect: "1 / 1", empty: "Nenhum popup cadastrado." },
};

const FIELD_IDS = { title: "bn-title", subtitle: "bn-sub", ctaLabel: "bn-cta-label", ctaUrl: "bn-cta-url", altText: "bn-alt", imageUrl: "bn-img-label", startsAt: "bn-start", endsAt: "bn-end", popupDelayS: "bn-delay" };

// Prévia montada com as mesmas classes do site (css/site-content.css)
function previewBanner(data, placement) {
  if (placement === "popup") {
    return h("div", { class: "site-popup site-popup--preview" },
      data.imageUrl ? h("img", { class: "site-popup__img", src: data.imageMobileUrl || data.imageUrl, alt: "" }) : null,
      h("div", { class: "site-popup__copy" },
        data.title ? h("h2", { class: "site-popup__title", text: data.title }) : null,
        data.subtitle ? h("p", { class: "site-popup__text", text: data.subtitle }) : null,
        data.ctaLabel ? h("span", { class: "btn btn--block" }, data.ctaLabel) : null));
  }
  const hasText = data.title || data.subtitle || data.ctaLabel;
  return h("div", { class: `site-banner site-banner--${placement}` },
    h("div", { class: "site-banner__viewport" },
      h("div", { class: `site-banner__slide is-active site-banner__slide--${data.textTheme}${hasText ? "" : " site-banner__slide--image-only"}` },
        data.imageUrl ? h("picture", { class: "site-banner__media" }, h("img", { src: data.imageUrl, alt: "" })) : null,
        hasText ? h("div", { class: "site-banner__copy" },
          data.title ? h("h2", { class: "site-banner__title", text: data.title }) : null,
          data.subtitle ? h("p", { class: "site-banner__text", text: data.subtitle }) : null,
          data.ctaLabel ? h("span", { class: "btn site-banner__cta" }, h("span", { text: data.ctaLabel }), h("span", { class: "btn__dot" }, icon("arrow-right"))) : null) : null)));
}

export function openBannerForm({ placement, banner, media, onSaved }) {
  const dlg = $("#admin-dialog");
  const body = clear($("#admin-dialog-body"));
  const info = PLACEMENT_INFO[placement];
  $("#admin-dialog-title").textContent = banner ? `Editar banner` : `Novo banner: ${info.title.toLowerCase()}`;

  const data = {
    title: "", subtitle: "", ctaLabel: "", ctaUrl: "", imageUrl: "", imageMobileUrl: "", altText: "",
    textTheme: "claro", active: true, startsAt: null, endsAt: null, popupDelayS: 4, popupFrequency: "visita",
    ...(banner || {}),
  };
  const previewBox = h("div", { class: "banner-preview", "aria-label": "Prévia do banner" });
  const refresh = () => previewBox.replaceChildren(previewBanner(data, placement));
  const bind = (id, key) => (e) => {
    data[key] = e.target.value;
    refresh();
  };

  const form = h("form", { class: "form-grid", novalidate: true },
    h("div", { class: "full" }, h("p", { class: "field__label", text: "Prévia" }), previewBox),
    imagePicker({
      id: "bn-img", label: placement === "popup" ? "Imagem do popup" : "Imagem do banner (computador)",
      hint: placement === "popup" ? "Quadrada funciona melhor (ex.: 1080 x 1080 px)." : `Proporção ${info.aspect.replace(" / ", ":")} (ex.: ${placement === "topo" ? "1920 x 840" : "1920 x 640"} px). Deixe o assunto principal à direita, o texto fica à esquerda.`,
      value: data.imageUrl, maxSide: 1920, aspect: info.aspect, library: media, fixed: IMAGE_CHOICES,
      onChange: (url) => { data.imageUrl = url; refresh(); },
    }),
    placement === "popup" ? null : imagePicker({
      id: "bn-img-mobile", label: "Imagem para celular (opcional)", hint: "Vertical 4:5 (ex.: 1080 x 1350 px). Sem ela, o celular usa a imagem do computador recortada.",
      value: data.imageMobileUrl, maxSide: 1350, aspect: "4 / 5", library: media, fixed: IMAGE_CHOICES, optional: true,
      onChange: (url) => { data.imageMobileUrl = url; },
    }),
    h("div", { class: "field full" },
      h("label", { for: "bn-alt", text: "Descrição da imagem (para acessibilidade e Google)" }),
      h("input", { class: "input", id: "bn-alt", maxlength: 160, value: data.altText, placeholder: "Ex.: Caderno floral com nome na capa sobre a mesa", oninput: bind("bn-alt", "altText") })),
    h("div", { class: "field full" },
      h("label", { for: "bn-title", text: "Título (opcional)" }),
      h("input", { class: "input", id: "bn-title", maxlength: 80, value: data.title, oninput: bind("bn-title", "title") })),
    h("div", { class: "field full" },
      h("label", { for: "bn-sub", text: "Texto de apoio (opcional)" }),
      h("textarea", { class: "textarea", id: "bn-sub", maxlength: 160, rows: 2, text: data.subtitle, oninput: bind("bn-sub", "subtitle") })),
    h("div", { class: "field" },
      h("label", { for: "bn-cta-label", text: "Texto do botão" }),
      h("input", { class: "input", id: "bn-cta-label", maxlength: 30, value: data.ctaLabel, placeholder: "Ex.: Ver cadernos", oninput: bind("bn-cta-label", "ctaLabel") })),
    h("div", { class: "field" },
      h("label", { for: "bn-cta-url", text: "Link do botão" }),
      h("input", { class: "input", id: "bn-cta-url", list: "bn-links", maxlength: 300, value: data.ctaUrl, placeholder: "/loja.html ou https://...", oninput: bind("bn-cta-url", "ctaUrl") }),
      linkSuggestions("bn-links")),
    placement === "popup" ? null : h("fieldset", { class: "field full choice-row" },
      h("legend", { text: "Cor do texto" }),
      ["claro", "escuro"].map((theme) => h("label", { class: "check" },
        h("input", { type: "radio", name: "bn-theme", value: theme, checked: data.textTheme === theme, onchange: () => { data.textTheme = theme; refresh(); } }),
        theme === "claro" ? "Texto claro (foto escura)" : "Texto escuro (foto clara)"))),
    placement === "popup" ? h("div", { class: "field" },
      h("label", { for: "bn-delay", text: "Abrir depois de (segundos)" }),
      h("input", { class: "input", id: "bn-delay", type: "number", min: 3, max: 60, value: String(data.popupDelayS) })) : null,
    placement === "popup" ? h("div", { class: "field" },
      h("label", { for: "bn-freq", text: "Mostrar para a mesma pessoa" }),
      h("select", { class: "select", id: "bn-freq" },
        [["visita", "1 vez por visita"], ["dia", "1 vez por dia"], ["uma_vez", "1 vez só"]].map(([v, t]) => h("option", { value: v, selected: data.popupFrequency === v, text: t })))) : null,
    ...periodFields("bn", data),
    h("div", { class: "full" }, toggleSwitch({ id: "bn-active", checked: data.active, label: "Banner ligado" })),
    h("div", { class: "full form-actions" },
      h("button", { class: "btn btn--sm btn--ghost", type: "button", onclick: () => dlg.close() }, "Cancelar"),
      h("button", { class: "btn btn--sm", type: "submit", id: "bn-save" }, banner ? "Salvar alterações" : "Criar banner")));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const saveBtn = $("#bn-save");
    saveBtn.disabled = true;
    saveBtn.textContent = "Salvando...";
    const payload = {
      placement,
      title: data.title, subtitle: data.subtitle, ctaLabel: data.ctaLabel, ctaUrl: data.ctaUrl,
      imageUrl: data.imageUrl, imageMobileUrl: data.imageMobileUrl || null, altText: data.altText,
      textTheme: data.textTheme, active: $("#bn-active").checked, ...readPeriod("bn"),
      popupDelayS: placement === "popup" ? Number($("#bn-delay").value) : 4,
      popupFrequency: placement === "popup" ? $("#bn-freq").value : "visita",
    };
    try {
      const path = banner ? `/api/v1/admin/banners/${banner.id}` : "/api/v1/admin/banners";
      await adminApi(path, { method: banner ? "PUT" : "POST", body: payload });
      dlg.close();
      toast(banner ? "Banner atualizado. Já está no site." : "Banner criado. Já está no site.");
      onSaved();
    } catch (err) {
      if (!showFieldErrors(form, err.details, FIELD_IDS)) toast(err.message, "error");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = banner ? "Salvar alterações" : "Criar banner";
    }
  });

  refresh();
  body.append(form);
  dlg.showModal();
}

export function renderBannerSection({ placement, banners, media, reload }) {
  const info = PLACEMENT_INFO[placement];
  const list = banners.filter((b) => b.placement === placement);

  const toggle = async (banner, active) => {
    try {
      await adminApi(`/api/v1/admin/banners/${banner.id}`, { method: "PUT", body: { ...banner, active } });
      toast(active ? "Banner ligado." : "Banner desligado.");
      reload();
    } catch (err) {
      toast(err.message, "error");
      reload();
    }
  };

  const remove = (banner) => confirmDelete({
    title: "Apagar banner?",
    message: `O banner "${banner.title || banner.altText}" sai do site e não pode ser recuperado. A imagem continua na biblioteca.`,
    onConfirm: async () => {
      await adminApi(`/api/v1/admin/banners/${banner.id}`, { method: "DELETE" });
      toast("Banner apagado.");
      reload();
    },
  });

  const card = (b) => h("div", { class: "content-row" },
    h("img", { class: `content-row__thumb content-row__thumb--${placement}`, src: b.imageUrl, alt: "", loading: "lazy" }),
    h("div", { class: "content-row__info" },
      h("strong", { text: b.title || b.altText }),
      h("div", { class: "content-row__meta" }, stateChip(b), b.ctaUrl ? h("span", { class: "field__hint", text: `Botão: ${b.ctaLabel} → ${b.ctaUrl}` }) : null)),
    h("div", { class: "content-row__actions" },
      toggleSwitch({ id: `bn-on-${b.id}`, checked: b.active, label: "Ligado", onChange: (on) => toggle(b, on) }),
      h("button", { class: "btn btn--sm btn--ghost", type: "button", onclick: () => openBannerForm({ placement, banner: b, media, onSaved: reload }) }, icon("pencil"), "Editar"),
      h("button", { class: "icon-btn", type: "button", "aria-label": `Apagar banner ${b.title || b.altText}`, onclick: () => remove(b) }, icon("trash"))));

  return h("section", { class: "admin-card site-block", "aria-labelledby": `sec-${placement}` },
    h("div", { class: "site-block__head" },
      h("div", {},
        h("h2", { id: `sec-${placement}`, text: info.title }),
        h("p", { class: "muted", text: info.lead })),
      h("button", { class: "btn btn--sm", type: "button", onclick: () => openBannerForm({ placement, banner: null, media, onSaved: reload }) }, icon("plus"), "Novo banner")),
    list.length
      ? (placement === "popup"
        ? h("div", { class: "content-list" }, list.map(card))
        : sortableList({
          items: list, keyOf: (b) => b.id, renderItem: card, label: `Ordem dos ${info.title.toLowerCase()}`,
          onReorder: async (ordered) => {
            try {
              await adminApi("/api/v1/admin/banners-order", { method: "PUT", body: { placement, ids: ordered.map((b) => b.id) } });
              toast("Nova ordem salva.");
            } catch (err) {
              toast(err.message, "error");
              reload();
            }
          },
        }))
      : h("div", { class: "empty-state" }, icon("image"), h("p", { text: info.empty })));
}
