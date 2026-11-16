// Produtos no painel: catálogo, edição com foto própria (otimizada), preço "de / por", selos e vitrine da home.

import { $, h, icon, clear, toast } from "../dom.js";
import { money, slugify } from "../format.js";
import * as store from "../store.js";
import { IMAGE_CHOICES } from "../data/seed.js";
import { imagePicker } from "./media-upload.js";
import { currentShowcase, persistShowcase } from "./site-showcase.js";
import { adminApi, hasServer } from "./api.js";

export function renderProducts(view, { rerender }) {
  const list = store.products({ includeInactive: true });
  view.append(
    h("div", { class: "admin-card" },
      h("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:0.75rem" },
        h("h2", { style: "font-size:1.6rem", text: `Catálogo (${list.length} itens)` }),
        h("button", {
          class: "btn btn--sm", type: "button",
          onclick: () => openProductModal(null, rerender),
        }, icon("plus"), "Novo produto")),
      h("table", { class: "admin-table" },
        h("thead", {}, h("tr", {},
          h("th", { text: "Peça" }),
          h("th", { text: "Linha" }),
          h("th", { text: "Modo" }),
          h("th", { text: "Preço" }),
          h("th", { text: "Estoque / Prazo" }),
          h("th", { text: "Status" }),
          h("th", { text: "Ações" }))),
        h("tbody", {}, list.map((p) => h("tr", {},
          h("td", {},
            h("div", { style: "display:flex;align-items:center;gap:0.65rem" },
              h("img", { src: p.image, alt: "", width: 44, height: 44, style: "border-radius:10px;object-fit:cover" }),
              h("strong", { text: p.name }))),
          h("td", { text: store.lineBySlug(p.line)?.name || p.line }),
          h("td", { text: p.mode === "pronta" ? "Pronta entrega" : "Sob demanda" }),
          h("td", { text: money(p.price) }),
          h("td", { text: p.mode === "pronta" ? `${p.stock} un.` : `${p.leadDays} dias úteis` }),
          h("td", { text: p.active ? (Number.isInteger(p.homeOrder) || p.featured ? "Ativo + Vitrine" : "Ativo") : "Oculto" }),
          h("td", {},
            h("div", { style: "display:flex;gap:0.4rem" },
              h("button", { class: "btn btn--sm btn--ghost", type: "button", onclick: () => openProductModal(p, rerender) }, "Editar"),
              h("button", {
                class: "icon-btn", type: "button", "aria-label": `Excluir ${p.name}`,
                onclick: () => {
                  store.removeProduct(p.id);
                  toast("Produto removido.");
                  rerender();
                },
              }, icon("trash"))))))))));
}

const BADGE_OPTIONS = [["novidade", "Novidade"], ["mais_vendido", "Mais vendido"]];

async function openProductModal(existing, rerender) {
  const dlg = $("#admin-dialog");
  const body = clear($("#admin-dialog-body"));
  $("#admin-dialog-title").textContent = existing ? `Editar ${existing.name}` : "Novo produto";

  const p = existing || {
    id: "", slug: "", name: "", line: "cadernos", mode: "demanda",
    price: 3990, stock: 10, leadDays: 5, featured: false, active: true,
    image: IMAGE_CHOICES[0], description: "", compareAtPrice: null, badges: [],
    options: [{ id: "nome", type: "text", label: "Nome para personalizar", maxLength: 22, required: true }],
  };
  let chosenImage = p.image;
  const inShowcase = currentShowcase().some((x) => x.id === p.id);
  let media = [];
  if (hasServer()) media = (await adminApi("/api/v1/admin/site").catch(() => ({ media: [] }))).media || [];

  const form = h("form", {
    class: "form-grid",
    novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      const name = $("#pf-name").value.trim();
      const mode = $("#pf-mode").value;
      const price = Math.round(Number(String($("#pf-price").value).replace(",", ".")) * 100);
      const compareRaw = String($("#pf-compare").value).trim();
      const compareAtPrice = compareRaw ? Math.round(Number(compareRaw.replace(",", ".")) * 100) : null;
      if (compareAtPrice !== null && !(compareAtPrice > price)) {
        $("#pf-compare-err").textContent = "O preço \"de\" precisa ser maior que o preço atual.";
        $("#pf-compare").focus();
        return;
      }
      $("#pf-compare-err").textContent = "";
      const hasNameOpt = $("#pf-opt-name").checked;
      const hasPhotoOpt = $("#pf-opt-photo").checked;
      const options = [];
      if (mode === "demanda" && hasNameOpt) options.push({ id: "nome", type: "text", label: "Nome para personalizar", maxLength: 22, required: true });
      if (mode === "demanda" && hasPhotoOpt) options.push({ id: "foto", type: "photo", label: "Sua foto", required: true });

      try {
        const saved = store.saveProduct({
          ...p,
          id: p.id || undefined,
          slug: p.slug || slugify(name),
          name,
          line: $("#pf-line").value,
          mode,
          price,
          stock: mode === "pronta" ? Number($("#pf-stock").value) : null,
          leadDays: mode === "demanda" ? Number($("#pf-lead").value) : 0,
          image: chosenImage,
          description: $("#pf-desc").value.trim() || "Peça artesanal feita no Thaís de Paula Ateliê.",
          active: $("#pf-active").checked,
          compareAtPrice,
          badges: BADGE_OPTIONS.map(([key]) => key).filter((key) => $(`#pf-badge-${key}`).checked),
          options: existing && existing.options.length > 2 ? existing.options : options,
        });
        const wantShowcase = $("#pf-showcase").checked;
        if (wantShowcase !== inShowcase) {
          await store.flushSync();
          const list = currentShowcase().filter((x) => x.id !== saved.id);
          if (wantShowcase && list.length >= 12) toast("A vitrine já tem 12 produtos. Tire um na aba Site e vitrine.", "error");
          else await persistShowcase(wantShowcase ? [...list, saved] : list);
        }
        dlg.close();
        toast("Produto salvo!");
        rerender();
      } catch (err) {
        toast(err.message, "error");
      }
    },
  },
    imagePicker({
      id: "pf-img", label: "Foto do produto", hint: "Quadrada funciona melhor (ex.: 1200 x 1200 px). É otimizada automaticamente.",
      value: p.image, maxSide: 1200, aspect: "1 / 1", library: media, fixed: IMAGE_CHOICES,
      onChange: (url) => { chosenImage = url || IMAGE_CHOICES[0]; },
    }),
    h("div", { class: "field full" }, h("label", { for: "pf-name", text: "Nome do produto" }), h("input", { class: "input", id: "pf-name", value: p.name, required: true })),
    h("div", { class: "field" },
      h("label", { for: "pf-line", text: "Linha" }),
      h("select", { class: "select", id: "pf-line" }, store.lines().map((l) => h("option", { value: l.slug, selected: p.line === l.slug, text: l.name })))),
    h("div", { class: "field" },
      h("label", { for: "pf-mode", text: "Modo de venda" }),
      h("select", { class: "select", id: "pf-mode" },
        h("option", { value: "demanda", selected: p.mode === "demanda", text: "Sob demanda (personalizado)" }),
        h("option", { value: "pronta", selected: p.mode === "pronta", text: "Pronta entrega (estoque)" }))),
    h("div", { class: "field" }, h("label", { for: "pf-price", text: "Preço atual (R$)" }), h("input", { class: "input", id: "pf-price", type: "number", step: "0.10", min: "0.10", value: (p.price / 100).toFixed(2) })),
    h("div", { class: "field" },
      h("label", { for: "pf-compare", text: "Preço \"de\" na promoção (R$, opcional)" }),
      h("input", { class: "input", id: "pf-compare", type: "number", step: "0.10", min: "0.10", value: p.compareAtPrice ? (p.compareAtPrice / 100).toFixed(2) : "", "aria-describedby": "pf-compare-hint pf-compare-err" }),
      h("span", { class: "field__hint", id: "pf-compare-hint", text: "Aparece riscado ao lado do preço atual, com o selo Promoção." }),
      h("span", { class: "field__error", id: "pf-compare-err", role: "alert" })),
    h("div", { class: "field" }, h("label", { for: "pf-stock", text: "Estoque (se pronta entrega)" }), h("input", { class: "input", id: "pf-stock", type: "number", value: String(p.stock ?? 10) })),
    h("div", { class: "field" }, h("label", { for: "pf-lead", text: "Prazo dias úteis (se sob demanda)" }), h("input", { class: "input", id: "pf-lead", type: "number", value: String(p.leadDays || 5) })),
    h("div", { class: "field full" }, h("label", { for: "pf-desc", text: "Descrição" }), h("textarea", { class: "textarea", id: "pf-desc", text: p.description })),
    h("fieldset", { class: "field full choice-row" },
      h("legend", { text: "Selos (Promoção e Últimas unidades aparecem sozinhos)" }),
      BADGE_OPTIONS.map(([key, label]) => h("label", { class: "check" },
        h("input", { type: "checkbox", id: `pf-badge-${key}`, checked: (p.badges || []).includes(key) }), label))),
    h("label", { class: "check" }, h("input", { type: "checkbox", id: "pf-opt-name", checked: (p.options || []).some((o) => o.type === "text") }), "Pedir nome para personalizar"),
    h("label", { class: "check" }, h("input", { type: "checkbox", id: "pf-opt-photo", checked: (p.options || []).some((o) => o.type === "photo") }), "Pedir foto do cliente"),
    h("label", { class: "check" }, h("input", { type: "checkbox", id: "pf-showcase", checked: inShowcase }), "Mostrar na vitrine da página inicial"),
    h("label", { class: "check" }, h("input", { type: "checkbox", id: "pf-active", checked: p.active }), "Visível na loja"),
    h("div", { class: "full", style: "display:flex;justify-content:flex-end;gap:0.5rem;margin-top:0.5rem" },
      h("button", { class: "btn btn--sm btn--ghost", type: "button", onclick: () => dlg.close() }, "Cancelar"),
      h("button", { class: "btn btn--sm", type: "submit" }, "Salvar produto")));

  body.append(form);
  dlg.showModal();
}
