// Entrada comum a todas as páginas públicas.

import * as store from "./store.js";
import { initCart } from "./cart.js";
import { initMotion } from "./motion.js";
import { fetchCurrentUser } from "./auth-client.js";
import { h, icon } from "./dom.js";

store.init();

async function initAuthHeader() {
  const actions = document.querySelector(".header-actions");
  if (!actions || actions.querySelector("[data-account-link]")) return;
  const user = await fetchCurrentUser();
  const href = user ? "/minha-conta.html" : "/conta.html";
  const label = user ? `Minha conta (${user.name.split(" ")[0]})` : "Entrar ou criar conta";
  const link = h(
    "a",
    { class: "icon-btn", href, "data-account-link": "", "aria-label": label, title: label },
    icon("users")
  );
  actions.prepend(link);
}

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
initAuthHeader();
initMotion();
