// Autenticação da administradora validada no servidor (Camadas 4 e 8)
// - Credencial única no .env: ADMIN_EMAIL + ADMIN_PASSWORD_HASH (scrypt, gerado por `npm run admin:hash`)
// - Sessão em public.admin_sessions, cookie HttpOnly + SameSite=Strict separado do cookie das clientes
// - Escritas exigem X-CSRF-Token

import { pool, ensureDatabaseReady } from "./pg-pool.mjs";
import { verifyPassword, generateToken, sha256Hex, blindIndex } from "./crypto.mjs";
import { safeEqualStrings } from "./http-utils.mjs";

export const ADMIN_COOKIE_NAME = "tp_admin";
const ADMIN_SESSION_TTL_SEC = 8 * 60 * 60;

export function isAdminLoginConfigured() {
  const hash = process.env.ADMIN_PASSWORD_HASH || "";
  return Boolean(process.env.ADMIN_EMAIL) && hash.startsWith("scrypt$");
}

export function verifyAdminCredentials(email, password) {
  const configuredEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const typedEmail = String(email || "").trim().toLowerCase();
  // verifyPassword roda o scrypt sempre, mesmo com e-mail errado, para não revelar qual campo falhou pelo tempo
  const passwordOk = verifyPassword(String(password || ""), process.env.ADMIN_PASSWORD_HASH || "");
  const emailOk = safeEqualStrings(typedEmail, configuredEmail);
  return passwordOk && emailOk;
}

export function formatAdminCookie(token, maxAgeSec = ADMIN_SESSION_TTL_SEC) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAgeSec}${secure}`;
}

export function clearAdminCookie() {
  return `${ADMIN_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`;
}

export async function createAdminSession({ ip, userAgent }) {
  await ensureDatabaseReady();
  const rawToken = generateToken(32);
  const csrfToken = generateToken(24);
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_SEC * 1000);
  await pool.query(
    `INSERT INTO public.admin_sessions (token_hash, csrf_token, ip_hash, user_agent, created_at, expires_at)
     VALUES ($1, $2, $3, $4, NOW(), $5)`,
    [sha256Hex(rawToken), csrfToken, blindIndex(ip || "0.0.0.0"), String(userAgent || "unknown").slice(0, 250), expiresAt.toISOString()]
  );
  return { rawToken, csrfToken, expiresAt: expiresAt.toISOString() };
}

export async function getAdminSession(rawToken) {
  if (!rawToken || typeof rawToken !== "string" || rawToken.length < 32) return null;
  await ensureDatabaseReady();
  const { rows } = await pool.query(
    `SELECT csrf_token, expires_at FROM public.admin_sessions
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
    [sha256Hex(rawToken)]
  );
  const row = rows[0];
  if (!row) return null;
  return { csrfToken: row.csrf_token, expiresAt: row.expires_at, email: process.env.ADMIN_EMAIL };
}

export async function revokeAdminSession(rawToken) {
  if (!rawToken) return;
  await ensureDatabaseReady();
  await pool.query("UPDATE public.admin_sessions SET revoked_at = NOW() WHERE token_hash = $1", [sha256Hex(rawToken)]);
}

export function verifyAdminCsrf(req, session) {
  const headerToken = req.headers["x-csrf-token"];
  if (typeof headerToken !== "string" || !session?.csrfToken) return false;
  return safeEqualStrings(headerToken, session.csrfToken);
}
