// Catálogo da loja: filtros por linha, modo, busca por texto e ordenação.

import { $, $$, h, icon, clear, params } from "./dom.js";
import * as store from "./store.js";
import { productCard } from "./ui.js";
import { revealNew } from "./motion.js";

const state = {
  linha: "todas",
  modo: "todos",
  q: "",
  ordem: "destaques",
};

function readUrl() {
  const p = params();
  if (p.get("linha")) state.linha = p.get("linha");
  if (p.get("modo")) state.modo = p.get("modo");
  if (p.get("q")) state.q = p.get("q");
}

function syncUrl() {
  const url = new URL(location.href);
  if (state.linha !== "todas") url.searchParams.set("linha", state.linha);
  else url.searchParams.delete("linha");
  if (state.modo !== "todos") url.searchParams.set("modo", state.modo);
  else url.searchParams.delete("modo");
  if (state.q) url.searchParams.set("q", state.q);
  else url.searchParams.delete("q");
  history.replaceState(null, "", url);
}

function renderLineChips() {
  const wrap = $("#line-chips");
  if (!wrap) return;
  clear(wrap);
  const allBtn = h("button", {
    class: "chip", type: "button", "aria-pressed": String(state.linha === "todas"),
    onclick: () => { state.linha = "todas"; syncUrl(); renderLineChips(); renderCatalog(); },
  }, "Todas as linhas");
  wrap.append(allBtn);

  for (const l of store.lines()) {
    wrap.append(h("button", {
      class: "chip", type: "button", "aria-pressed": String(state.linha === l.slug),
      onclick: () => { state.linha = l.slug; syncUrl(); renderLineChips(); renderCatalog(); },
    }, l.name));
  }
}

function syncModeButtons() {
  $$("[data-filter-mode]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.filterMode === state.modo));
  });
}

function renderCatalog() {
  const grid = $("#catalog-grid");
  const countEl = $("#catalog-count");
  if (!grid) return;

  const qNorm = state.q.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let list = store.products().filter((p) => {
    if (state.linha !== "todas" && p.line !== state.linha) return false;
    if (state.modo !== "todos" && p.mode !== state.modo) return false;
    if (qNorm) {
      const hay = `${p.name} ${p.description}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (!hay.includes(qNorm)) return false;
    }
    return true;
  });

  if (state.ordem === "menor") list.sort((a, b) => a.price - b.price);
  else if (state.ordem === "maior") list.sort((a, b) => b.price - a.price);
  else if (state.ordem === "az") list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  else list.sort((a, b) => Number(b.featured) - Number(a.featured));

  if (countEl) countEl.textContent = `${list.length} ${list.length === 1 ? "produto encontrado" : "produtos encontrados"}`;

  clear(grid);
  if (!list.length) {
    grid.append(h("div", { class: "empty", style: "grid-column:1/-1" },
      icon("search"),
      h("h3", { text: "Nenhum produto com esses filtros" }),
      h("p", { text: "Limpe os filtros para ver todo o catálogo do ateliê." }),
      h("button", {
        class: "btn btn--plain", type: "button",
        onclick: () => {
          state.linha = "todas";
          state.modo = "todos";
          state.q = "";
          const search = $("#shop-search");
          if (search) search.value = "";
          syncUrl();
          renderLineChips();
          syncModeButtons();
          renderCatalog();
        },
      }, "Limpar filtros")));
    return;
  }

  const cards = list.map((p) => productCard(p, { headingLevel: "h2" }));
  cards.forEach((c) => grid.append(c));
  revealNew(cards);
}

readUrl();
renderLineChips();
syncModeButtons();

const searchInput = $("#shop-search");
if (searchInput) {
  searchInput.value = state.q;
  searchInput.addEventListener("input", (e) => {
    state.q = e.target.value;
    syncUrl();
    renderCatalog();
  });
}

$$("[data-filter-mode]").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.modo = btn.dataset.filterMode;
    syncUrl();
    syncModeButtons();
    renderCatalog();
  });
});

$("#shop-sort")?.addEventListener("change", (e) => {
  state.ordem = e.target.value;
  renderCatalog();
});

renderCatalog();
window.addEventListener("storage", renderCatalog);
