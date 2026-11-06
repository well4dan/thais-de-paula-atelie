// Lógica de Cadastro, Login, Validação de CPF/Senha/Endereço e Duplo Consentimento LGPD (conta.html)

import { $, $$, toast, params } from "./dom.js";
import { maskCpf, maskPhone, maskCep, isValidCpf, isEmail, passwordStrength, onlyDigits } from "./format.js";
import { fetchCurrentUser, loginAccount, registerAccount } from "./auth-client.js";

const nextUrl = () => {
  const n = params().get("next") || "/minha-conta.html";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/minha-conta.html";
};

function switchTab(tab) {
  $$("[data-auth-tab]").forEach((btn) => {
    const active = btn.dataset.authTab === tab;
    btn.setAttribute("aria-selected", String(active));
  });
  const loginPanel = $("#panel-login");
  const regPanel = $("#panel-register");
  if (loginPanel && regPanel) {
    loginPanel.hidden = tab !== "login";
    regPanel.hidden = tab !== "register";
  }
}

function setFieldError(prefix, field, message = "") {
  const errEl = $(`#err-${prefix}-${field}`);
  const inpEl = $(`#${prefix}-${field}`);
  if (errEl) errEl.textContent = message;
  if (inpEl) {
    if (message) inpEl.setAttribute("aria-invalid", "true");
    else inpEl.removeAttribute("aria-invalid");
  }
  return !message;
}

function clearFormErrors(prefix, fields) {
  fields.forEach((f) => setFieldError(prefix, f, ""));
}

function updatePasswordChecklist(pw) {
  const { rules } = passwordStrength(pw);
  for (const [key, ok] of Object.entries(rules)) {
    const li = $(`[data-pw-rule="${key}"]`);
    if (li) li.classList.toggle("is-ok", ok);
  }
}

async function init() {
  const existing = await fetchCurrentUser();
  if (existing) {
    location.href = nextUrl();
    return;
  }

  if (params().get("aba") === "cadastro") {
    switchTab("register");
  }

  $$("[data-auth-tab]").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.authTab));
  });

  // Máscaras em tempo real
  $("#reg-cpf")?.addEventListener("input", (e) => {
    e.target.value = maskCpf(e.target.value);
    setFieldError("reg", "cpf", "");
  });
  $("#reg-phone")?.addEventListener("input", (e) => {
    e.target.value = maskPhone(e.target.value);
    setFieldError("reg", "phone", "");
  });
  $("#reg-cep")?.addEventListener("input", (e) => {
    e.target.value = maskCep(e.target.value);
    setFieldError("reg", "cep", "");
  });
  $("#reg-password")?.addEventListener("input", (e) => {
    updatePasswordChecklist(e.target.value);
    setFieldError("reg", "password", "");
  });

  // Login submit
  const loginForm = $("#login-form");
  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = $("#login-submit");
    clearFormErrors("login", ["email", "password"]);

    const email = $("#login-email").value.trim();
    const password = $("#login-password").value;

    let ok = true;
    if (!isEmail(email)) ok = setFieldError("login", "email", "Informe um e-mail válido.") && ok;
    if (!password) ok = setFieldError("login", "password", "Digite sua senha.") && ok;
    if (!ok) return;

    submitBtn.disabled = true;
    try {
      await loginAccount({ email, password });
      toast("Login realizado com sucesso!");
      location.href = nextUrl();
    } catch (err) {
      setFieldError("login", "password", err.message);
      toast(err.message, "error");
    } finally {
      submitBtn.disabled = false;
    }
  });

  // Registro submit
  const regForm = $("#register-form");
  regForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = $("#reg-submit");
    const allFields = [
      "name", "cpf", "email", "phone", "cep", "street", "number",
      "district", "city", "uf", "password", "password2", "acceptTerms", "acceptLgpd",
    ];
    clearFormErrors("reg", allFields);

    const payload = {
      website: $("#reg-website")?.value || "",
      name: $("#reg-name").value.trim(),
      cpf: $("#reg-cpf").value.trim(),
      email: $("#reg-email").value.trim(),
      phone: $("#reg-phone").value.trim(),
      password: $("#reg-password").value,
      address: {
        cep: $("#reg-cep").value.trim(),
        street: $("#reg-street").value.trim(),
        number: $("#reg-number").value.trim(),
        complement: $("#reg-complement").value.trim(),
        district: $("#reg-district").value.trim(),
        city: $("#reg-city").value.trim(),
        uf: $("#reg-uf").value.trim().toUpperCase(),
      },
      acceptTerms: $("#reg-acceptTerms").checked,
      acceptLgpd: $("#reg-acceptLgpd").checked,
    };

    let ok = true;
    if (payload.name.length < 3 || !payload.name.includes(" ")) {
      ok = setFieldError("reg", "name", "Informe seu nome e sobrenome completos.") && ok;
    }
    if (!isValidCpf(payload.cpf)) {
      ok = setFieldError("reg", "cpf", "CPF inválido. Confira os 11 dígitos.") && ok;
    }
    if (!isEmail(payload.email)) {
      ok = setFieldError("reg", "email", "Informe um e-mail válido.") && ok;
    }
    if (onlyDigits(payload.phone).length < 10) {
      ok = setFieldError("reg", "phone", "Informe um WhatsApp com DDD.") && ok;
    }
    if (onlyDigits(payload.address.cep).length !== 8) {
      ok = setFieldError("reg", "cep", "Informe um CEP com 8 dígitos.") && ok;
    }
    if (payload.address.street.length < 3) {
      ok = setFieldError("reg", "street", "Informe o logradouro (rua ou avenida).") && ok;
    }
    if (!payload.address.number) {
      ok = setFieldError("reg", "number", "Informe o número.") && ok;
    }
    if (payload.address.district.length < 2) {
      ok = setFieldError("reg", "district", "Informe o bairro.") && ok;
    }
    if (payload.address.city.length < 2) {
      ok = setFieldError("reg", "city", "Informe a cidade.") && ok;
    }
    if (payload.address.uf.length !== 2) {
      ok = setFieldError("reg", "uf", "Selecione o estado (UF).") && ok;
    }
    if (!passwordStrength(payload.password).valid) {
      ok = setFieldError("reg", "password", "A senha precisa cumprir os 5 requisitos de segurança.") && ok;
    }
    if ($("#reg-password2").value !== payload.password) {
      ok = setFieldError("reg", "password2", "A confirmação de senha não confere.") && ok;
    }
    if (!payload.acceptTerms) {
      ok = setFieldError("reg", "acceptTerms", "Aceite os Termos de Uso do site para concluir o cadastro.") && ok;
    }
    if (!payload.acceptLgpd) {
      ok = setFieldError("reg", "acceptLgpd", "Aceite o Termo de Consentimento LGPD para concluir o cadastro.") && ok;
    }

    if (!ok) {
      toast("Revise os campos destacados no formulário.", "error");
      return;
    }

    submitBtn.disabled = true;
    try {
      await registerAccount(payload);
      toast("Conta criada com sucesso!");
      location.href = nextUrl();
    } catch (err) {
      if (err.details) {
        for (const [field, msg] of Object.entries(err.details)) {
          setFieldError("reg", field, msg);
        }
      }
      toast(err.message, "error");
    } finally {
      submitBtn.disabled = false;
    }
  });
}

init();
