// Envio de imagens do painel: converte no navegador para WebP leve (sem perder qualidade visível) e
// sobe para a biblioteca. Inclui o seletor visual usado em banners e produtos.

import { h, icon, clear } from "../dom.js";
import { adminApi, hasServer } from "./api.js";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const TARGET_BYTES = 400 * 1024;

const kb = (bytes) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

function canvasToWebp(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(blob);
  });
}

// Redimensiona para o lado maior `maxSide` e baixa a qualidade aos poucos até caber em ~400 KB
export async function compressToWebp(file, { maxSide = 1920 } = {}) {
  if (!ACCEPTED.includes(file.type)) throw new Error("Use uma imagem JPG, PNG ou WebP.");
  if (file.size > MAX_INPUT_BYTES) throw new Error("A imagem original pode ter até 10 MB.");
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("Não foi possível abrir esta imagem.");
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  let blob = null;
  for (const quality of [0.86, 0.8, 0.72, 0.64, 0.56, 0.48]) {
    blob = await canvasToWebp(canvas, quality);
    if (!blob || blob.type !== "image/webp") throw new Error("Este navegador não consegue gerar WebP. Use o Chrome, Edge ou Firefox atualizados.");
    if (blob.size <= TARGET_BYTES) break;
  }
  return { blob, width, height };
}

export async function uploadImage(file, { maxSide, label = "" } = {}) {
  const { blob, width, height } = await compressToWebp(file, { maxSide });
  const base64Data = await blobToBase64(blob);
  const { asset } = await adminApi("/api/v1/admin/media", { method: "POST", body: { base64Data, label: label || file.name } });
  return { ...asset, width, height, originalBytes: file.size };
}

/**
 * Seletor de imagem: prévia na proporção certa, arrastar e soltar, enviar do computador ou escolher na biblioteca.
 * library: imagens já enviadas [{ url, label, width, height }]; fixed: imagens do projeto (/img/...).
 */
export function imagePicker({ id, label, hint, value, onChange, maxSide = 1920, aspect = "16 / 7", library = [], fixed = [], optional = false }) {
  let current = value || "";
  const status = h("p", { class: "field__hint", id: `${id}-status`, "aria-live": "polite" });
  const preview = h("div", { class: "img-pick__preview", style: `aspect-ratio:${aspect}` });
  const fileInput = h("input", { type: "file", accept: ACCEPTED.join(","), hidden: true, id: `${id}-file` });
  const gallery = h("div", { class: "img-pick__library", hidden: true, role: "listbox", "aria-label": `Escolher ${label.toLowerCase()} da biblioteca` });

  const paint = () => {
    clear(preview);
    if (current) preview.append(h("img", { src: current, alt: "", loading: "lazy" }));
    else preview.append(h("span", { class: "img-pick__empty" }, icon("image"), "Arraste uma imagem aqui"));
  };
  const choose = (url) => {
    current = url;
    paint();
    gallery.hidden = true;
    onChange(url);
  };

  const handleFile = async (file) => {
    if (!file) return;
    if (!hasServer()) {
      status.textContent = "Envio de imagens disponível só com o servidor ativo.";
      return;
    }
    preview.classList.add("is-busy");
    status.textContent = "Otimizando a imagem...";
    try {
      const asset = await uploadImage(file, { maxSide });
      library.unshift(asset);
      status.textContent = `Pronto: ${kb(file.size)} viraram ${kb(asset.sizeBytes)} (${asset.width} x ${asset.height} px).`;
      choose(asset.url);
    } catch (err) {
      status.textContent = err.message;
    } finally {
      preview.classList.remove("is-busy");
    }
  };

  fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));
  preview.addEventListener("dragover", (e) => { e.preventDefault(); preview.classList.add("is-drop"); });
  preview.addEventListener("dragleave", () => preview.classList.remove("is-drop"));
  preview.addEventListener("drop", (e) => {
    e.preventDefault();
    preview.classList.remove("is-drop");
    handleFile(e.dataTransfer.files[0]);
  });

  const openLibrary = () => {
    clear(gallery);
    const options = [...library.map((m) => ({ url: m.url, label: m.label })), ...fixed.map((url) => ({ url, label: url.replace("/img/", "") }))];
    if (!options.length) gallery.append(h("p", { class: "field__hint", text: "Nenhuma imagem na biblioteca ainda." }));
    for (const opt of options) {
      gallery.append(h("button", {
        class: `img-pick__thumb${opt.url === current ? " is-selected" : ""}`, type: "button", role: "option",
        "aria-selected": String(opt.url === current), title: opt.label, onclick: () => choose(opt.url),
      }, h("img", { src: opt.url, alt: opt.label || "Imagem da biblioteca", loading: "lazy" })));
    }
    gallery.hidden = !gallery.hidden;
  };

  paint();
  return h("div", { class: "field full img-pick" },
    h("span", { class: "field__label", id: `${id}-label`, text: label }),
    preview,
    h("div", { class: "img-pick__actions" },
      h("button", { class: "btn btn--sm", type: "button", onclick: () => fileInput.click(), disabled: !hasServer() }, icon("upload"), "Enviar do computador"),
      h("button", { class: "btn btn--sm btn--ghost", type: "button", onclick: openLibrary }, icon("image"), "Escolher da biblioteca"),
      optional && current ? h("button", { class: "btn btn--sm btn--ghost", type: "button", onclick: () => choose("") }, "Remover") : null),
    fileInput,
    gallery,
    hint ? h("p", { class: "field__hint", text: hint }) : null,
    status);
}
