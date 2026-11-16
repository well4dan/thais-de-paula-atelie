// Biblioteca de imagens públicas do site (banners e fotos de produto).
// - Recebe só WebP já otimizado no navegador da administradora; confere a assinatura e as dimensões pelos bytes
// - Endereço = hash SHA-256 do conteúdo: mesma imagem não duplica e o cache do navegador pode durar 1 ano
// - Cache em memória limitado para não ir ao banco a cada visita

import crypto from "node:crypto";
import { pool, ensureDatabaseReady } from "./pg-pool.mjs";

export const MAX_MEDIA_BYTES = 600 * 1024;
const MAX_DIMENSION = 4096;
const MEMORY_CACHE_BYTES = 48 * 1024 * 1024;
const memoryCache = new Map(); // sha256 -> Buffer (ordem de inserção = LRU simples)
let memoryCacheBytes = 0;

export class MediaValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.code = "INVALID_MEDIA";
  }
}

// Lê largura e altura dos três formatos de WebP (VP8 com perdas, VP8L sem perdas e VP8X estendido)
export function readWebpDimensions(buf) {
  if (buf.length < 30 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  }
  if (chunk === "VP8 ") {
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null;
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    if (buf[20] !== 0x2f) return null;
    const b1 = buf[21];
    const b2 = buf[22];
    const b3 = buf[23];
    const b4 = buf[24];
    return { width: 1 + (b1 | ((b2 & 0x3f) << 8)), height: 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)) };
  }
  return null;
}

export const mediaUrlFor = (sha256) => `/media/${sha256}.webp`;

export async function saveMediaAsset({ base64Data, label = "" }) {
  const clean = String(base64Data || "").replace(/^data:image\/webp;base64,/, "");
  if (!clean || !/^[A-Za-z0-9+/=\s]+$/.test(clean)) throw new MediaValidationError("Imagem inválida.");
  const buf = Buffer.from(clean, "base64");
  if (buf.length === 0 || buf.length > MAX_MEDIA_BYTES) {
    throw new MediaValidationError(`A imagem precisa ter até ${Math.round(MAX_MEDIA_BYTES / 1024)} KB depois de otimizada.`);
  }
  const dims = readWebpDimensions(buf);
  if (!dims || dims.width < 1 || dims.height < 1 || dims.width > MAX_DIMENSION || dims.height > MAX_DIMENSION) {
    throw new MediaValidationError("O arquivo enviado não é uma imagem WebP válida.");
  }
  // A RIFF declara o tamanho do arquivo; divergência indica arquivo truncado ou com dados extras
  if (buf.readUInt32LE(4) + 8 !== buf.length) throw new MediaValidationError("Imagem incompleta ou corrompida.");

  const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
  const safeLabel = String(label || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120);
  await ensureDatabaseReady();
  await pool.query(
    `INSERT INTO public.media_assets (sha256, mime_type, width, height, size_bytes, data, label)
     VALUES ($1, 'image/webp', $2, $3, $4, $5, $6)
     ON CONFLICT (sha256) DO NOTHING`,
    [sha256, dims.width, dims.height, buf.length, buf, safeLabel]
  );
  return { sha256, url: mediaUrlFor(sha256), width: dims.width, height: dims.height, sizeBytes: buf.length };
}

function rememberInMemory(sha256, data) {
  if (data.length > MEMORY_CACHE_BYTES / 4) return;
  memoryCache.set(sha256, data);
  memoryCacheBytes += data.length;
  for (const [key, value] of memoryCache) {
    if (memoryCacheBytes <= MEMORY_CACHE_BYTES) break;
    memoryCache.delete(key);
    memoryCacheBytes -= value.length;
  }
}

async function loadMediaBytes(sha256) {
  const cached = memoryCache.get(sha256);
  if (cached) {
    memoryCache.delete(sha256);
    memoryCache.set(sha256, cached);
    return cached;
  }
  await ensureDatabaseReady();
  const { rows } = await pool.query(
    "SELECT encode(data, 'base64') AS b64 FROM public.media_assets WHERE sha256 = $1",
    [sha256]
  );
  if (!rows[0]) return null;
  const data = Buffer.from(rows[0].b64, "base64");
  rememberInMemory(sha256, data);
  return data;
}

// GET /media/<sha256>.webp
export async function serveMedia(req, res, sha256) {
  const etag = `"${sha256}"`;
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { ETag: etag, "Cache-Control": "public, max-age=31536000, immutable" });
    res.end();
    return;
  }
  const data = await loadMediaBytes(sha256);
  if (!data) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end("Imagem não encontrada");
    return;
  }
  res.writeHead(200, {
    "Content-Type": "image/webp",
    "Content-Length": String(data.length),
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: etag,
  });
  res.end(data);
}

// Lista da biblioteca para o painel, com quantos lugares usam cada imagem
export async function listMediaAssets() {
  await ensureDatabaseReady();
  const { rows } = await pool.query(
    `SELECT m.sha256, m.width, m.height, m.size_bytes, m.label, m.created_at,
            (SELECT COUNT(*) FROM public.products p WHERE p.image = '/media/' || m.sha256 || '.webp')
          + (SELECT COUNT(*) FROM public.site_banners b
             WHERE b.image_url = '/media/' || m.sha256 || '.webp' OR b.image_mobile_url = '/media/' || m.sha256 || '.webp') AS usage_count
     FROM public.media_assets m
     ORDER BY m.created_at DESC
     LIMIT 200`
  );
  return rows.map((r) => ({
    sha256: r.sha256,
    url: mediaUrlFor(r.sha256),
    width: r.width,
    height: r.height,
    sizeBytes: r.size_bytes,
    label: r.label,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    usageCount: Number(r.usage_count),
  }));
}

// Remove só imagem sem uso (produto ou banner apontando para ela bloqueia a exclusão)
export async function deleteUnusedMediaAsset(sha256) {
  await ensureDatabaseReady();
  const url = mediaUrlFor(sha256);
  const { rowCount } = await pool.query(
    `DELETE FROM public.media_assets m
     WHERE m.sha256 = $1
       AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.image = $2)
       AND NOT EXISTS (SELECT 1 FROM public.site_banners b WHERE b.image_url = $2 OR b.image_mobile_url = $2)`,
    [sha256, url]
  );
  if (rowCount) {
    const cached = memoryCache.get(sha256);
    if (cached) {
      memoryCacheBytes -= cached.length;
      memoryCache.delete(sha256);
    }
  }
  return rowCount > 0;
}
