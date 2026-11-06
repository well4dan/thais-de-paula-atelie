# Plano de Implementação - Thaís de Paula Ateliê (Rodada 04)

**Perfil:** P2 (e-mail, nome e endereço de clientes) · **Data:** 2026-11-06 · **Versão do plano:** 1

## 1. Resumo executivo
A cada etapa do pedido, a cliente recebe um e-mail automático: pedido recebido, pagamento confirmado, em produção e pronto (retirada) ou enviado (com código de rastreio dos Correios). O envio é feito pelo servidor via Resend, com fila no banco para nunca mandar e-mail duplicado e tentar de novo se o serviço falhar. Como o ateliê ainda não tem domínio, tudo roda em **modo teste** (os e-mails vão só para o seu endereço) até o domínio existir. Sucesso medido por: cada etapa gera exatamente 1 e-mail, falha do Resend não trava o painel, e o código de rastreio aparece no e-mail e na página do pedido.

## 2. Regras de negócio (testáveis)
| # | Regra |
|---|---|
| R1 | Pedido criado → e-mail "Recebemos seu pedido" (com resumo e link de acompanhamento). Se o pedido já nasce pago (Pix simulado aprovado), o mesmo e-mail informa o pagamento e o e-mail "Pagamento confirmado" não é repetido. |
| R2 | Status `pago` → "Pagamento confirmado". |
| R3 | Status `producao` → "Seu pedido está em produção". |
| R4 | Status `pronto` em pedido de **retirada** → "Pronto para retirada" (com WhatsApp para combinar). |
| R5 | Status `enviado` em pedido de **envio** → "Pedido enviado" com o código de rastreio e o link dos Correios. O painel **exige** o código antes de salvar essa etapa. |
| R6 | Cada tipo de e-mail é enviado **no máximo 1 vez por pedido**, mesmo que a etapa seja desfeita e refeita. |
| R7 | Falha do Resend nunca impede salvar a etapa; o envio é tentado de novo (1, 5, 30 min, 2 h e 6 h) e depois marcado como falho. |
| R8 | Sem `RESEND_API_KEY` ou com `EMAIL_MODE=off`, nada é enviado e o site funciona normal. Em `EMAIL_MODE=test`, todo e-mail vai para `EMAIL_TEST_TO` com assunto `[TESTE]`. |
| R9 | `cancelado`, `concluido`, `pronto` em pedido de envio e `enviado` em pedido de retirada não geram e-mail. |

## 3. Escopo
**Nesta rodada:** fila de e-mails, envio via Resend, 5 modelos de e-mail (HTML + texto), campo de código de rastreio no painel, código e link na página do pedido, status dos e-mails visível no detalhe do pedido no painel, modo teste, testes e documentação.

**Fora desta rodada:** configurar o domínio (depende de comprar o domínio; deixo o passo a passo de DNS no dossiê), e-mail de cancelamento, e-mail para a Thaís a cada pedido novo, rastreio automático pela API dos Correios.

## 4. Decisões arquiteturais
| # | Decisão | Alternativa descartada | Motivo | Custo de reverter |
|---|---|---|---|---|
| 1 | Resend via `fetch` na API HTTP, sem SDK | SDK `resend` / nodemailer | Mantém o projeto com 1 dependência (`pg`); API é um POST simples | Baixo |
| 2 | Fila `email_outbox` no Postgres com `UNIQUE(order_id, kind)` | Enviar direto na rota | Garante R6 (sem duplicado) e R7 (retry), e a rota do painel responde na hora | Baixo |
| 3 | A fila guarda só **pedido + tipo**, não o e-mail pronto | Guardar HTML/destinatário | Menos dado pessoal parado no banco (LGPD); o e-mail é montado na hora do envio | Baixo |
| 4 | Enfileirar no servidor, na mesma transação que grava o pedido/status | Frontend pedir o e-mail | O navegador não decide o que é enviado | Baixo |
| 5 | Worker no próprio `server.mjs` (a cada 30 s + disparo imediato), com `FOR UPDATE SKIP LOCKED` | Serviço separado | Simples para o porte; seguro mesmo com 2 processos | Médio |
| 6 | `Reply-To` = e-mail do ateliê | Remetente sem resposta | A cliente responde direto para a Thaís | Baixo |

## 5. Modelo de dados (migração `006_email_outbox.sql`, não destrutiva; renumerada porque a rodada 05 do painel vem antes)
- `public.orders.tracking_code TEXT NULL` com `CHECK (tracking_code ~ '^[A-Z]{2}[0-9]{9}[A-Z]{2}$')` (padrão dos Correios, ex.: `AB123456789BR`).
- `public.email_outbox`: `id UUID PK`, `order_id TEXT FK → orders ON DELETE CASCADE`, `kind TEXT CHECK IN ('recebido','pago','producao','pronto_retirada','enviado')`, `status TEXT CHECK IN ('pendente','enviado','falhou','ignorado')`, `attempts INT`, `next_attempt_at`, `sent_at`, `provider_message_id`, `last_error TEXT` (só código/HTTP, sem dados pessoais), `created_at`, `UNIQUE(order_id, kind)`, índice parcial em `next_attempt_at WHERE status='pendente'`. RLS ativa, sem política pública.

## 6. Contratos de API
| Rota | Método | Auth | Mudança |
|---|---|---|---|
| `/api/v1/store/orders/status` | PATCH | admin + CSRF | aceita `trackingCode`; valida formato; exige código para `enviado` em pedido de envio (400 caso falte); enfileira o e-mail da etapa |
| `/api/v1/store/orders` | POST | público | enfileira "recebido" |
| `/api/v1/admin/snapshot` | GET | admin | inclui `trackingCode` e `emails: [{kind, status, sentAt}]` por pedido |
| `/api/v1/store/orders/:id/track` | GET | público + telefone | inclui `trackingCode` |
| `/api/v1/me/orders` | GET | cliente | inclui `trackingCode` |

## 7. Variáveis de ambiente novas (`.env`, nunca no repositório)
`RESEND_API_KEY`, `EMAIL_MODE` (`off` / `test` / `live`), `EMAIL_FROM` (no teste: `Thaís de Paula Ateliê <onboarding@resend.dev>`), `EMAIL_REPLY_TO`, `EMAIL_TEST_TO`, `PUBLIC_SITE_URL` (para o link do pedido no e-mail).

## 8. Etapas
| # | Objetivo | Arquivos | Critério de pronto | Risco | Esforço |
|---|---|---|---|---|---|
| 1 | Migração 006 + enfileiramento em criar pedido e mudar status, com validação do código de rastreio | `supabase/migrations/006_*.sql`, `server/pg-pool.mjs`, `server/db.mjs`, `server/admin-routes.mjs` | fila recebe 1 linha por etapa, sem duplicar | 🟡 | M |
| 2 | Modelos de e-mail (HTML com a identidade do ateliê + texto puro, tudo escapado) | `server/email-templates.mjs` (novo) | 5 modelos, sem travessões, sem HTML injetável | 🟢 | M |
| 3 | Worker de envio via Resend com retry, timeout de 10 s e modos off/test/live | `server/email-worker.mjs` (novo), `server.mjs`, `.env.example` | e-mail de teste chega no seu endereço | 🟡 | M |
| 4 | Painel: pedir o código ao marcar "Enviado", mostrar status dos e-mails no pedido; página do pedido mostra código + link Correios | `js/admin/app.js`, `js/store.js`, `js/order.js` | fluxo testado no navegador | 🟢 | M |
| 5 | Testes (fila, idempotência, regras R1 a R9, escape, retry com transporte falso) + dossiê + handover (LOG-012) | `tests/`, `docs/`, `CLAUDE_HANDOVER_LOG.md` | `npm test` verde | 🟢 | P |

## 9. Riscos
| Risco | Mitigação |
|---|---|
| Sem domínio, o Resend só entrega para o e-mail dono da conta | Modo teste até o domínio existir; passo a passo de DNS no dossiê |
| E-mail cair no spam | Domínio com SPF + DKIM + DMARC quando ativar; texto simples junto do HTML |
| Limite grátis do Resend (100/dia, 3.000/mês) | Cabe com folga no volume do ateliê; erro 429 entra no retry |
| E-mail digitado errado pela cliente | Retry não resolve; status "falhou" aparece no painel para a Thaís avisar pelo WhatsApp |

## 10. O que você precisa fazer (eu não posso criar contas)
1. Criar a conta grátis em resend.com com **o seu e-mail** (é para ele que os testes chegam).
2. Gerar uma API key e colar no `.env` como `RESEND_API_KEY=...` (eu deixo o comando/linha pronta).

## 11. Premissas
- O e-mail informado no checkout é o da cliente (o campo já é obrigatório e validado).
- O frete "envio" é sempre pelos Correios (código no padrão `AA123456789BR`).

---
**Aguardando aprovação para iniciar a Fase 4.**
