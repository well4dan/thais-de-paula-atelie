// Chamadas à API da administradora: CSRF automático nas escritas e erro com mensagem pronta para a tela.

import * as store from "../store.js";

export class AdminApiError extends Error {
  constructor(message, { status = 0, code = "API_ERROR", details = {} } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function adminApi(path, { method = "GET", body } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["X-CSRF-Token"] = store.getAdminCsrfToken();
  let res;
  try {
    res = await fetch(path, { method, headers, credentials: "same-origin", body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new AdminApiError("Sem conexão com o servidor. Confira a internet e tente de novo.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) window.dispatchEvent(new Event("tp:admin-expired"));
  if (!res.ok) {
    throw new AdminApiError(data.message || "Não foi possível salvar agora. Tente de novo.", {
      status: res.status, code: data.code, details: data.details || {},
    });
  }
  return data;
}

// O painel com servidor tem sessão (token CSRF); no modo demonstração estático, não
export const hasServer = () => Boolean(store.getAdminCsrfToken());
