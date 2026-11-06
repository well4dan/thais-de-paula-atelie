// Serviço de comunicação com a API de Autenticação e LGPD (/api/v1/*)
// Camada 1: nenhuma página chama fetch direto; o token CSRF fica apenas em memória de execução.

let csrfTokenInMemory = "";
let cachedUser = undefined;

async function request(path, { method = "GET", body = undefined } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (csrfTokenInMemory && method !== "GET") {
    headers["X-CSRF-Token"] = csrfTokenInMemory;
  }

  const res = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (data.csrfToken) csrfTokenInMemory = data.csrfToken;

  if (!res.ok) {
    const err = new Error(data.message || "Não foi possível concluir a solicitação.");
    err.status = res.status;
    err.code = data.code || "API_ERROR";
    err.details = data.details || {};
    throw err;
  }
  return data;
}

export async function fetchCurrentUser({ force = false } = {}) {
  if (cachedUser !== undefined && !force) return cachedUser;
  try {
    const data = await request("/api/v1/me");
    cachedUser = data.user || null;
    return cachedUser;
  } catch {
    cachedUser = null;
    return null;
  }
}

export async function registerAccount(payload) {
  const data = await request("/api/v1/auth/register", { method: "POST", body: payload });
  cachedUser = data.user;
  return data;
}

export async function loginAccount({ email, password }) {
  const data = await request("/api/v1/auth/login", { method: "POST", body: { email, password } });
  cachedUser = data.user;
  return data;
}

export async function logoutAccount({ all = false } = {}) {
  await request(`/api/v1/auth/logout${all ? "?all=true" : ""}`, { method: "POST" });
  cachedUser = null;
  csrfTokenInMemory = "";
}

export async function updateMyProfile(payload) {
  const data = await request("/api/v1/me", { method: "PUT", body: payload });
  cachedUser = data.user;
  return data.user;
}

export async function exportMyLgpdData() {
  const data = await request("/api/v1/me/export-lgpd", { method: "POST", body: {} });
  return data.data;
}

export async function deleteMyAccount(password) {
  const data = await request("/api/v1/me", { method: "DELETE", body: { password } });
  cachedUser = null;
  csrfTokenInMemory = "";
  return data;
}
