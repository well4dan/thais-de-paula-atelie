// Criação de DOM segura: todo texto entra via textContent, sem injeção de HTML.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const SVG_NS = "http://www.w3.org/2000/svg";

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === false || value === null || value === undefined) continue;
    if (key === "class") el.className = value;
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (key === "text") el.textContent = value;
    else if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function icon(name, cls = "icon") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", cls);
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `/img/icons.svg#i-${name}`);
  svg.append(use);
  return svg;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

export function toast(message, type = "ok") {
  let wrap = $(".toast-wrap");
  if (!wrap) {
    wrap = h("div", { class: "toast-wrap", role: "status", "aria-live": "polite" });
    document.body.append(wrap);
  }
  const node = h("div", { class: `toast${type === "error" ? " toast--error" : ""}` },
    icon(type === "error" ? "warning" : "check-circle"), message);
  wrap.append(node);
  setTimeout(() => node.remove(), 3200);
}

export const params = () => new URLSearchParams(location.search);
