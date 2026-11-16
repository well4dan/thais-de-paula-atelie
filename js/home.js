// Interações da Home: destaques da loja e alternância Pronta entrega / Sob demanda.

import { $, $$, clear } from "./dom.js";
import * as store from "./store.js";
import { productCard } from "./ui.js";
import { revealNew } from "./motion.js";

const SHOWCASE_MAX = 12;
const isAvailable = (p) => !(p.mode === "pronta" && p.stock <= 0);

// Vitrine montada no painel (homeOrder); sem vitrine definida (demo estática), usa os destaques
function showcaseProducts() {
  const all = store.products();
  const ordered = all.filter((p) => Number.isInteger(p.homeOrder)).sort((a, b) => a.homeOrder - b.homeOrder);
  const base = ordered.length ? ordered : all.filter((p) => p.featured);
  return base.filter(isAvailable).slice(0, SHOWCASE_MAX);
}

function renderFeatured() {
  const grid = $("#featured-grid");
  if (!grid) return;
  clear(grid);
  showcaseProducts().forEach((p) => grid.append(productCard(p)));
  const allLink = $("[data-all-products]");
  if (allLink) allLink.textContent = `Ver todos os ${store.products().length} produtos`;
}

function initModesToggle() {
  const buttons = $$("[data-mode-tab]");
  const panels = $$("[data-mode-panel]");
  if (!buttons.length) return;
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.modeTab;
      buttons.forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
      panels.forEach((panel) => {
        const show = panel.dataset.modePanel === target;
        panel.hidden = !show;
        if (show) revealNew([panel]);
      });
    });
  });
}

renderFeatured();
initModesToggle();
window.addEventListener("storage", renderFeatured);
