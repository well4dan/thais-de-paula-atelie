// Página do produto: personalização, prévia ao vivo, redimensionamento seguro de foto e adição ao carrinho.

import { $, h, icon, clear, toast, params } from "./dom.js";
import { money, businessDaysFromNow, date, waLink } from "./format.js";
import * as store from "./store.js";
import { modeTag, availability, productCard, selectionsSummary } from "./ui.js";
import { open as openCart } from "./cart.js";

const slug = params().get("p") || "caderno-floral-personalizado";
const product = store.productBySlug(slug) || store.products()[0];

const selections = {};
let photoData = null;
let uploadedAttachments = [];
let qty = 1;

function readOriginalFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("Selecione um arquivo de imagem (JPG, PNG ou WebP)."));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error("Cada imagem deve ter no máximo 8 MB."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo de imagem."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function resizeImageFile(file, maxSide = 360) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("Selecione um arquivo de imagem (JPG, PNG ou WebP)."));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error("A imagem deve ter no máximo 8 MB."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Arquivo de imagem inválido."));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSide || height > maxSide) {
          if (width > height) {
            height = Math.round((height * maxSide) / width);
            width = maxSide;
          } else {
            width = Math.round((width * maxSide) / height);
            height = maxSide;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function updatePriceAndPreview() {
  const unit = store.unitPrice(product, selections);
  const priceEl = $("#prod-price");
  if (priceEl) priceEl.textContent = money(unit * qty);

  const badge = $("#prod-preview-badge");
  const mainImg = $("#prod-main-img");
  if (mainImg && photoData) mainImg.src = photoData;
  else if (mainImg) mainImg.src = product.image;

  if (badge) {
    const sum = selectionsSummary(product, selections);
    if (sum || photoData) {
      badge.hidden = false;
      badge.textContent = `Personalização: ${[sum, photoData ? "Foto anexada" : ""].filter(Boolean).join(" | ")}`;
    } else {
      badge.hidden = true;
    }
  }
}

function buildOptionField(opt) {
  const errEl = h("span", { class: "field__error", id: `err-${opt.id}` });

  if (opt.type === "select") {
    selections[opt.id] = opt.choices[0].label;
    const select = h("select", {
      class: "select", id: `opt-${opt.id}`,
      onchange: (e) => { selections[opt.id] = e.target.value; updatePriceAndPreview(); },
    }, opt.choices.map((c) => h("option", {
      value: c.label,
      text: c.delta > 0 ? `${c.label} (+ ${money(c.delta)})` : c.label,
    })));
    return h("div", { class: "field" },
      h("label", { for: `opt-${opt.id}`, text: opt.label }),
      select, errEl);
  }

  if (opt.type === "text") {
    selections[opt.id] = "";
    const input = h("input", {
      class: "input", id: `opt-${opt.id}`, type: "text",
      maxLength: opt.maxLength || 30,
      required: Boolean(opt.required),
      placeholder: opt.required ? "Digite como deve ser impresso" : "Opcional",
      oninput: (e) => {
        selections[opt.id] = e.target.value;
        errEl.textContent = "";
        e.target.removeAttribute("aria-invalid");
        updatePriceAndPreview();
      },
    });
    return h("div", { class: "field" },
      h("label", { for: `opt-${opt.id}`, text: `${opt.label}${opt.required ? " *" : ""}` }),
      input,
      h("span", { class: "field__hint", text: `Até ${opt.maxLength || 30} caracteres` }),
      errEl);
  }

  if (opt.type === "textarea") {
    selections[opt.id] = "";
    const area = h("textarea", {
      class: "textarea", id: `opt-${opt.id}`,
      maxLength: opt.maxLength || 240,
      placeholder: "Algum detalhe de cor, posição ou preferência?",
      oninput: (e) => { selections[opt.id] = e.target.value; updatePriceAndPreview(); },
    });
    return h("div", { class: "field" },
      h("label", { for: `opt-${opt.id}`, text: opt.label }),
      area, errEl);
  }

  if (opt.type === "photo") {
    const thumb = h("img", { class: "photo-drop__thumb", src: product.image, alt: "Prévia da foto", width: 64, height: 64 });
    const status = h("span", {
      class: "field__hint",
      text: "JPG, PNG ou WebP até 8 MB (você pode selecionar 1 ou mais imagens). Os arquivos originais ficam disponíveis para produção da arte e são apagados automaticamente após 7 dias.",
    });
    const filesListEl = h("div", { style: "display:grid;gap:0.25rem;font-size:0.82rem;color:var(--ink-soft)" });
    const fileInput = h("input", {
      type: "file",
      id: `opt-${opt.id}`,
      accept: "image/jpeg,image/png,image/webp",
      multiple: true,
      onchange: async (e) => {
        const files = Array.from(e.target.files || []).slice(0, 12);
        if (!files.length) return;
        status.textContent = `Enviando ${files.length} arquivo(s) em qualidade original...`;
        clear(filesListEl);
        try {
          photoData = await resizeImageFile(files[0], 360);
          thumb.src = photoData;
          const newAttachments = [];
          for (const f of files) {
            const rawBase64 = await readOriginalFileAsBase64(f);
            try {
              const res = await fetch("/api/v1/store/attachments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  productId: product.id,
                  fileName: f.name,
                  mimeType: f.type || "image/jpeg",
                  base64Data: rawBase64,
                }),
              });
              if (res.ok) {
                const data = await res.json();
                if (data.attachment) newAttachments.push(data.attachment);
              }
            } catch {
              // Mantém preview local caso offline
            }
            filesListEl.append(
              h("span", {
                text: `✓ ${f.name} (${Math.max(1, Math.round(f.size / 1024))} KB) — retido por 7 dias para produção`,
              })
            );
          }
          uploadedAttachments = newAttachments;
          status.textContent = `${files.length} imagem(ns) original(is) anexada(s) com sucesso!`;
          errEl.textContent = "";
          updatePriceAndPreview();
        } catch (err) {
          toast(err.message, "error");
          status.textContent = "Erro ao anexar imagem. Tente novamente.";
        }
      },
    });
    return h("div", { class: "field" },
      h("label", { for: `opt-${opt.id}`, text: `${opt.label}${opt.required ? " *" : ""}` }),
      h("div", { class: "photo-drop" }, thumb, h("div", { style: "display:grid;gap:0.35rem" }, fileInput, status, filesListEl)),
      errEl);
  }

  return null;
}

function validateOptions() {
  let ok = true;
  for (const opt of product.options || []) {
    const errEl = $(`#err-${opt.id}`);
    const input = $(`#opt-${opt.id}`);
    if (opt.required && opt.type === "text" && !String(selections[opt.id] || "").trim()) {
      if (errEl) errEl.textContent = "Preencha este campo para personalizar.";
      input?.setAttribute("aria-invalid", "true");
      ok = false;
    }
    if (opt.required && opt.type === "photo" && !photoData) {
      if (errEl) errEl.textContent = "Envie uma foto para personalizar esta peça.";
      ok = false;
    }
  }
  return ok;
}

function renderProduct() {
  document.title = `${product.name} | Thaís de Paula Ateliê`;
  const root = clear($("#product-root"));
  const line = store.lineBySlug(product.line);
  const cfg = store.settings();
  const estDays = product.mode === "demanda" ? product.leadDays : cfg.readyShipDays;
  const estDate = date(businessDaysFromNow(estDays).toISOString());

  $("#crumb-line").textContent = line ? line.name : "Loja";
  $("#crumb-line").href = line ? `/loja.html?linha=${line.slug}` : "/loja.html";
  $("#crumb-prod").textContent = product.name;

  const qtyOut = h("output", { "aria-live": "polite", text: "1" });
  const setQty = (n) => {
    const max = product.mode === "pronta" ? Math.max(1, product.stock) : 50;
    qty = Math.max(1, Math.min(max, n));
    qtyOut.textContent = String(qty);
    updatePriceAndPreview();
  };

  const formEl = h("form", {
    class: "product-form", novalidate: true,
    onsubmit: (e) => {
      e.preventDefault();
      if (!validateOptions()) return;
      try {
        store.addToCart({
          productId: product.id,
          qty,
          selections: { ...selections },
          photo: photoData,
          attachments: [...uploadedAttachments],
        });
        toast(`${product.name} adicionado ao carrinho!`);
        openCart();
      } catch (err) {
        toast(err.message, "error");
      }
    },
  });

  if (product.options.length) {
    formEl.append(h("h2", { style: "font-size:1.45rem", text: "Personalize a sua peça" }));
    product.options.forEach((o) => {
      const f = buildOptionField(o);
      if (f) formEl.append(f);
    });
  } else {
    formEl.append(h("p", { class: "muted", text: "Peça pronta no ateliê: não precisa preencher personalização." }));
  }

  const soldOut = product.mode === "pronta" && product.stock <= 0;

  formEl.append(
    h("div", { style: "display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:1rem;padding-top:0.5rem" },
      h("div", { class: "qty" },
        h("button", { type: "button", "aria-label": "Diminuir quantidade", onclick: () => setQty(qty - 1) }, icon("minus")),
        qtyOut,
        h("button", { type: "button", "aria-label": "Aumentar quantidade", onclick: () => setQty(qty + 1) }, icon("plus"))),
      h("button", { class: "btn", type: "submit", disabled: soldOut, style: "flex:1" },
        h("span", { text: soldOut ? "Esgotado" : "Adicionar ao carrinho" }),
        h("span", { class: "btn__dot" }, icon("bag")))),
    h("a", {
      class: "btn btn--ghost btn--plain btn--block",
      href: waLink(cfg.whatsapp, `Olá! Tenho uma dúvida sobre o produto "${product.name}".`),
      target: "_blank", rel: "noopener noreferrer",
    }, "Tirar dúvida desta peça no WhatsApp"));

  root.append(
    h("div", { class: "bezel product-gallery" },
      h("div", { class: "bezel__core product-gallery__stage" },
        h("img", { id: "prod-main-img", src: product.image, alt: product.name, width: 800, height: 800 }),
        h("div", { class: "product-preview-badge", id: "prod-preview-badge", hidden: true }))),
    h("div", {},
      h("div", { style: "display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap" },
        modeTag(product),
        h("span", { class: "tag" }, icon("clock"), availability(product))),
      h("h1", { class: "section-title", style: "margin-top:0.75rem", text: product.name }),
      h("p", { class: "price", id: "prod-price", style: "font-size:2rem;margin-top:0.6rem", text: money(product.price) }),
      h("p", { class: "section-lead", style: "margin-top:0.75rem", text: product.description }),
      h("p", { class: "field__hint", style: "margin-top:0.6rem", text: `Previsão de ficar pronto ou sair do ateliê: até ${estDate}.` }),
      formEl));

  updatePriceAndPreview();

  const relGrid = clear($("#related-grid"));
  const related = store.products().filter((p) => p.id !== product.id && (p.line === product.line || p.featured)).slice(0, 4);
  related.forEach((p) => relGrid.append(productCard(p)));
}

renderProduct();
