// Lista ordenável do painel: arrastar e soltar com o mouse e, como alternativa acessível,
// botões de subir/descer (teclado e leitor de tela), com aviso falado da nova posição.

import { h, icon } from "../dom.js";

export function sortableList({ items, keyOf, renderItem, onReorder, label }) {
  let order = [...items];
  let dragKey = null;
  const live = h("p", { class: "visually-hidden", "aria-live": "polite" });
  const list = h("ol", { class: "sortable", "aria-label": label });

  const move = (from, to) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    order = next;
    paint();
    live.textContent = `Movido para a posição ${to + 1} de ${order.length}.`;
    onReorder(order);
  };

  function paint() {
    list.replaceChildren(...order.map((item, index) => {
      const key = keyOf(item);
      const row = h("li", { class: "sortable__item", draggable: "true", "data-key": key },
        h("span", { class: "sortable__handle", "aria-hidden": "true", title: "Arraste para reordenar" }, "⋮⋮"),
        h("span", { class: "sortable__pos", text: String(index + 1) }),
        h("div", { class: "sortable__body" }, renderItem(item, index)),
        h("div", { class: "sortable__moves" },
          h("button", { class: "icon-btn icon-btn--sm", type: "button", "aria-label": `Subir item ${index + 1}`, disabled: index === 0, onclick: () => move(index, index - 1) }, icon("caret")),
          h("button", { class: "icon-btn icon-btn--sm sortable__down", type: "button", "aria-label": `Descer item ${index + 1}`, disabled: index === order.length - 1, onclick: () => move(index, index + 1) }, icon("caret"))));

      row.addEventListener("dragstart", (e) => {
        dragKey = key;
        row.classList.add("is-dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", key);
      });
      row.addEventListener("dragend", () => {
        dragKey = null;
        row.classList.remove("is-dragging");
        list.querySelectorAll(".is-over").forEach((el) => el.classList.remove("is-over"));
      });
      row.addEventListener("dragover", (e) => {
        if (!dragKey || dragKey === key) return;
        e.preventDefault();
        row.classList.add("is-over");
      });
      row.addEventListener("dragleave", () => row.classList.remove("is-over"));
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        row.classList.remove("is-over");
        const from = order.findIndex((it) => keyOf(it) === dragKey);
        move(from, index);
      });
      return row;
    }));
  }

  paint();
  return h("div", { class: "sortable-wrap" }, list, live);
}
