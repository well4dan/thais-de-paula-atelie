// Empacota apenas os arquivos públicos do site em dist/ para publicação na Vercel.
// Mantém server/, supabase/, scripts/, tests/, docs/ e .env fora da pasta pública estática.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

const PUBLIC_FILES = [
  "index.html",
  "loja.html",
  "produto.html",
  "checkout.html",
  "pedido.html",
  "conta.html",
  "minha-conta.html",
  "termos-de-uso.html",
  "termo-lgpd.html",
  "politica-de-privacidade.html",
  "404.html",
  "favicon.ico",
  "favicon.svg",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "og-image.jpg",
  "robots.txt",
  "sitemap.xml",
  "llms.txt",
  "site.webmanifest",
];

const PUBLIC_DIRS = ["css", "js", "img", "fonts", "painel-tp"];

export function buildPublicDist({ rootDir = ROOT, distDir = DIST } = {}) {
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });

  let copied = 0;

  for (const rel of PUBLIC_FILES) {
    const src = path.join(rootDir, rel);
    if (!fs.existsSync(src)) {
      throw new Error(`Arquivo público obrigatório ausente: ${rel}`);
    }
    fs.copyFileSync(src, path.join(distDir, rel));
    copied += 1;
  }

  for (const dir of PUBLIC_DIRS) {
    const src = path.join(rootDir, dir);
    if (!fs.existsSync(src)) {
      throw new Error(`Diretório público obrigatório ausente: ${dir}`);
    }
    fs.cpSync(src, path.join(distDir, dir), { recursive: true });
    copied += 1;
  }

  return { copied, distDir };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { copied, distDir } = buildPublicDist();
  process.stdout.write(`Build público Vercel concluído: ${copied} itens copiados para ${distDir}\n`);
}
