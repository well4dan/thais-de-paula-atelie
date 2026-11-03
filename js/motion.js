// Motion: Lenis para scroll suave, GSAP + ScrollTrigger para revelações.
// Só transform e opacity. Com prefers-reduced-motion, nada anima.

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const canHover = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;

function initLenis(gsap, ScrollTrigger) {
  if (typeof window.Lenis !== "function") return null;
  const lenis = new window.Lenis({ duration: 1.1, smoothWheel: true });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const target = document.querySelector(a.getAttribute("href"));
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: -100 });
    });
  });
  return lenis;
}

function reveals(gsap) {
  document.querySelectorAll("[data-reveal]").forEach((el) => {
    if (el.closest("[data-reveal-group]")) return;
    gsap.fromTo(el, { y: 40, opacity: 0 }, {
      y: 0, opacity: 1, duration: 1, ease: "expo.out",
      scrollTrigger: { trigger: el, start: "top 88%", once: true },
    });
  });
  document.querySelectorAll("[data-reveal-group]").forEach((group) => {
    const items = group.querySelectorAll("[data-reveal]");
    gsap.fromTo(items, { y: 48, opacity: 0 }, {
      y: 0, opacity: 1, duration: 1, ease: "expo.out", stagger: 0.08,
      scrollTrigger: { trigger: group, start: "top 85%", once: true },
    });
  });
}

function hero(gsap) {
  const stack = document.querySelector("[data-hero-stack]");
  if (!stack) return;
  const cards = stack.querySelectorAll(".polaroid");
  gsap.fromTo(cards, { y: 80, opacity: 0, rotate: 0 }, {
    y: 0, opacity: 1, rotate: (i, el) => Number(el.dataset.rotate || 0),
    duration: 1.3, ease: "expo.out", stagger: 0.14, delay: 0.15,
  });
  if (!canHover()) return;
  const qx = Array.from(cards).map((c) => gsap.quickTo(c, "x", { duration: 0.9, ease: "power3.out" }));
  const qy = Array.from(cards).map((c) => gsap.quickTo(c, "y", { duration: 0.9, ease: "power3.out" }));
  stack.addEventListener("pointermove", (e) => {
    const r = stack.getBoundingClientRect();
    const dx = (e.clientX - r.left) / r.width - 0.5;
    const dy = (e.clientY - r.top) / r.height - 0.5;
    cards.forEach((_, i) => {
      const depth = (i + 1) * 9;
      qx[i](dx * depth);
      qy[i](dy * depth);
    });
  });
  stack.addEventListener("pointerleave", () => cards.forEach((_, i) => { qx[i](0); qy[i](0); }));
}

function steps(gsap, ScrollTrigger) {
  const wrap = document.querySelector("[data-steps]");
  if (!wrap) return;
  const mm = gsap.matchMedia();
  mm.add("(min-width: 1024px)", () => {
    const items = wrap.querySelectorAll(".step");
    items.forEach((item) => {
      ScrollTrigger.create({
        trigger: item, start: "top 60%", end: "bottom 40%",
        onToggle: (self) => item.classList.toggle("is-active", self.isActive),
      });
    });
    const bar = wrap.querySelector(".steps__progress span");
    if (bar) {
      gsap.fromTo(bar, { scaleY: 0 }, { scaleY: 1, ease: "none", scrollTrigger: { trigger: wrap, start: "top 60%", end: "bottom 60%", scrub: true } });
    }
  });
}

function marquee(gsap) {
  document.querySelectorAll("[data-marquee]").forEach((track) => {
    gsap.to(track, { xPercent: -50, duration: 28, ease: "none", repeat: -1 });
  });
}

function tilt() {
  if (!canHover()) return;
  document.addEventListener("pointermove", (e) => {
    const card = e.target.closest?.("[data-tilt]");
    document.querySelectorAll("[data-tilt].is-tilting").forEach((c) => {
      if (c !== card) {
        c.classList.remove("is-tilting");
        c.style.transform = "";
      }
    });
    if (!card) return;
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    card.classList.add("is-tilting");
    card.style.transform = `perspective(900px) rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg) translateY(-4px)`;
  }, { passive: true });
}

export function initMotion() {
  window.__tpMotion = true;
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  if (reduceMotion() || !gsap || !ScrollTrigger) {
    document.documentElement.classList.remove("js-anim");
    return;
  }
  gsap.registerPlugin(ScrollTrigger);
  initLenis(gsap, ScrollTrigger);
  hero(gsap);
  reveals(gsap);
  steps(gsap, ScrollTrigger);
  marquee(gsap);
  tilt();
  window.addEventListener("load", () => ScrollTrigger.refresh());
}

export function revealNew(nodes) {
  const gsap = window.gsap;
  if (!gsap || reduceMotion()) return;
  gsap.fromTo(nodes, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: "expo.out", stagger: 0.04 });
}
