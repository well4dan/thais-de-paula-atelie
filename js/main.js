// Entrada comum a todas as páginas públicas.

import * as store from "./store.js";
import { initCart } from "./cart.js";
import { initMotion } from "./motion.js";

store.init();

function initMenu() {
  const toggle = document.querySelector(".menu-toggle");
  if (!toggle) return;
  const root = document.documentElement;
  const setOpen = (open) => {
    root.classList.toggle("menu-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
    document.querySelector(".mobile-menu")?.toggleAttribute("inert", !open);
  };
  setOpen(false);
  toggle.addEventListener("click", () => setOpen(!root.classList.contains("menu-open")));
  document.querySelectorAll(".mobile-menu a").forEach((a) => a.addEventListener("click", () => setOpen(false)));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });
}

function initDemoBar() {
  const bar = document.querySelector(".demo-bar");
  if (!bar) return;
  if (sessionStorage.getItem("tp:demo-bar") === "off") bar.hidden = true;
  bar.querySelector(".demo-bar__close")?.addEventListener("click", () => {
    bar.hidden = true;
    sessionStorage.setItem("tp:demo-bar", "off");
  });
}

function initYear() {
  document.querySelectorAll("[data-year]").forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });
}

initMenu();
initDemoBar();
initYear();
initCart();
initMotion();
