// Conteúdo do site montado pelo painel: faixas promocionais, banners (topo e meio) e popup.
// O servidor injeta em #site-content só o que está ativo e no período. Sem servidor (demo estática), nada muda.
// Todo texto entra por textContent (h()); links já chegam validados pelo servidor.

import { $, h, icon } from "./dom.js";

const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function readContent() {
  const node = document.getElementById("site-content");
  if (!node) return null;
  try {
    return JSON.parse(node.textContent || "null");
  } catch {
    return null;
  }
}

function safeStorage(kind) {
  try {
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

const isExternal = (url) => /^https:\/\//.test(url) && !url.startsWith(location.origin);

function linkAttrs(url) {
  return isExternal(url) ? { href: url, target: "_blank", rel: "noopener noreferrer" } : { href: url };
}

/* ---------- Rotação acessível (faixas e carrosséis) ---------- */

// Avança sozinho, pausa no hover/foco/aba oculta; com movimento reduzido não gira sozinho
function createRotator({ count, intervalMs, onShow, root }) {
  let index = 0;
  let timer = null;
  let paused = reduceMotion();
  let hovering = false;

  const show = (next) => {
    index = (next + count) % count;
    onShow(index);
  };
  const stop = () => {
    clearInterval(timer);
    timer = null;
  };
  const start = () => {
    stop();
    if (!paused && !hovering && count > 1 && document.visibilityState === "visible") {
      timer = setInterval(() => show(index + 1), intervalMs);
    }
  };

  root.addEventListener("mouseenter", () => { hovering = true; stop(); });
  root.addEventListener("mouseleave", () => { hovering = false; start(); });
  root.addEventListener("focusin", () => { hovering = true; stop(); });
  root.addEventListener("focusout", (e) => {
    if (!root.contains(e.relatedTarget)) {
      hovering = false;
      start();
    }
  });
  document.addEventListener("visibilitychange", start);

  show(0);
  start();
  return {
    next: () => { show(index + 1); start(); },
    prev: () => { show(index - 1); start(); },
    go: (i) => { show(i); start(); },
    togglePause: () => { paused = !paused; start(); return paused; },
    isPaused: () => paused,
  };
}

/* ---------- Faixas promocionais ---------- */

const STRIP_DISMISS_KEY = "tp:promo-strip-off";

function renderAnnouncements(list) {
  if (!list?.length) return;
  const signature = list.map((a) => a.id).join(",");
  if (safeStorage("session")?.getItem(STRIP_DISMISS_KEY) === signature) return;

  const slides = list.map((a, i) => h("p", {
    class: `promo-strip__item promo-strip__item--${a.theme}`,
    "aria-hidden": i === 0 ? "false" : "true",
  },
  h("span", { text: a.text }),
  a.linkUrl ? h("a", { ...linkAttrs(a.linkUrl), class: "promo-strip__link", tabindex: i === 0 ? "0" : "-1" }, a.linkLabel || "Ver mais", icon("arrow-right")) : null));

  const strip = h("div", { class: `promo-strip promo-strip--${list[0].theme}`, role: "region", "aria-label": "Promoções do ateliê" },
    h("div", { class: "promo-strip__track" }, slides));

  if (list.length > 1) {
    const rotator = createRotator({
      count: list.length,
      intervalMs: 5000,
      root: strip,
      onShow: (index) => {
        strip.className = `promo-strip promo-strip--${list[index].theme}`;
        slides.forEach((slide, i) => {
          const active = i === index;
          slide.setAttribute("aria-hidden", String(!active));
          slide.querySelector("a")?.setAttribute("tabindex", active ? "0" : "-1");
        });
      },
    });
    strip.prepend(h("button", { class: "promo-strip__nav", type: "button", "aria-label": "Promoção anterior", onclick: rotator.prev }, icon("arrow-left")));
    strip.append(h("button", { class: "promo-strip__nav", type: "button", "aria-label": "Próxima promoção", onclick: rotator.next }, icon("arrow-right")));
  }

  if (list.every((a) => a.dismissible)) {
    strip.append(h("button", {
      class: "promo-strip__close", type: "button", "aria-label": "Fechar faixa de promoções",
      onclick: () => {
        strip.remove();
        safeStorage("session")?.setItem(STRIP_DISMISS_KEY, signature);
      },
    }, icon("x")));
  }

  const skip = $(".skip-link");
  if (skip) skip.after(strip);
  else document.body.prepend(strip);
}

/* ---------- Banners (topo e meio) ---------- */

function bannerPicture(banner, { eager }) {
  return h("picture", { class: "site-banner__media" },
    banner.imageMobileUrl ? h("source", { media: "(max-width: 640px)", srcset: banner.imageMobileUrl, type: "image/webp" }) : null,
    h("img", {
      src: banner.imageUrl,
      alt: banner.altText,
      width: 1920,
      height: 840,
      loading: eager ? "eager" : "lazy",
      decoding: eager ? "sync" : "async",
      fetchpriority: eager ? "high" : null,
    }));
}

function bannerSlide(banner, { eager, headingTag }) {
  const hasText = banner.title || banner.subtitle || banner.ctaLabel;
  return h("div", { class: `site-banner__slide site-banner__slide--${banner.textTheme}${hasText ? "" : " site-banner__slide--image-only"}` },
    bannerPicture(banner, { eager }),
    hasText ? h("div", { class: "site-banner__copy" },
      banner.title ? h(headingTag, { class: "site-banner__title", text: banner.title }) : null,
      banner.subtitle ? h("p", { class: "site-banner__text", text: banner.subtitle }) : null,
      banner.ctaUrl ? h("a", { ...linkAttrs(banner.ctaUrl), class: "btn site-banner__cta" },
        h("span", { text: banner.ctaLabel }),
        h("span", { class: "btn__dot" }, icon("arrow-right"))) : null) : null);
}

function bannerCarousel(banners, { placement, label }) {
  const slides = banners.map((b, i) => {
    const slide = bannerSlide(b, { eager: placement === "topo" && i === 0, headingTag: "h2" });
    slide.setAttribute("role", "group");
    slide.setAttribute("aria-roledescription", "banner");
    slide.setAttribute("aria-label", `${i + 1} de ${banners.length}`);
    if (i > 0) slide.setAttribute("aria-hidden", "true");
    return slide;
  });
  const root = h("section", {
    class: `site-banner site-banner--${placement}`,
    "aria-roledescription": "carrossel",
    "aria-label": label,
  }, h("div", { class: "site-banner__viewport" }, slides));

  if (banners.length < 2) {
    slides[0]?.classList.add("is-active");
    return root;
  }

  const dots = banners.map((b, i) => h("button", {
    class: "site-banner__dot", type: "button", "aria-label": `Mostrar banner ${i + 1} de ${banners.length}`,
    onclick: () => rotator.go(i),
  }));
  const pauseBtn = h("button", { class: "site-banner__ctrl", type: "button", "aria-label": "Pausar troca automática" }, icon("pause"));

  const rotator = createRotator({
    count: banners.length,
    intervalMs: 6000,
    root,
    onShow: (index) => {
      slides.forEach((slide, i) => {
        const active = i === index;
        slide.classList.toggle("is-active", active);
        slide.setAttribute("aria-hidden", String(!active));
        slide.toggleAttribute("inert", !active);
      });
      dots.forEach((dot, i) => dot.setAttribute("aria-current", String(i === index)));
    },
  });

  const syncPauseButton = () => {
    const paused = rotator.isPaused();
    pauseBtn.setAttribute("aria-label", paused ? "Retomar troca automática" : "Pausar troca automática");
    pauseBtn.replaceChildren(icon(paused ? "play" : "pause"));
  };
  pauseBtn.addEventListener("click", () => {
    rotator.togglePause();
    syncPauseButton();
  });
  syncPauseButton();

  root.append(h("div", { class: "site-banner__controls" },
    h("button", { class: "site-banner__ctrl", type: "button", "aria-label": "Banner anterior", onclick: rotator.prev }, icon("arrow-left")),
    h("div", { class: "site-banner__dots" }, dots),
    h("button", { class: "site-banner__ctrl", type: "button", "aria-label": "Próximo banner", onclick: rotator.next }, icon("arrow-right")),
    pauseBtn));
  return root;
}

function renderHeroBanners(banners) {
  const hero = $(".hero");
  if (!hero || !banners?.length) return;
  hero.classList.add("hero--banner");
  const carousel = bannerCarousel(banners, { placement: "topo", label: "Destaques do ateliê" });
  hero.querySelector(".container")?.append(carousel);
}

function renderMiddleBanners(banners) {
  const anchor = document.getElementById("destaques");
  if (!anchor || !banners?.length) return;
  const wrap = h("div", { class: "section section--banner" },
    h("div", { class: "container" }, bannerCarousel(banners, { placement: "meio", label: "Novidades e promoções" })));
  anchor.before(wrap);
}

/* ---------- Popup ---------- */

const DAY_MS = 24 * 60 * 60 * 1000;

function popupKey(popup) {
  return `tp:popup:${popup.id}:${popup.updatedAt || ""}`;
}

function popupAlreadySeen(popup) {
  const key = popupKey(popup);
  if (popup.popupFrequency === "visita") return safeStorage("session")?.getItem(key) === "1";
  const seenAt = Number(safeStorage("local")?.getItem(key) || 0);
  if (!seenAt) return false;
  return popup.popupFrequency === "uma_vez" || Date.now() - seenAt < DAY_MS;
}

function markPopupSeen(popup) {
  const key = popupKey(popup);
  if (popup.popupFrequency === "visita") safeStorage("session")?.setItem(key, "1");
  else safeStorage("local")?.setItem(key, String(Date.now()));
}

function renderPopup(popup) {
  if (!popup || typeof HTMLDialogElement !== "function" || popupAlreadySeen(popup)) return;

  const titleId = "site-popup-title";
  const dialog = h("dialog", { class: `site-popup site-popup--${popup.textTheme}`, "aria-labelledby": popup.title ? titleId : null, "aria-label": popup.title ? null : popup.altText },
    h("button", { class: "site-popup__close", type: "button", "aria-label": "Fechar", onclick: () => dialog.close() }, icon("x")),
    h("img", { class: "site-popup__img", src: popup.imageMobileUrl || popup.imageUrl, alt: popup.altText, width: 800, height: 800, loading: "lazy", decoding: "async" }),
    popup.title || popup.subtitle || popup.ctaUrl ? h("div", { class: "site-popup__copy" },
      popup.title ? h("h2", { id: titleId, class: "site-popup__title", text: popup.title }) : null,
      popup.subtitle ? h("p", { class: "site-popup__text", text: popup.subtitle }) : null,
      popup.ctaUrl ? h("a", { ...linkAttrs(popup.ctaUrl), class: "btn btn--block site-popup__cta", onclick: () => dialog.close() }, popup.ctaLabel) : null) : null);

  // Clique no fundo (fora do cartão) fecha
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove());

  setTimeout(() => {
    // Não interrompe quem já está com outro painel aberto (carrinho, menu)
    if (document.querySelector("dialog[open]") || document.documentElement.classList.contains("menu-open")) return;
    document.body.append(dialog);
    dialog.showModal();
    markPopupSeen(popup);
  }, Math.max(3, popup.popupDelayS || 4) * 1000);
}

/* ---------- Entrada ---------- */

export function initSiteContent() {
  const content = readContent();
  if (!content) return;
  renderAnnouncements(content.announcements);
  renderHeroBanners(content.banners?.topo);
  renderMiddleBanners(content.banners?.meio);
  renderPopup(content.banners?.popup);
}
