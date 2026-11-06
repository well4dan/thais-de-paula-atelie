# Plano de Implementação - Thaís de Paula Ateliê (Rodada 03)

**Perfil:** P2 (CPF, endereço, telefone e fotos pessoais de clientes) · **Data:** 2026-11-06 · **Versão do plano:** 1

## 1. Resumo executivo
A geração do .ZIP de fotos está lenta. Ao investigar, apareceu um bloqueador de segurança: as rotas do painel não têm autenticação no servidor. Esta rodada fecha o painel com login real no servidor e, em seguida, reescreve o .ZIP em modo streaming. Sucesso medido por: (a) toda rota administrativa responde 401 sem sessão de admin; (b) o download do .ZIP começa em menos de 1 s e usa memória de no máximo 1 foto por vez.

## 2. Diagnóstico

### 2.1 🔴 Bloqueador de segurança (veto LGPD)
| Achado | Onde | Impacto |
|---|---|---|
| O painel só tem um PIN de demonstração verificado **no navegador** (`2611`, exibido na própria mensagem de erro) | `js/admin/app.js:36` | Qualquer pessoa pode chamar a API diretamente, sem PIN |
| `GET /api/v1/store/snapshot` é público e devolve os últimos 200 pedidos com `customer_json` (nome, telefone, e-mail, endereço), `photo_data` em base64 e `store_settings` (inclui o PIN) | `server/db.mjs:396`, `server/auth-routes.mjs` | Vazamento de dados pessoais de todas as clientes |
| ZIP, download de foto, alterar status, CRUD de produtos/cupons, configurações e `reset` sem nenhuma checagem de papel | `server/auth-routes.mjs:152-282` | Qualquer pessoa baixa as fotos das clientes (o código `TP-2026-XXXX` é sequencial e fácil de adivinhar), altera preço ou apaga a loja |

### 2.2 🟡 Causas da lentidão do .ZIP
1. **Tudo em memória antes do 1º byte:** as fotos (até 12 x 8 MB) são lidas de uma vez, o ZIP é montado inteiro e só depois o download começa. O navegador fica "parado" sem barra de progresso.
2. **BYTEA trafega em hexadecimal:** o `pg` recebe `file_data` como texto hex, ou seja, 2x o tamanho real pela rede até o Supabase, e ainda converte de volta para binário.
3. **Expurgo global no caminho quente:** cada download executa `purge_expired_order_images()`, que varre `order_attachments` e faz `UPDATE ... JOIN orders` em `order_items` inteiro.
4. **4 idas ao banco em sequência** (expurgo, pedido, itens, anexos).
5. **CRC-32 em JavaScript puro**, byte a byte, sobre ~100 MB, mais uma cópia extra em `Buffer.concat`.
6. O snapshot público também carrega `photo_data` de **todos** os itens, deixando a loja inteira mais lenta.

## 3. Escopo
**Nesta rodada:**
- Login de administradora no servidor (senha forte com hash scrypt via `.env`, sessão com papel `admin`, CSRF, limite de tentativas).
- Proteção de todas as rotas administrativas e divisão do snapshot em público (vitrine) e admin (pedidos).
- Rota pública mínima de rastreio do pedido (só status, sem dados pessoais).
- ZIP em streaming com CRC nativo e leitura de 1 foto por vez.
- Testes de autorização e de integridade do ZIP; atualização de dossiê e handover.

**Fora desta rodada:**
- Código de pedido não sequencial (exige migração de pedidos existentes; fica no backlog, a mitigação desta rodada é exigir o telefone da cliente no rastreio).
- Mover fotos do BYTEA para Supabase Storage (melhor a longo prazo, mas muda o modelo de dados; backlog).
- MFA para a administradora (backlog).

## 4. Decisões arquiteturais
| # | Decisão | Alternativa descartada | Motivo | Custo de reverter |
|---|---|---|---|---|
| 1 | Credencial admin = `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` (scrypt) no `.env`, gerado por `npm run admin:hash` | Tabela de admins no banco | Uma única administradora; nada de senha em texto no banco ou no repo | Baixo |
| 2 | Reaproveitar a tabela `sessions` com coluna `role` (`customer` / `admin`), sessão admin de 8 h | JWT | Já existe sessão HttpOnly + CSRF testada; revogação imediata | Baixo |
| 3 | ZIP com "data descriptor" (bit 3) e `Content-Length` calculado por `size_bytes` | Montar em memória (atual) / biblioteca `archiver` | Streaming real, 0 dependências, tamanho exato conhecido (método STORE) | Baixo |
| 4 | `zlib.crc32` nativo do Node 22 | CRC em JS | Implementado em C, dezenas de vezes mais rápido | Baixo |
| 5 | Filtrar `expires_at > NOW()` na consulta em vez de rodar o expurgo global a cada download | Manter o expurgo no download | Mesma garantia (foto vencida nunca é entregue), sem varrer tabelas; o expurgo continua no keep-alive a cada 6 h | Baixo |
| 6 | Ler cada foto com `SELECT encode(file_data,'base64')` por id | Hex padrão do `pg` | base64 = 1,33x em vez de 2x pela rede, e só 1 foto em memória | Baixo |

## 5. Modelo de dados
Migração `004_admin_sessions.sql` (não destrutiva, só `ADD COLUMN IF NOT EXISTS`):
- `public.sessions.role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin'))`
- `public.sessions.user_id` passa a aceitar `NULL` para sessão admin (a administradora não é cliente).
- RLS continua ativa; o acesso é só pelo servidor (sem chave pública do Supabase no navegador).

## 6. Contratos de API
| Rota | Método | Auth | Papéis | Saída | Erros |
|---|---|---|---|---|---|
| `/api/v1/admin/login` | POST | - | público | sessão admin + `csrfToken` | 400, 401, 429 |
| `/api/v1/admin/logout` | POST | sessão + CSRF | admin | 204 | 401, 403 |
| `/api/v1/admin/me` | GET | sessão | admin | `{ email }` | 401 |
| `/api/v1/store/snapshot` | GET | - | público | produtos ativos, cupons ativos (sem regras internas), configurações públicas. **Sem pedidos, sem PIN** | - |
| `/api/v1/admin/snapshot` | GET | sessão | admin | snapshot completo **sem `photo_data`** | 401 |
| `/api/v1/store/orders/:id/track?phone=` | GET | - | público | `{ id, status, history }` se os 4 últimos dígitos do telefone baterem | 404, 429 |
| `/api/v1/store/orders` | POST | - | público (cliente) | 201 | 400 |
| Todas as demais rotas de escrita/leitura administrativa (status, produtos, cupons, configurações, reset, anexos, ZIP, expurgo) | - | sessão + CSRF nas escritas | admin | igual a hoje | 401, 403 |

Hoje o painel chama essas rotas sob `/api/v1/store/*`. Elas permanecem no mesmo caminho, só passam a exigir a sessão admin, para não quebrar o frontend.

## 7. Matriz de autorização
| Papel | Recurso | C | R | U | D | Condição |
|---|---|---|---|---|---|---|
| Visitante | Produtos / cupons / config pública | - | ✔ | - | - | só ativos |
| Visitante | Pedido | ✔ | status | - | - | rastreio exige telefone |
| Visitante | Anexo (foto) | ✔ | - | - | - | upload antes do pedido, até 8 MB |
| Cliente logada | Própria conta | - | ✔ | ✔ | ✔ | só a própria (já existe) |
| Admin | Pedidos, produtos, cupons, config, anexos, ZIP | ✔ | ✔ | ✔ | ✔ | sessão admin válida + CSRF |
| Qualquer outro caso | - | ✘ | ✘ | ✘ | ✘ | negado por padrão |

## 8. Etapas
| # | Objetivo | Arquivos | Depende de | Critério de pronto | Risco | Rollback | Esforço |
|---|---|---|---|---|---|---|---|
| 1 | Login admin no servidor + migração 004 + script de hash | `supabase/migrations/004_*.sql`, `server/admin-auth.mjs` (novo), `server/auth-routes.mjs`, `scripts/admin-hash.mjs`, `.env.example`, `package.json` | - | login/logout funcionando, 429 após 5 tentativas | 🟡 | reverter commit; coluna nova é inofensiva | M |
| 2 | Guard admin em todas as rotas administrativas + snapshot dividido + rastreio público | `server/auth-routes.mjs`, `server/db.mjs` | 1 | rotas admin dão 401 sem sessão; snapshot público sem pedidos/PIN | 🔴 | reverter commit | M |
| 3 | Painel usa login real (e-mail + senha) no lugar do PIN; loja e `pedido.html` usam as novas rotas | `js/admin/app.js`, `painel-tp/index.html`, `js/store.js`, `js/order.js` | 2 | painel funciona de ponta a ponta; PIN removido da UI e das configurações | 🟡 | reverter commit | M |
| 4 | ZIP em streaming (data descriptor, `zlib.crc32`, 1 foto por vez, sem expurgo global) | `server/zip.mjs`, `server/db.mjs`, `server/auth-routes.mjs` | 2 | ZIP abre no Windows/macOS/Linux, bytes idênticos aos originais, 1º byte < 1 s | 🟢 | reverter commit | M |
| 5 | Testes de authz por papel + integridade do ZIP + medição antes/depois | `tests/security-auth.test.mjs` | 1-4 | `npm test` verde | 🟢 | - | P |
| 6 | Revisão adversarial + auditoria + dossiê + handover (LOG-010) | `docs/relatorio-auditoria.md`, `docs/dossie-entrega-cliente.md`, `CLAUDE_HANDOVER_LOG.md` | 5 | zero 🔴, score calculado | 🟢 | - | P |

## 9. Riscos e mitigações
| Risco | Prob. | Impacto | Mitigação | Plano B |
|---|---|---|---|---|
| Esquecer alguma rota admin sem guard | Média | Alto | Guard por lista de permissão: tudo em `/api/v1/store/*` é admin, exceto as rotas públicas listadas | Teste que percorre todas as rotas sem sessão esperando 401 |
| Cliente perder rastreio por não lembrar do telefone | Baixa | Baixo | Último pedido do navegador continua preenchido automaticamente | WhatsApp do ateliê |
| Algum descompactador antigo não aceitar data descriptor | Baixa | Médio | Formato padrão PKZIP 2.0, testado com `unzip -t` e Python `zipfile` | Calcular o CRC antes de enviar cada foto |

## 10. Estratégia de testes
- Integração: cada rota admin sem sessão → 401; com sessão de cliente → 403; com admin sem CSRF em escrita → 403; com admin → 200.
- Snapshot público não contém `customer_json`, `photo_data` nem `adminPin`.
- ZIP: SHA-256 de cada foto extraída igual ao enviado; `LEIAME` presente; foto vencida → 410.
- Rate limit do login admin → 429.

## 11. Checkpoints para aprovação
- [ ] Após etapa 3: você testa o login do painel no navegador.
- [ ] Após etapa 4: você testa o download do .ZIP com um pedido real de várias fotos.

## 12. Premissas assumidas
- Existe uma única administradora (Thaís). Se houver mais pessoas, a decisão 1 vira tabela de admins.
- O PIN `2611` era só demonstração e pode ser removido.
- O site ainda não está em produção com clientes reais (se estiver, os dados do snapshot já podem ter vazado e isso precisa de avaliação de incidente LGPD).

---
**Aprovado em 2026-11-06** (administradora única confirmada; site só em demonstração estática na Vercel, sem dados reais).

## 13. Divergências durante a execução (registradas)
- **Decisão 2:** a sessão admin foi para a tabela própria `admin_sessions` (migração 004), não uma coluna `role` em `sessions`: `sessions.user_id` é `NOT NULL` com FK para `users`, e o `getSession` das clientes faz JOIN com `users`. Separar evita qualquer cruzamento entre sessão de cliente e de admin.
- **Decisão 6:** além do base64, as fotos passaram a ser lidas em lotes (`id = ANY($1)`) de até 16 MB, com 1º lote de 1 MB e leitura antecipada. Com uma consulta por foto, o pedido real de 10 fotos ficou mais lento por causa da latência (~200 ms por ida ao Supabase). O modo `binary: true` do `pg` foi testado e descartado porque corrompe BYTEA.
- **Snapshot admin:** mantém `photo_data` (miniaturas leves), já que agora só a administradora logada recebe.
- **Modo demonstração:** sem servidor Node (Vercel estática), o painel usa PIN local com dados fictícios, porque a versão publicada é só de apresentação.
- **Pool:** `idleTimeoutMillis` subiu de 30 s para 5 min, porque cada conexão nova com o Supabase custa ~1,2 s de handshake TLS.
