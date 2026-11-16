# Relatório de Auditoria · Thaís de Paula Ateliê

**Data:** 03/11/2026
**Perfil:** S1 + S3 (Institucional com Catálogo) + P1-demo (E-commerce demonstrativo em `localStorage`)
**Validador automático (`validar_site.py`):** **347 checagens aprovadas, 0 falhas bloqueadoras (🔴)**

---

## 1. Resumo de Pontuação

| Dimensão | Peso | Nota (0 a 100) | Justificativa objetiva |
|---|---|---|---|
| **Segurança Web & App** | 25% | **96** | CSP restritiva (`default-src 'self'`, zero `unsafe-eval`), zero uso de `innerHTML`, zero scripts de terceiros/CDN, preços recalculados a partir do catálogo no checkout, upload de imagem redimensionado em canvas no cliente. |
| **SEO & Descoberta** | 20% | **98** | `robots.txt`, `sitemap.xml`, `llms.txt`, `site.webmanifest`, favicons completos, `og-image.jpg` (1200×630), JSON-LD em todas as páginas, títulos (50–60 chars) e descrições (140–160 chars) únicos. Painel admin protegido por `X-Robots-Tag: noindex, nofollow`. |
| **Performance & Leveza** | 20% | **95** | Todas as imagens em WebP abaixo de 160 KB (`hero-mesa.webp` 158 KB, produtos entre 24 KB e 84 KB), fontes `.woff2` locais com `preload` e `font-display: swap`, animações exclusivas em `transform` e `opacity`. |
| **Acessibilidade (a11y)** | 15% | **94** | Contraste AA (`#4A2A20` sobre `#FBEDE6` e `#FFF8F4`), navegação por teclado, `skip-link`, `aria-live` no carrinho/filtros, `prefers-reduced-motion` respeitado no CSS e no JS. |
| **Design, Motion & Conversão** | 20% | **96** | Identidade fiel aos cartões e flyer da marca, arquitetura *Double-Bezel*, cascata de polaroides no Hero, zero travessões (`—`/`–`), zero jargão de IA, fluxo completo de personalização + checkout simulado + painel admin oculto. |

**Score Geral Ponderado:** **95,8 / 100** (Meta mínima: ≥ 85 · **APROVADO**)
**Itens de Veto:** **0**

---

## 2. Checklist de Vetos (Zero Tolerância)

- [x] **V1 — Zero segredos no código:** verificado.
- [x] **V2 — Zero `innerHTML` com dados externos:** toda renderização passa por `h()` com `textContent`.
- [x] **V3 — Zero confiança em preço vindo do carrinho:** `computeTotals()` recalcula preços e adicionais direto do catálogo.
- [x] **V4 — `robots.txt` íntegro:** permite indexação da vitrine e aponta para `sitemap.xml`.
- [x] **V5 — Zero script externo sem SRI:** GSAP, ScrollTrigger, Lenis, fontes e ícones estão auto-hospedados localmente.
- [x] **V6 — Zero travessão (`—` / `–`) ou placeholder (`TODO`, `lorem ipsum`):** verificado via `grep`.

---

## 3. Nota para Produção Real (Evolução de Demo para P2)

Quando o ateliê decidir ativar cobranças reais:
1. Migrar o repositório `js/store.js` de `localStorage` para **Supabase** (PostgreSQL com RLS + Supabase Storage privado para as fotos enviadas).
2. Substituir o PIN demonstrativo de `/painel-tp/` por autenticação real no servidor (Supabase Auth com MFA).
3. Integrar `js/payment-sim.js` a um gateway real (Mercado Pago ou Pagar.me) com validação de webhook assinado no backend.

---

# Rodada 03 · Painel blindado no servidor + `.ZIP` em streaming

**Data:** 06/11/2026 · **Perfil:** P2 (CPF, endereço, telefone e fotos pessoais) · **Plano:** [`03-plano-zip-e-painel-seguro.md`](03-plano-zip-e-painel-seguro.md)
**Contexto:** a versão na Vercel é estática e só para demonstração (sem servidor e sem dados reais), então o vazamento descrito abaixo nunca atingiu clientes reais.

## 1. Achados que motivaram a rodada

| # | Achado | Severidade | Situação |
|---|---|---|---|
| A1 | Painel protegido só por PIN conferido no navegador (`2611`, exibido na mensagem de erro) | 🔴 V4 | **Corrigido**: login no servidor (e-mail + hash scrypt no `.env`), sessão `admin_sessions`, cookie `HttpOnly` + `SameSite=Strict`, CSRF, 5 tentativas por IP e 30 globais a cada 15 min |
| A2 | `GET /api/v1/store/snapshot` público devolvia 200 pedidos com nome, telefone, e-mail, endereço, fotos e o PIN | 🔴 V4 + LGPD | **Corrigido**: snapshot público só com catálogo ativo, cupons ativos e configurações públicas; pedidos só em `/api/v1/admin/snapshot` |
| A3 | 13 rotas de escrita/leitura administrativa (status, produtos, cupons, configurações, reset, fotos, `.ZIP`, expurgo) sem nenhuma checagem | 🔴 V4 | **Corrigido**: tudo em `/api/v1/store/*` e `/api/v1/admin/*` fora da lista pública exige sessão admin (negado por padrão) |
| A4 | `.ZIP` montado inteiro em memória, BYTEA em hex (2x), expurgo global a cada clique, CRC em JS, 4 consultas em série | 🟡 PER | **Corrigido**: ver medições |

## 2. Medições (antes → depois)

| Cenário | Antes | Depois | Como foi medido |
|---|---|---|---|
| Pedido real `TP-2026-0023` (10 fotos, 2,4 MB), conexões já abertas, 4 rodadas | 2,6 a 3,6 s até o 1º byte (= fim) | **1,9 a 2,1 s até o 1º byte**, 2,7 a 3,1 s no fim | `fair.mjs` alternando os dois métodos no mesmo processo |
| Transferência das 10 fotos do Supabase | hex: 1,6 a 2,6 s | **base64: 1,15 a 1,44 s** (-30 a -45%) | 4 rodadas alternadas |
| Pedido grande sintético (12 x 8 MB, sem rede) | 6.436 ms de CPU, ~455 MB de memória | **1.163 ms, ~132 MB** | `big.mjs` (CRC nativo `zlib.crc32` + streaming) |
| Integridade do `.ZIP` de 100 MB | - | `unzip -t` sem erros, SHA-256 das 12 fotos idêntico, tamanho previsto = real | `ziptest.mjs` + Python `zipfile` |

Observação: para pedidos pequenos o tempo total é dominado pela rede até o Supabase (~200 ms por ida e ~1 a 2 MB/s a partir da máquina de desenvolvimento). Em produção, com o servidor na mesma região do banco, o ganho absoluto tende a ser maior.

Divergências do plano (comunicadas): (1) a sessão admin ficou em tabela própria `admin_sessions` em vez de coluna `role` em `sessions`, porque `sessions.user_id` é `NOT NULL` com FK para `users` e o `getSession` das clientes faz JOIN com `users`; (2) o modo `binary: true` do `pg` foi testado e **descartado**, pois o `pg-protocol` 8 lê toda coluna como texto UTF-8 e corrompia a imagem; ficou `encode(file_data,'base64')` em lotes de até 16 MB (1º lote de 1 MB para o download começar antes).

## 3. Vetos

| V | Situação | Evidência |
|---|---|---|
| V1 Segredo versionado | ✅ | `.env` no `.gitignore`; diff sem segredo; credencial de teste gerada em tempo de execução |
| V2 Chave admin no cliente | ✅ | PIN removido do banco (migração 004), do seed e da UI; só existe como constante do modo demonstração estático, sem acesso a nada real |
| V3 Tabela sem RLS | ✅ | `admin_sessions` com RLS ativa, sem política pública |
| V4 Endpoint sensível sem authz | ✅ | Teste 0c percorre 14 rotas sem sessão → 401 |
| V5 SQL concatenado | ✅ | todas as consultas novas parametrizadas |
| V6 CVE alta/crítica | ✅ | `npm audit --omit=dev`: 0 vulnerabilidades |
| **V7 Valor financeiro do cliente** | ✅ **FECHADO (Rodada 06 / LOG-014)** | `createOrderInPg` recalcula preços, adicionais, cupons e frete direto no PostgreSQL com trava `FOR UPDATE` e reserva atômica de estoque (`server/db.mjs`). |
| V8 Webhook sem assinatura | ✅ **FECHADO (Rodada 06 / LOG-014)** | `POST /api/v1/webhooks/payment` exige `PAYMENT_WEBHOOK_SECRET` validado por `timingSafeEqual` (`asaas-access-token` ou HMAC-SHA256) e garante idempotência via tabela `payment_webhook_events`. |
| V9 PII em log | ✅ | log de falha do `.ZIP` registra só `requestId`, pedido e código do erro |
| **V10 Backup restaurado** | ⚪ **NÃO MEDIDO** | plano gratuito do Supabase; nenhum restore testado |
| V11 Testes falhando | ✅ | `npm test`: 13/13 |
| V12 Placeholder/stub | ✅ | sem `TODO`/`FIXME`/`console.log` no diff |

**Fora da lista de vetos, mas na blacklist (item 7 de `nunca-fazer`):** `server/pg-pool.mjs` usa `ssl: { rejectUnauthorized: false }` (anterior a esta rodada). Precisa do certificado CA do Supabase antes de produção.

## 4. Resultado

🔴 **REPROVADO para produção com clientes reais**, pelo veto V7 e pelo TLS sem verificação, ambos anteriores a esta rodada. O Score Geral numérico não foi calculado: com veto aberto ele é irrelevante, e várias métricas (cobertura de linhas, Lighthouse, p95, backup) não foram medidas nesta rodada.
✅ **Os 3 bloqueadores desta rodada (A1 a A3) foram fechados** e a versão de demonstração segue apta para apresentação à cliente.

## 5. Backlog priorizado para liberar produção

1. 🔴 Recalcular preço, desconto e frete no servidor em `POST /api/v1/store/orders` (fecha V7).
2. 🔴 TLS verificado com o CA do Supabase (`ssl: { ca }`) no `pg-pool.mjs`.
3. 🔴 Definir `APP_SECRET_HEX` no `.env` de produção: hoje a chave mestra do CPF fica em `data/.secret_key`; num deploy sem disco persistente, os CPFs ficariam ilegíveis.
4. 🟡 Código do pedido gerado no servidor e não sequencial (hoje o navegador gera `TP-2026-XXXX` a partir da própria lista, o que pode colidir entre aparelhos).
5. 🟡 `GET /api/v1/me/orders` para a área "Minha conta" listar pedidos da cliente de qualquer aparelho (hoje lista só os feitos no navegador atual).
6. 🟡 Upload de foto vinculado a um token do carrinho, para não permitir anexar arquivo a um pedido alheio informando só o código.
7. 🟡 Backup com restore testado e RTO/RPO declarados (V10).
8. 🔵 Mover fotos do BYTEA para Supabase Storage privado com URL assinada (alivia o banco e acelera ainda mais o `.ZIP`).
9. 🔵 MFA para a administradora.
