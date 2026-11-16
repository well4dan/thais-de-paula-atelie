// Aba "Site e vitrine" do painel: faixas, banners (topo, meio, popup), vitrine da home e biblioteca de imagens.
// Carrega tudo de uma vez do servidor; sem servidor (demonstração estática) explica o que falta.

import { h, icon, toast } from "../dom.js";
import { adminApi, hasServer } from "./api.js";
import { uploadImage } from "./media-upload.js";
import { renderStripSection } from "./site-strips.js";
import { renderBannerSection } from "./site-banners.js";
import { renderShowcaseSection } from "./site-showcase.js";
import { confirmDelete } from "./site-shared.js";

const SECTIONS = [
  ["vitrine", "Vitrine da home"],
  ["topo", "Banners do topo"],
  ["meio", "Banners do meio"],
  ["popup", "Popup"],
  ["faixas", "Faixas promocionais"],
  ["imagens", "Imagens"],
];

let activeSection = "vitrine";

const kb = (bytes) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

function renderMediaSection({ media, reload }) {
  const fileInput = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", multiple: true, hidden: true });
  const status = h("p", { class: "field__hint", "aria-live": "polite" });
  fileInput.addEventListener("change", async () => {
    const files = [...fileInput.files];
    for (const [i, file] of files.entries()) {
      status.textContent = `Otimizando e enviando ${i + 1} de ${files.length}...`;
      try {
        await uploadImage(file, { maxSide: 1920 });
      } catch (err) {
        toast(`${file.name}: ${err.message}`, "error");
      }
    }
    status.textContent = "";
    fileInput.value = "";
    reload();
  });

  const remove = (m) => confirmDelete({
    title: "Apagar imagem?",
    message: "A imagem sai da biblioteca e não pode ser recuperada.",
    onConfirm: async () => {
      try {
        await adminApi(`/api/v1/admin/media/${m.sha256}`, { method: "DELETE" });
        toast("Imagem apagada.");
        reload();
      } catch (err) {
        toast(err.message, "error");
      }
    },
  });

  return h("section", { class: "admin-card site-block", "aria-labelledby": "sec-imagens" },
    h("div", { class: "site-block__head" },
      h("div", {},
        h("h2", { id: "sec-imagens", text: "Biblioteca de imagens" }),
        h("p", { class: "muted", text: "Fotos enviadas para banners e produtos. Cada uma é otimizada antes de subir (até 400 KB) para o site continuar rápido." })),
      h("button", { class: "btn btn--sm", type: "button", onclick: () => fileInput.click() }, icon("upload"), "Enviar imagens")),
    fileInput,
    status,
    media.length
      ? h("ul", { class: "media-grid" }, media.map((m) => h("li", { class: "media-card" },
        h("img", { src: m.url, alt: m.label || "Imagem da biblioteca", loading: "lazy", width: m.width, height: m.height }),
        h("div", { class: "media-card__info" },
          h("span", { class: "field__hint", text: `${m.width} x ${m.height} px · ${kb(m.sizeBytes)}` }),
          m.usageCount
            ? h("span", { class: "state-chip state-chip--live", text: `Em uso (${m.usageCount})` })
            : h("button", { class: "icon-btn", type: "button", "aria-label": "Apagar imagem sem uso", onclick: () => remove(m) }, icon("trash"))))))
      : h("div", { class: "empty-state" }, icon("image"), h("p", { text: "Nenhuma imagem enviada ainda." })));
}

function skeleton() {
  return h("div", { class: "admin-card site-block", "aria-busy": "true", "aria-label": "Carregando conteúdo do site" },
    h("div", { class: "skeleton skeleton--title" }),
    h("div", { class: "skeleton skeleton--row" }),
    h("div", { class: "skeleton skeleton--row" }),
    h("div", { class: "skeleton skeleton--row" }));
}

export async function renderSiteTab(view) {
  const nav = h("div", { class: "subnav", role: "tablist", "aria-label": "Partes do site" },
    SECTIONS.map(([key, label]) => h("button", {
      type: "button", role: "tab", class: "subnav__btn", "aria-selected": String(key === activeSection),
      onclick: () => { activeSection = key; renderSiteTab(view); },
    }, label)));
  const panel = h("div", { class: "site-panel", role: "tabpanel" });
  view.replaceChildren(nav, panel);

  const reload = () => renderSiteTab(view);

  if (activeSection === "vitrine") {
    panel.append(renderShowcaseSection({ rerender: reload }));
    if (!hasServer()) panel.prepend(h("p", { class: "notice", text: "Modo demonstração: a vitrine fica salva só neste navegador. Com o servidor ativo, ela vale para todas as visitantes." }));
    return;
  }

  if (!hasServer()) {
    panel.append(h("div", { class: "admin-card empty-state" }, icon("info"),
      h("p", { text: "Banners, popup, faixas e imagens ficam salvos no servidor. Esta versão de demonstração roda sem servidor, então eles estão desativados aqui." })));
    return;
  }

  panel.append(skeleton());
  let data;
  try {
    data = await adminApi("/api/v1/admin/site");
  } catch (err) {
    panel.replaceChildren(h("div", { class: "admin-card empty-state" }, icon("warning"),
      h("p", { text: err.message }),
      h("button", { class: "btn btn--sm", type: "button", onclick: reload }, icon("reset"), "Tentar de novo")));
    return;
  }

  const { banners, announcements, media } = data;
  let section;
  if (activeSection === "faixas") section = renderStripSection({ announcements, reload });
  else if (activeSection === "imagens") section = renderMediaSection({ media, reload });
  else section = renderBannerSection({ placement: activeSection, banners, media, reload });
  panel.replaceChildren(section);
}
