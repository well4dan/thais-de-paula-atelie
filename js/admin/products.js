// Produtos no painel: catálogo, controle de upload de fotos por produto e linha, preço "de / por", selos e vitrine.

import { $, h, icon, clear, toast } from "../dom.js";
import { money, slugify } from "../format.js";
import * as store from "../store.js";
import { IMAGE_CHOICES } from "../data/seed.js";
import { imagePicker } from "./media-upload.js";
import { currentShowcase, persistShowcase } from "./site-showcase.js";
import { adminApi, hasServer } from "./api.js";

let selectedLineFilter = "todas";

export const hasPhotoUpload = (product) => Boolean((product?.options || []).some((o) => o.type === "photo"));
export const isPhotoRequired = (product) => Boolean((product?.options || []).find((o) => o.type === "photo")?.required);

export function mergeProductOptions(existingOptions = [], { hasNameOpt, hasPhotoOpt, photoRequired = false }) {
  let options = JSON.parse(JSON.stringify(Array.isArray(existingOptions) ? existingOptions : []));

  if (hasNameOpt) {
    if (!options.some((o) => o.type === "text")) {
      options.unshift({ id: "nome", type: "text", label: "Nome para personalizar", maxLength: 24, required: true });
    }
  } else {
    options = options.filter((o) => o.type !== "text");
  }

  if (hasPhotoOpt) {
    if (options.some((o) => o.type === "photo")) {
      options = options.map((o) => (o.type === "photo" ? { ...o, required: Boolean(photoRequired) } : o));
    } else {
      const photoOpt = {
        id: "foto",
        type: "photo",
        label: "Envie sua(s) foto(s) para personalizar",
        required: Boolean(photoRequired),
      };
      const obsIdx = options.findIndex((o) => o.type === "textarea");
      if (obsIdx >= 0) options.splice(obsIdx, 0, photoOpt);
      else options.push(photoOpt);
    }
  } else {
    options = options.filter((o) => o.type !== "photo");
  }

  return options;
}

async function setProductPhotoUpload(product, enabled, required = false) {
  const options = mergeProductOptions(product.options || [], {
    hasNameOpt: (product.options || []).some((o) => o.type === "text"),
    hasPhotoOpt: enabled,
    photoRequired: required,
  });
  store.saveProduct({ ...product, options });
  await store.flushSync();
}

async function applyBulkPhotoUpload(targetList, enabled, rerender) {
  if (!targetList.length) {
    toast("Nenhum produto exibido para atualizar.", "error");
    return;
  }
  for (const product of targetList) {
    const options = mergeProductOptions(product.options || [], {
      hasNameOpt: (product.options || []).some((o) => o.type === "text"),
      hasPhotoOpt: enabled,
      photoRequired: enabled ? isPhotoRequired(product) : false,
    });
    store.saveProduct({ ...product, options });
  }
  await store.flushSync();
  toast(
    enabled
      ? `Upload de fotos ativado em ${targetList.length} produto(s).`
      : `Upload de fotos desativado em ${targetList.length} produto(s).`
  );
  rerender();
}

export function renderProducts(view, { rerender }) {
  const allProducts = store.products({ includeInactive: true });
  const lines = store.lines();
  if (selectedLineFilter !== "todas" && !lines.some((l) => l.slug === selectedLineFilter)) {
    selectedLineFilter = "todas";
  }
  const list = selectedLineFilter === "todas"
    ? allProducts
    : allProducts.filter((p) => p.line === selectedLineFilter);
  const photoCount = list.filter((p) => hasPhotoUpload(p)).length;
  const lineLabel = selectedLineFilter === "todas"
    ? "todos os produtos exibidos"
    : `linha "${store.lineBySlug(selectedLineFilter)?.name || selectedLineFilter}"`;

  const lineSelect = h("select", {
    class: "select",
    id: "admin-prod-line-filter",
    style: "width:auto;min-width:220px",
    "aria-label": "Filtrar catálogo por linha",
    onchange: (e) => {
      selectedLineFilter = e.target.value;
      rerender();
    },
  },
  h("option", { value: "todas", selected: selectedLineFilter === "todas", text: `Todas as linhas (${allProducts.length})` }),
  lines.map((l) => {
    const count = allProducts.filter((p) => p.line === l.slug).length;
    return h("option", { value: l.slug, selected: selectedLineFilter === l.slug, text: `${l.name} (${count})` });
  }));

  view.append(
    h("div", { class: "admin-card" },
      h("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:0.85rem;flex-wrap:wrap;gap:0.75rem" },
        h("div", {},
          h("h2", { style: "font-size:1.6rem", text: `Catálogo (${list.length} de ${allProducts.length} itens)` }),
          h("p", {
            class: "field__hint",
            style: "margin-top:0.2rem",
            text: `${photoCount} de ${list.length} item(ns) aceitando upload de fotos do cliente (${lineLabel}).`,
          })),
        h("button", {
          class: "btn btn--sm", type: "button",
          onclick: () => openProductModal(null, rerender),
        }, icon("plus"), "Novo produto")),
      h("div", {
        style: "display:flex;flex-wrap:wrap;align-items:center;gap:0.65rem;padding:0.75rem 0.9rem;margin-bottom:1rem;border-radius:var(--r-input);background:var(--cream-2);border:1px solid var(--line)",
      },
      h("label", { for: "admin-prod-line-filter", style: "font-size:var(--t-xs);font-weight:600;color:var(--ink-2)", text: "Linha:" }),
      lineSelect,
      h("div", { style: "display:flex;flex-wrap:wrap;gap:0.5rem;margin-left:auto" },
        h("button", {
          class: "btn btn--sm btn--ghost",
          id: "admin-line-enable-photo",
          type: "button",
          onclick: () => applyBulkPhotoUpload(list, true, rerender),
        }, icon("check"), selectedLineFilter === "todas" ? "Ativar upload de fotos nos exibidos" : "Ativar upload de fotos nesta linha"),
        h("button", {
          class: "btn btn--sm btn--ghost",
          id: "admin-line-disable-photo",
          type: "button",
          onclick: () => applyBulkPhotoUpload(list, false, rerender),
        }, selectedLineFilter === "todas" ? "Desativar upload de fotos nos exibidos" : "Desativar upload de fotos nesta linha"))),
      h("table", { class: "admin-table" },
        h("thead", {}, h("tr", {},
          h("th", { text: "Peça" }),
          h("th", { text: "Linha" }),
          h("th", { text: "Modo" }),
          h("th", { text: "Upload de Fotos" }),
          h("th", { text: "Preço" }),
          h("th", { text: "Estoque / Prazo" }),
          h("th", { text: "Status" }),
          h("th", { text: "Ações" }))),
        h("tbody", {}, list.map((p) => {
          const photoOn = hasPhotoUpload(p);
          const photoReq = isPhotoRequired(p);
          return h("tr", {},
            h("td", {},
              h("div", { style: "display:flex;align-items:center;gap:0.65rem" },
                h("img", { src: p.image, alt: "", width: 44, height: 44, style: "border-radius:10px;object-fit:cover" }),
                h("strong", { text: p.name }))),
            h("td", { text: store.lineBySlug(p.line)?.name || p.line }),
            h("td", { text: p.mode === "pronta" ? "Pronta entrega" : "Sob demanda" }),
            h("td", {},
              h("div", { style: "display:grid;gap:0.3rem;justify-items:start" },
                h("label", { class: "check", style: "font-size:var(--t-xs);font-weight:600" },
                  h("input", {
                    type: "checkbox",
                    checked: photoOn,
                    "aria-label": `Permitir upload de fotos em ${p.name}`,
                    onchange: async (e) => {
                      const next = e.target.checked;
                      await setProductPhotoUpload(p, next, next ? photoReq : false);
                      toast(next ? `Upload de fotos ativado em "${p.name}".` : `Upload de fotos desativado em "${p.name}".`);
                      rerender();
                    },
                  }),
                  photoOn ? "Aceita fotos" : "Sem foto"),
                photoOn
                  ? h("select", {
                      class: "select",
                      style: "padding:0.2rem 0.55rem;min-height:auto;width:auto;font-size:0.76rem",
                      "aria-label": `Obrigatoriedade do upload de foto em ${p.name}`,
                      onchange: async (e) => {
                        const req = e.target.value === "obrigatoria";
                        await setProductPhotoUpload(p, true, req);
                        toast(req ? `Foto obrigatória em "${p.name}".` : `Foto opcional em "${p.name}".`);
                        rerender();
                      },
                    },
                    h("option", { value: "opcional", selected: !photoReq, text: "Foto opcional" }),
                    h("option", { value: "obrigatoria", selected: photoReq, text: "Foto obrigatória" }))
                  : null)),
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
                }, icon("trash")))));
        })))));
}

const BADGE_OPTIONS = [["novidade", "Novidade"], ["mais_vendido", "Mais vendido"]];

async function openProductModal(existing, rerender) {
  const dlg = $("#admin-dialog");
  const body = clear($("#admin-dialog-body"));
  $("#admin-dialog-title").textContent = existing ? `Editar ${existing.name}` : "Novo produto";

  const p = existing || {
    id: "", slug: "", name: "", line: selectedLineFilter !== "todas" ? selectedLineFilter : "cadernos", mode: "demanda",
    price: 3990, stock: 10, leadDays: 5, featured: false, active: true,
    image: IMAGE_CHOICES[0], description: "", compareAtPrice: null, badges: [],
    options: [{ id: "nome", type: "text", label: "Nome para personalizar", maxLength: 22, required: true }],
  };
  let chosenImage = p.image;
  const inShowcase = currentShowcase().some((x) => x.id === p.id);
  const initialPhotoOn = hasPhotoUpload(p);
  const initialPhotoReq = initialPhotoOn && isPhotoRequired(p);
  let media = [];
  if (hasServer()) media = (await adminApi("/api/v1/admin/site").catch(() => ({ media: [] }))).media || [];

  const photoReqInput = h("input", {
    type: "checkbox",
    id: "pf-opt-photo-req",
    checked: initialPhotoReq,
    disabled: !initialPhotoOn,
  });

  const photoOptInput = h("input", {
    type: "checkbox",
    id: "pf-opt-photo",
    checked: initialPhotoOn,
    onchange: (e) => {
      if (!e.target.checked) {
        photoReqInput.checked = false;
        photoReqInput.disabled = true;
      } else {
        photoReqInput.disabled = false;
      }
    },
  });

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
      const photoRequired = hasPhotoOpt && $("#pf-opt-photo-req").checked;
      const options = mergeProductOptions(existing ? existing.options : [], {
        hasNameOpt,
        hasPhotoOpt,
        photoRequired,
      });

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
          options,
        });
        await store.flushSync();
        const wantShowcase = $("#pf-showcase").checked;
        if (wantShowcase !== inShowcase) {
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
  h("fieldset", { class: "field full choice-row" },
    h("legend", { text: "Campos de personalização na página do produto" }),
    h("label", { class: "check" }, h("input", { type: "checkbox", id: "pf-opt-name", checked: (p.options || []).some((o) => o.type === "text") }), "Pedir nome para personalizar"),
    h("label", { class: "check" }, photoOptInput, "Permitir upload de fotos pelo cliente neste produto"),
    h("label", { class: "check" }, photoReqInput, "Exigir foto obrigatória para adicionar ao carrinho")),
  h("label", { class: "check" }, h("input", { type: "checkbox", id: "pf-showcase", checked: inShowcase }), "Mostrar na vitrine da página inicial"),
  h("label", { class: "check" }, h("input", { type: "checkbox", id: "pf-active", checked: p.active }), "Visível na loja"),
  h("div", { class: "full", style: "display:flex;justify-content:flex-end;gap:0.5rem;margin-top:0.5rem" },
    h("button", { class: "btn btn--sm btn--ghost", type: "button", onclick: () => dlg.close() }, "Cancelar"),
    h("button", { class: "btn btn--sm", type: "submit" }, "Salvar produto")));

  body.append(form);
  dlg.showModal();
}
