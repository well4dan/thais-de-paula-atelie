// Interações da Home: destaques da loja e alternância Pronta entrega / Sob demanda.

import { $, $$, clear } from "./dom.js";
import * as store from "./store.js";
import { productCard } from "./ui.js";
import { revealNew } from "./motion.js";

function renderFeatured() {
  const grid = $("#featured-grid");
  if (!grid) return;
  const list = store.products().filter((p) => p.featured).slice(0, 8);
  clear(grid);
  list.forEach((p) => grid.append(productCard(p)));
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
