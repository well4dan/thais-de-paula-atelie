// Gerador visual de pagamento simulado: QR fictício para Pix e linha digitável fictícia para boleto.

import { h } from "./dom.js";

export function fakePixCode(totalCents) {
  const val = (totalCents / 100).toFixed(2);
  return `00020126580014BR.GOV.BCB.PIX0136thaisdepaulaatelie-demo-pix-0001520400005303986540${val.length}${val}5802BR5921THAIS DE PAULA ATELIE6009LONDRINA62070503***6304DEMO`;
}

export function fakeBoletoLine(totalCents) {
  const padded = String(totalCents).padStart(10, "0");
  return `00190.00009 02611.000002 02611.030004 8 9999${padded}`;
}

export function renderFakeQrSvg() {
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 21 21");
  svg.setAttribute("width", "168");
  svg.setAttribute("height", "168");
  svg.setAttribute("aria-label", "Código QR Pix ilustrativo de demonstração");
  svg.style.background = "#fff";
  svg.style.padding = "10px";
  svg.style.borderRadius = "14px";

  const finder = (ox, oy) => {
    for (let y = 0; y < 7; y += 1) {
      for (let x = 0; x < 7; x += 1) {
        const border = x === 0 || x === 6 || y === 0 || y === 6;
        const inner = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        if (border || inner) {
          const r = document.createElementNS(svgNS, "rect");
          r.setAttribute("x", String(ox + x));
          r.setAttribute("y", String(oy + y));
          r.setAttribute("width", "1");
          r.setAttribute("height", "1");
          r.setAttribute("fill", "#4A2A20");
          svg.append(r);
        }
      }
    }
  };
  finder(0, 0);
  finder(14, 0);
  finder(0, 14);

  for (let y = 0; y < 21; y += 1) {
    for (let x = 0; x < 21; x += 1) {
      const inFinder = (x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12);
      if (inFinder) continue;
      if (((x * 7 + y * 13 + x * y) % 3) === 0) {
        const r = document.createElementNS(svgNS, "rect");
        r.setAttribute("x", String(x));
        r.setAttribute("y", String(y));
        r.setAttribute("width", "1");
        r.setAttribute("height", "1");
        r.setAttribute("fill", "#4A2A20");
        svg.append(r);
      }
    }
  }
  return svg;
}

export function renderBarcode() {
  const wrap = h("div", {
    style: "height:48px;border-radius:8px;background:repeating-linear-gradient(90deg,#4A2A20 0 2px,#fff 2px 5px,#4A2A20 5px 9px,#fff 9px 11px)",
    "aria-hidden": "true",
  });
  return wrap;
}
