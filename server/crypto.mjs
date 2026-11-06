// Criptografia de produção (Camadas 3, 4 e 8):
// - Senhas com scrypt (parâmetros OWASP: N=16384, r=8, p=1, keylen=64) + timingSafeEqual
// - CPF criptografado em repouso com AES-256-GCM + índice cego HMAC-SHA256 para busca de unicidade
// - Tokens de sessão e CSRF com entropia criptográfica (randomBytes)

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const SECRET_FILE = path.join(DATA_DIR, ".secret_key");

function loadMasterKey() {
  const fromEnv = process.env.APP_SECRET_HEX;
  if (fromEnv && /^[0-9a-fA-F]{64}$/.test(fromEnv.trim())) {
    return Buffer.from(fromEnv.trim(), "hex");
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(SECRET_FILE)) {
    const hex = fs.readFileSync(SECRET_FILE, "utf8").trim();
    if (/^[0-9a-fA-F]{64}$/.test(hex)) return Buffer.from(hex, "hex");
  }
  const generated = crypto.randomBytes(32);
  fs.writeFileSync(SECRET_FILE, generated.toString("hex"), { mode: 0o600 });
  return generated;
}

const MASTER_KEY = loadMasterKey();
const ENC_KEY = crypto.createHmac("sha256", MASTER_KEY).update("tp:aes-256-gcm:v1").digest();
const HMAC_KEY = crypto.createHmac("sha256", MASTER_KEY).update("tp:blind-index:v1").digest();

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
const DUMMY_HASH = (() => {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync("dummy-password-for-constant-time", salt, 64, SCRYPT_PARAMS);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
})();

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(password), salt, 64, SCRYPT_PARAMS);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPassword(password, storedHash) {
  const target = storedHash && storedHash.startsWith("scrypt$") ? storedHash : DUMMY_HASH;
  const parts = target.split("$");
  if (parts.length !== 3) return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const actual = crypto.scryptSync(String(password), salt, expected.length, SCRYPT_PARAMS);
  const match = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  return Boolean(storedHash) && match;
}

export function blindIndex(value) {
  return crypto.createHmac("sha256", HMAC_KEY).update(String(value)).digest("hex");
}

export function encryptField(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptField(payload) {
  const [ver, ivHex, tagHex, encHex] = String(payload || "").split(":");
  if (ver !== "v1" || !ivHex || !tagHex || !encHex) throw new Error("Payload criptografado inválido.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", ENC_KEY, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const dec = Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]);
  return dec.toString("utf8");
}

export function maskCpf(digits) {
  const d = String(digits).replace(/\D+/g, "");
  if (d.length !== 11) return "***.***.***-**";
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

export function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

export function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}
