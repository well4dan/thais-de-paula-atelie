// Configura o acesso ao painel: pede e-mail e senha da administradora e grava ADMIN_EMAIL e
// ADMIN_PASSWORD_HASH (scrypt) direto no .env. A senha é digitada sem aparecer e nunca é salva em texto.
// Uso: npm run admin:hash

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { hashPassword } from "../server/crypto.mjs";

const MIN_LENGTH = 12;
const ENV_PATH = path.resolve(process.cwd(), ".env");

// Uma única interface de leitura para todas as perguntas (abrir várias perde o que já foi digitado)
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
const pendingLines = [];
const waitingResolvers = [];
let hideTyping = false;
let currentQuestion = "";

rl.on("line", (line) => {
  if (hideTyping && process.stdin.isTTY) rl.output.write("\n");
  const resolve = waitingResolvers.shift();
  if (resolve) resolve(line.trim());
  else pendingLines.push(line.trim());
});
const writeOutput = rl._writeToOutput.bind(rl);
rl._writeToOutput = (text) => {
  if (!hideTyping || text.includes(currentQuestion)) writeOutput(text);
};

function ask(question, { hidden = false } = {}) {
  hideTyping = hidden;
  currentQuestion = question;
  rl.setPrompt(question);
  rl.prompt();
  if (pendingLines.length) return Promise.resolve(pendingLines.shift());
  return new Promise((resolve) => waitingResolvers.push(resolve));
}

function passwordProblem(password) {
  if (password.length < MIN_LENGTH) return `ela tem ${password.length} caracteres e precisa de pelo menos ${MIN_LENGTH}`;
  if (!/[a-zA-Z]/.test(password)) return "falta pelo menos uma letra";
  if (!/\d/.test(password)) return "falta pelo menos um número";
  return "";
}

function writeEnvValues(values) {
  const lines = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/) : [];
  const kept = lines.filter((line) => !Object.keys(values).some((key) => line.startsWith(`${key}=`)));
  while (kept.length && kept[kept.length - 1] === "") kept.pop();
  const added = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  fs.writeFileSync(ENV_PATH, `${[...kept, ...added].join("\n")}\n`, { mode: 0o600 });
}

process.stdout.write(`Configuração do acesso ao painel /painel-tp/\nA senha precisa de pelo menos ${MIN_LENGTH} caracteres, com letras e números (ex.: Atelie2026Thais).\n\n`);

const email = (await ask("E-mail da administradora: ")).toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  process.stderr.write("E-mail inválido. Nada foi alterado.\n");
  rl.close();
  process.exit(1);
}

let password = "";
for (let attempt = 1; attempt <= 3 && !password; attempt += 1) {
  const typed = await ask("Nova senha (não aparece enquanto digita): ", { hidden: true });
  const problem = passwordProblem(typed);
  if (problem) {
    process.stderr.write(`Senha recusada: ${problem}. Tente de novo.\n`);
    continue;
  }
  if ((await ask("Repita a senha: ", { hidden: true })) !== typed) {
    process.stderr.write("As senhas não conferem. Tente de novo.\n");
    continue;
  }
  password = typed;
}

rl.close();
if (!password) {
  process.stderr.write("Não foi possível definir a senha. Nada foi alterado.\n");
  process.exit(1);
}

writeEnvValues({ ADMIN_EMAIL: email, ADMIN_PASSWORD_HASH: hashPassword(password) });
process.stdout.write(`\nPronto! Acesso salvo no .env para ${email}.\nReinicie o servidor (npm start) e entre em /painel-tp/ com esse e-mail e senha.\n`);
