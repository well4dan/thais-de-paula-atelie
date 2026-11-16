// Vitrine da página inicial no painel: até 12 produtos, ordem por arrastar, busca para adicionar
// e salvamento automático a cada mudança (com aviso de "salvando / salvo").

import { h, icon, toast } from "../dom.js";
import { money } from "../format.js";
import * as store from "../store.js";
import { adminApi, hasServer } from "./api.js";
import { sortableList } from "./sortable.js";

const MAX = 12;
const soldOut = (p) => p.mode === "pronta" && p.stock <= 0;

export function currentShowcase() {
  const all = store.products({ includeInactive: true });
  const ordered = all.filter((p) => Number.isInteger(p.homeOrder)).sort((a, b) => a.homeOrder - b.homeOrder);
  return ordered.length ? ordered : all.filter((p) => p.featured).slice(0, MAX);
}

// Grava a vitrine no servidor e espelha no catálogo local (homeOrder/featured) para a prévia do painel
export async function persistShowcase(products) {
  const ids = products.map((p) => p.id);
  if (hasServer()) await adminApi("/api/v1/admin/showcase", { method: "PUT", body: { ids } });
  store.applyShowcaseLocally(ids);
}

export function renderShowcaseSection({ rerender }) {
  let selected = currentShowcase();
  const statusEl = h("span", { class: "save-status", "aria-live": "polite" });
  let saveTimer = null;
  let saveSeq = 0;

  const scheduleSave = () => {
    statusEl.textContent = "Salvando...";
    statusEl.dataset.state = "saving";
    clearTimeout(saveTimer);
    const seq = ++saveSeq;
    saveTimer = setTimeout(async () => {
      try {
        await persistShowcase(selected);
        if (seq !== saveSeq) return;
        statusEl.textContent = "Vitrine salva. Já está no site.";
        statusEl.dataset.state = "saved";
      } catch (err) {
        statusEl.textContent = "Não foi possível salvar.";
        statusEl.dataset.state = "error";
        toast(err.message, "error");
      }
    }, 450);
  };

  const listBox = h("div", {});
  const searchInput = h("input", { class: "input", type: "search", id: "sc-search", placeholder: "Buscar produto pelo nome", "aria-label": "Buscar produto para adicionar à vitrine" });
  const pool = h("ul", { class: "pick-list", "aria-label": "Produtos que podem entrar na vitrine" });
  const counter = h("strong", {});

  const productRow = (p) => h("div", { class: "content-row content-row--compact" },
    h("img", { class: "content-row__thumb content-row__thumb--square", src: p.image, alt: "", loading: "lazy" }),
    h("div", { class: "content-row__info" },
      h("strong", { text: p.name }),
      h("div", { class: "content-row__meta" },
        h("span", { class: "field__hint", text: money(p.price) }),
        !p.active ? h("span", { class: "state-chip state-chip--off", text: "Oculto: não aparece" }) : null,
        soldOut(p) ? h("span", { class: "state-chip state-chip--ended", text: "Esgotado: não aparece" }) : null)),
    h("button", {
      class: "icon-btn", type: "button", "aria-label": `Tirar ${p.name} da vitrine`,
      onclick: () => {
        selected = selected.filter((x) => x.id !== p.id);
        paint();
        scheduleSave();
      },
    }, icon("x")));

  function paintPool() {
    const term = searchInput.value.trim().toLowerCase();
    const inShowcase = new Set(selected.map((p) => p.id));
    const candidates = store.products({ includeInactive: true })
      .filter((p) => !inShowcase.has(p.id) && p.name.toLowerCase().includes(term));
    pool.replaceChildren(...(candidates.length ? candidates.map((p) => h("li", {},
      h("button", {
        class: "pick-list__btn", type: "button", disabled: selected.length >= MAX,
        "aria-label": `Adicionar ${p.name} à vitrine`,
        onclick: () => {
          selected = [...selected, p];
          paint();
          scheduleSave();
        },
      },
      h("img", { src: p.image, alt: "", loading: "lazy" }),
      h("span", { text: p.name }),
      icon("plus")))) : [h("li", { class: "field__hint", text: term ? "Nenhum produto com esse nome." : "Todos os produtos já estão na vitrine." })]));
  }

  function paint() {
    counter.textContent = `${selected.length} de ${MAX}`;
    listBox.replaceChildren(selected.length
      ? sortableList({
        items: selected, keyOf: (p) => p.id, renderItem: productRow, label: "Ordem dos produtos na vitrine",
        onReorder: (ordered) => { selected = ordered; scheduleSave(); },
      })
      : h("div", { class: "empty-state" }, icon("store"), h("p", { text: "Vitrine vazia: a página inicial fica sem a seção de destaques. Adicione produtos ao lado." })));
    paintPool();
  }

  searchInput.addEventListener("input", paintPool);
  paint();

  return h("section", { class: "admin-card site-block", "aria-labelledby": "sec-vitrine" },
    h("div", { class: "site-block__head" },
      h("div", {},
        h("h2", { id: "sec-vitrine", text: "Vitrine da página inicial" }),
        h("p", { class: "muted", text: "Os produtos aparecem na seção \"Queridinhos da nossa vitrine\" na ordem abaixo. Produto oculto ou esgotado sai do site sozinho e volta quando tiver estoque." })),
      statusEl),
    h("div", { class: "showcase-grid" },
      h("div", {}, h("p", { class: "field__label" }, "Na vitrine: ", counter), listBox),
      h("div", { class: "showcase-pool" },
        h("p", { class: "field__label", text: "Adicionar à vitrine" }),
        searchInput,
        pool,
        h("button", { class: "btn btn--sm btn--ghost", type: "button", style: "margin-top:0.75rem", onclick: rerender }, icon("reset"), "Recarregar"))));
}
