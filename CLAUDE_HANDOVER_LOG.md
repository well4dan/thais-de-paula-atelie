# CLAUDE_HANDOVER_LOG.md — Thaís de Paula Ateliê
> **Aviso para o Claude Code / Próximo Agente:**  
> Este documento é o registro cronológico, arquitetural e técnico contínuo de todas as alterações feitas no projeto **Thaís de Paula Ateliê**. Se você está assumindo esta sessão a partir do Claude Code, leia este arquivo antes de qualquer ação. Ele contém o estado atual, convenções, decisões de segurança, mapeamento de arquivos e o checklist de pendências.

---

## 📌 Metadados do Projeto
* **Repositório:** `https://github.com/well4dan/thais-de-paula-atelie` (Branch: `main`)
* **Diretório Raiz:** `/home/wellington/Projetos/SITES/Thais de Paula`
* **Stack Tecnológico:**
  * **Frontend:** HTML5 Semântico, CSS3 Modular (`css/variables.css`, `css/main.css`, `css/pages.css`, `css/account.css`), Vanilla JavaScript moderno (ES Modules).
  * **Backend / API:** Node.js Nativo (`http`, `crypto`), sem Express (`server.mjs`, `server/auth-routes.mjs`, `server/security.mjs`, `server/pg-pool.mjs`, `server/db.mjs`).
  * **Banco de Dados:** **Supabase PostgreSQL** via `pg@8.13.3` (`DATABASE_URL` no `.env`). Row Level Security (RLS) habilitada em todas as 13 tabelas.
  * **Painel admin:** login no servidor com `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` no `.env` (gerar com `npm run admin:hash`). Sem servidor (Vercel estática, só demonstração), o painel cai em modo demonstração com PIN local.
  * **Hospedagem atual:** Vercel apenas como **demonstração estática** para a cliente (sem Node, sem dados reais). O backend Node + Supabase roda só localmente por enquanto.
  * **Criptografia & Auth:** Senhas com `scrypt` + salt criptográfico. CPF com `AES-256-GCM` em repouso e índice cego `HMAC-SHA256` para busca única sem expor dados. Sessões com Cookie `HttpOnly; SameSite=Lax` e proteção CSRF com `X-CSRF-Token`.
  * **Keep-Alive Supabase (Anti-Pausa):** Sistema triplo (cron interno de 6h no servidor, endpoint `GET /api/v1/health/keep-alive` e workflow do GitHub Actions `.github/workflows/supabase-keepalive.yml` a cada 48h).
  * **Conformidade Legal:** Termos de Uso ([termos-de-uso.html](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/termos-de-uso.html)), Termo de Consentimento LGPD ([termo-lgpd.html](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/termo-lgpd.html)), Política de Privacidade ([politica-de-privacidade.html](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/politica-de-privacidade.html)), e Portal de Autoatendimento com Portabilidade JSON e Direito ao Esquecimento ([minha-conta.html](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/minha-conta.html)).

---

## 📂 Mapa Completo da Estrutura de Arquivos

```text
/home/wellington/Projetos/SITES/Thais de Paula/
├── .env                                # Variáveis secretas (DATABASE_URL, SESSION_SECRET, CPF_ENCRYPTION_KEY) - NUNCA EXIBIR/COMMITAR
├── .gitignore                          # Ignora .env, node_modules/, data/, *.log
├── .github/
│   └── workflows/
│       └── supabase-keepalive.yml      # Cron do GitHub Actions para rodar a cada 48h (Keep-Alive do Supabase)
├── index.html                          # Página Inicial institucional + Vitrine das 8 linhas + FAQ + Modos de compra
├── loja.html                           # Catálogo geral de produtos (Pronta Entrega vs Sob Demanda, filtros, busca)
├── produto.html                        # Detalhe do produto com personalização em tempo real (foto, nome, acabamento)
├── checkout.html                       # Finalização de pedido com cupom, frete, endereço e envio para WhatsApp
├── pedido.html                         # Rastreio público do status do pedido (TP-2026-XXXX) em 5 etapas
├── conta.html                          # Tela de Cadastro e Login (Nome, CPF validado, Endereço, Senha forte, Termos + LGPD)
├── minha-conta.html                    # Área restrita do cliente (Editar endereço, Portabilidade JSON LGPD, Deletar conta)
├── termos-de-uso.html                  # Termos de Uso e Condições de Compra
├── termo-lgpd.html                     # Termo de Consentimento LGPD (Lei 13.709/2018)
├── politica-de-privacidade.html        # Política de Privacidade geral
├── 404.html                            # Página de erro customizada
├── robots.txt / sitemap.xml / llms.txt # SEO e indexação estruturada
├── favicon.svg / og-image.jpg          # Identidade visual e preview social
├── painel-tp/
│   ├── index.html                      # Painel administrativo da Thaís (Gestão de pedidos, estoque, produtos, cupons)
│   ├── admin.css                       # Estilização do painel
│   └── admin.js                        # Lógica administrativa (CRUD de produtos, atualização de status e exportação CSV)
├── css/
│   ├── variables.css                   # Cores oficiais da marca, tipografia e espaçamentos
│   ├── main.css                        # Estilos globais, header, footer, drawer do carrinho, badges
│   ├── pages.css                       # Estilos das páginas públicas
│   └── account.css                     # Estilos do fluxo de autenticação e conta
├── js/
│   ├── config.js                       # Configurações globais (dados do ateliê, WhatsApp, frete, chave PIX)
│   ├── store.js                        # Estado da loja (produtos, carrinho, cupons, sincronização com API PostgreSQL)
│   ├── dom.js                          # Utilitários de renderização segura (prevenção de XSS)
│   ├── account.js                      # Lógica da tela de login e cadastro (validação de CPF, ViaCEP, força de senha)
│   ├── my-account.js                   # Lógica da área do cliente (portabilidade LGPD, exclusão)
│   └── auth-client.js                  # Cliente frontend de autenticação e proteção CSRF
├── server/
│   ├── env.mjs                         # Parser e validador de variáveis de ambiente
│   ├── security.mjs                    # Criptografia AES-256-GCM, Blind Index HMAC, scrypt e CSRF
│   ├── pg-pool.mjs                     # Pool PostgreSQL (pg) com normalização de URI e Keep-Alive
│   ├── db.mjs                          # Camada DAL para usuários, sessões, pedidos, produtos e consentimentos
│   ├── zip.mjs                         # Gerador PKZIP em streaming (STORE + data descriptor + zlib.crc32 nativo)
│   ├── http-utils.mjs                  # Cookies, JSON, IP, rate limit e comparação em tempo constante (compartilhado)
│   ├── admin-auth.mjs                  # Login da administradora (ADMIN_EMAIL + ADMIN_PASSWORD_HASH) e sessões admin_sessions
│   ├── admin-routes.mjs                # Rotas exclusivas da admin (negado por padrão): snapshot, pedidos, produtos, fotos, .ZIP
│   └── auth-routes.mjs                 # Roteador principal: health, rotas públicas da loja, auth/me das clientes e despacho admin
├── scripts/
│   ├── keep-alive.mjs                  # Script CLI para disparar batimento no Supabase (`npm run keep-alive`)
│   └── admin-hash.mjs                  # Pede e-mail + senha da admin e grava ADMIN_EMAIL/ADMIN_PASSWORD_HASH no .env (`npm run admin:hash`)
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql      # Schema inicial de teste
│       ├── 002_full_ecommerce_and_keepalive.sql # Migration base (11 tabelas, RLS e índices)
│       ├── 003_order_attachments_ttl7d.sql      # Cofre temporário de imagens originais dos clientes (TTL 7 dias + expurgo SQL)
│       ├── 004_admin_sessions.sql               # Sessões da administradora + remoção do adminPin das configurações
│       ├── 005_site_content.sql                 # Mídia WebP, banners, faixas promocionais e vitrine
│       ├── 006_payments_and_financial_lock.sql  # Blindagem financeira, colunas do gateway e tabela payment_webhook_events (RLS)
│       └── 007_coupon_usage_lock.sql            # Bloqueio de cupom de 1ª compra e registro único de uso por cliente (RLS)
├── tests/
│   └── security-auth.test.mjs          # Testes automatizados oficiais (14/14 passando contra o Supabase em 06/11/2026)
├── docs/
│   ├── dossie-entrega-cliente.md       # Dossiê em Markdown para entrega à cliente Thaís (futuro PDF), v1.1
│   ├── 03-plano-zip-e-painel-seguro.md # Plano aprovado da rodada 03 (arquitetura-blindada) + divergências registradas
│   └── relatorio-auditoria.md          # Auditorias (rodada inicial + rodada 03 com vetos e backlog)
└── server.mjs                          # Servidor HTTP principal com cabeçalhos de segurança (CSP, HSTS, X-Frame)
```

---

## 📜 Histórico de Logs Cronológicos (O Que Foi Feito)

### [LOG-001] Fundação da Identidade Visual e Páginas Institucionais
* **Ação:** Criação do layout editorial baseado nas fotos dos cartões da Thaís de Paula Ateliê (`IMG-20261103-WA0062/63/64.jpg`).
* **Cores Extraídas:** Rosa Queimado (`#C88278`), Papel Algodão (`#FBF7F2`), Dourado Folha (`#C9A46A`), Verde Sálvia (`#5E7A68`), Marrom Cacau (`#2B1E1A`).
* **Páginas Criadas:** [index.html](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/index.html), [404.html](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/404.html), [politica-de-privacidade.html](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/politica-de-privacidade.html).
* **Imagens:** Geradas e convertidas 12 fotos WebP na pasta `img/` representando as 8 linhas de produtos artesanais.

### [LOG-002] E-Commerce Híbrido (Pronta Entrega vs Sob Demanda)
* **Ação:** Implementação do catálogo [loja.html](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/loja.html) e customizador dinâmico [produto.html](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/produto.html).
* **Regra de Negócio:**
  * **Pronta Entrega:** Baixa de estoque controlada no banco.
  * **Sob Demanda:** Campos dinâmicos para nome/frase na capa, laminação (brilho, fosco, holográfico), tema e upload de foto do cliente com crop preview ao vivo em Canvas.
* **Carrinho:** Drawer lateral persistente no `localStorage` e sincronizado com os produtos.

### [LOG-003] Checkout, Integração com WhatsApp e Rastreio
* **Ação:** Implementação de [checkout.html](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/checkout.html) e [pedido.html](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/pedido.html).
* **Regras:**
  * Cupons de desconto ativos: `BEMVINDA10` (10% off) e `ATELIE15` (R$ 15 off em compras > R$ 120).
  * Opções de frete: Retirada no Ateliê, Motoboy local e Correios (PAC/Sedex).
  * Geração de código `TP-2026-XXXX` e criação da mensagem formatada para o WhatsApp do ateliê `(43) 98422-1611`.
  * Rastreio público em 5 etapas no [pedido.html](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/pedido.html).

### [LOG-004] Painel Administrativo Oculto
* **Ação:** Criação de [painel-tp/index.html](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/painel-tp/index.html).
* **Segurança:** Ocultado do Google via `robots.txt` e `X-Robots-Tag: noindex, nofollow`. Autenticado por senha com sessão.
* **Recursos:** Dashboard com métricas de vendas, quadro de pedidos com atualização de status em tempo real, CRUD completo de produtos, ajuste rápido de estoque (+1 / -1), criação de cupons e exportação de relatórios em CSV.

### [LOG-005] Cadastro Seguro, Criptografia e Adequação LGPD
* **Ação:** Criação de [conta.html](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/conta.html), [minha-conta.html](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/minha-conta.html), [termos-de-uso.html](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/termos-de-uso.html) e [termo-lgpd.html](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/termo-lgpd.html).
* **Dados Coletados no Cadastro:** Nome completo, CPF (validação matemática rigorosa), Telefone, E-mail, Endereço completo (CEP, rua, número, complemento, bairro, cidade, UF) e Senha forte.
* **Segurança Técnica ([server/security.mjs](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/server/security.mjs)):**
  * CPF criptografado com `AES-256-GCM` em repouso.
  * CPF mascarado para o usuário (`***.456.789-00`).
  * Busca de duplicidade usando Blind Index com `HMAC-SHA256`.
  * Senhas com hash `scrypt` e verificação segura contra ataques de temporização (`crypto.timingSafeEqual`).
  * Sessões com cookie `HttpOnly; SameSite=Lax` e proteção CSRF com token `X-CSRF-Token`.
  * Rate limit de proteção contra força bruta no login (bloqueio com HTTP 429 após tentativas consecutivas).
* **Conformidade LGPD:**
  * Trava dupla no cadastro: só cadastra se aceitar os Termos de Uso E o Termo LGPD.
  * Gravação do consentimento com timestamp, versão do termo, IP mascarado e user-agent na tabela `consent_logs`.
  * Portal do Titular em [minha-conta.html](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/minha-conta.html) permitindo exportar todos os dados em JSON (Art. 18, V) e exclusão/anonimização com revogação de consentimento (Art. 18, VI e IX).

### [LOG-006] Migração Completa para Supabase PostgreSQL & Keep-Alive Triplo
* **Ação:** Substituição da persistência local por banco PostgreSQL em nuvem no Supabase.
* **Migration Criada:** [supabase/migrations/002_full_ecommerce_and_keepalive.sql](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/supabase/migrations/002_full_ecommerce_and_keepalive.sql) contendo as tabelas:
  1. `users`
  2. `addresses`
  3. `consent_logs`
  4. `sessions`
  5. `products` (16 produtos semeados)
  6. `coupons` (`BEMVINDA10` e `ATELIE15`)
  7. `orders`
  8. `order_items`
  9. `store_settings`
  10. `audit_logs`
  11. `keep_alive_heartbeat`
* **Row Level Security (RLS):** Habilitada em todas as tabelas.
* **Tratamento da Conexão ([server/pg-pool.mjs](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/server/pg-pool.mjs)):** Sanitização automática da URI caso contenha colchetes literais `[...]` na senha copiados da dashboard do Supabase.
* **Sistema Anti-Pausa (Keep-Alive):**
  1. *Interno:* Intervalo a cada 6h no [server.mjs](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/server.mjs) executando `public.touch_keep_alive()`.
  2. *HTTP:* Rota `GET /api/v1/health/keep-alive` e script [scripts/keep-alive.mjs](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/scripts/keep-alive.mjs) (`npm run keep-alive`).
  3. *Cloud:* Workflow GitHub Actions [.github/workflows/supabase-keepalive.yml](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/.github/workflows/supabase-keepalive.yml) a cada 48h.
* **Testes Automatizados:** [tests/security-auth.test.mjs](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/tests/security-auth.test.mjs) executado e aprovado com 10/10 testes passando (`0 fail`).

### [LOG-007] Documentação e Dossiê de Entrega do Cliente
* **Ação:** Criação do documento executivo [docs/dossie-entrega-cliente.md](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/docs/dossie-entrega-cliente.md) cobrindo as fases do projeto para futura conversão em PDF e entrega final à Thaís de Paula.

### [LOG-008] Cofre Temporário de Imagens dos Clientes para Artes (Download Original + Expurgo Automático em 7 Dias)
* **Ação:** Implementação do fluxo completo de envio de arquivos originais de imagens pelos clientes, download fiel pela administradora no painel e exclusão automática do banco após 7 dias (`TTL = 7 days`).
* **Migration Aplicada:** [supabase/migrations/003_order_attachments_ttl7d.sql](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/supabase/migrations/003_order_attachments_ttl7d.sql):
  * Criação da tabela `public.order_attachments` (`id`, `order_id`, `product_id`, `file_name`, `mime_type`, `size_bytes`, `file_data BYTEA`, `sha256_hash`, `downloaded_at`, `created_at`, `expires_at = NOW() + INTERVAL '7 days'`, `purged_at`) com RLS ativada.
  * Adição da coluna `attachments_json` em `public.order_items`.
  * Criação da função PL/pgSQL `public.purge_expired_order_images()` que apaga os bytes (`file_data = NULL, purged_at = NOW()`) de imagens com `expires_at <= NOW()` (ou anexos órfãos sem pedido após 24h) e marca `photo_data = 'expirada_7_dias'` em itens de pedidos com mais de 7 dias.
* **Integração ao Keep-Alive ([server/pg-pool.mjs](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/server/pg-pool.mjs)):**
  * Toda execução de `pingKeepAlive()` (no boot, a cada 6h, via endpoint HTTP e via GitHub Actions) executa automaticamente `SELECT public.purge_expired_order_images()`.
* **Rotas de API Criadas ([server/auth-routes.mjs](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/server/auth-routes.mjs) e [server/db.mjs](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/server/db.mjs)):**
  * `POST /api/v1/store/attachments`: Recebe a imagem original enviada pela cliente (JPG/PNG/WebP até 8 MB), valida MIME e salva os bytes originais intactos no PostgreSQL com expiração de 7 dias.
  * `GET /api/v1/store/attachments/:id/download`: Executa expurgo preventivo, registra `downloaded_at` e entrega o arquivo original exato com `Content-Disposition: attachment; filename="TP-2026-XXXX_nome-original.ext"`. Se já tiver passado 7 dias ou sido apagado, retorna `HTTP 410 Gone`.
  * `DELETE /api/v1/store/orders/:orderId/attachments`: Permite à administradora apagar imediatamente as imagens de um pedido assim que terminar de produzir a arte, sem nem precisar esperar os 7 dias.
  * `POST /api/v1/store/attachments/purge-expired`: Dispara manualmente a limpeza de imagens vencidas.
* **Frontend Atualizado:**
  * [js/product.js](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/js/product.js): Suporte a seleção de **múltiplos arquivos originais** (`multiple: true`, até 12 imagens por item), enviando o arquivo original para o banco e salvando apenas miniatura leve no `localStorage`.
  * [js/admin/app.js](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/js/admin/app.js): No modal de detalhes do pedido em `/painel-tp/`, exibe a lista de arquivos enviados com nome original, tamanho em KB, contador regressivo de dias (`apaga automaticamente em X dias`), botão **"Baixar arquivo original"** e botão **"Apagar imagens agora (Arte pronta)"**.
* **Testes Automatizados ([tests/security-auth.test.mjs](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/tests/security-auth.test.mjs)):** Adicionado Teste 8 validando upload original, download byte-a-byte idêntico e expurgo após 7 dias retornando `HTTP 410 Gone`.

### [LOG-009] Download Unificado em .ZIP de Todas as Fotos do Pedido + Resumo de Produção
* **Ação:** Implementação da opção **"Baixar todas as fotos (.ZIP)"** para a administradora no Painel (`/painel-tp/`), facilitando a produção de kits (ex: Kit Polaroides, Kit Ímãs, Cadernos com várias fotos).
* **Gerador PKZIP Nativo ([server/zip.mjs](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/server/zip.mjs)):**
  * Implementação pura em Node.js (`Buffer` + `CRC-32` + método `STORE` sem perda de qualidade e `0 dependências externas`).
  * Empacota todas as imagens ativas do pedido numeradas sequencialmente (`01_<produto>_<nome-original>.ext`, `02_...`) + um arquivo `LEIAME-<PEDIDO>.txt` contendo os dados do cliente e todas as instruções de personalização de cada item.
* **Rota de API e DAL ([server/db.mjs](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/server/db.mjs) e [server/auth-routes.mjs](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/server/auth-routes.mjs)):**
  * Função `getOrderAttachmentsForZipInPg(orderId)`: Busca todas as imagens originais de `public.order_attachments` do pedido (com fallback para `photo_data` inline se for pedido da demo), marca `downloaded_at = NOW()` e gera o `LEIAME-<PEDIDO>.txt`.
  * Endpoint `GET /api/v1/store/orders/:orderId/attachments.zip`: Retorna o arquivo `${orderId}-fotos-cliente.zip` com `Content-Type: application/zip` ou `410 Gone` caso as imagens já tenham expirado após 7 dias.
* **Painel Administrativo ([js/admin/app.js](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/js/admin/app.js)):**
  * Adicionado botão rápido **"Baixar .ZIP"** diretamente na listagem da tabela de pedidos (ao lado de "Detalhes") sempre que o pedido possuir fotos ativas.
  * Adicionado botão principal **"Baixar todas as fotos (.ZIP)"** na barra de ações do modal de detalhes do pedido.

### [LOG-010] Painel Blindado no Servidor + `.ZIP` em Streaming (protocolo arquitetura-blindada, perfil P2)
* **Motivo:** a geração do `.ZIP` estava lenta e, ao investigar, apareceu um bloqueador: o painel só tinha PIN no navegador e todas as rotas `/api/v1/store/*` (inclusive `snapshot` com dados de clientes e o PIN) eram públicas. Plano aprovado em [docs/03-plano-zip-e-painel-seguro.md](docs/03-plano-zip-e-painel-seguro.md).
* **Segurança (Camadas 4 e 8):**
  * Migração [004_admin_sessions.sql](supabase/migrations/004_admin_sessions.sql): tabela `admin_sessions` (RLS ativa) e remoção de `adminPin` de `store_settings`. `ensureDatabaseReady()` agora aplica 002, 003 e 004 em laço.
  * [server/admin-auth.mjs](server/admin-auth.mjs): credencial única no `.env`, scrypt sempre executado (sem vazamento por tempo), cookie `tp_admin` `HttpOnly; SameSite=Strict` de 8 h, CSRF.
  * [server/admin-routes.mjs](server/admin-routes.mjs): `POST /api/v1/admin/login` (5/IP e 30 globais por 15 min), `POST /api/v1/admin/logout`, `GET /api/v1/admin/me`, `GET /api/v1/admin/snapshot` e todas as rotas administrativas antigas no mesmo caminho, agora exigindo sessão (+ CSRF nas escritas).
  * [server/auth-routes.mjs](server/auth-routes.mjs): rotas públicas da loja são só `GET /store/snapshot` (vitrine), `POST /store/orders`, `POST /store/attachments` (agora com rate limit 60/15 min) e `GET /store/orders/:id/track?phone=XXXX` (novo, 30/15 min). Qualquer outra rota em `/store/*` ou `/admin/*` cai no roteador admin (negado por padrão).
  * Frontend: [js/admin/app.js](js/admin/app.js) detecta o modo (servidor → login real; sem API → demonstração com PIN), envia CSRF via `store.setAdminCsrfToken`, trata sessão expirada (`tp:admin-expired`) e apaga os pedidos do `localStorage` no logout. [js/order.js](js/order.js) consulta o servidor com código + 4 últimos dígitos do telefone.
* **Performance do `.ZIP`:** [server/zip.mjs](server/zip.mjs) reescrito em streaming (bit 3 + data descriptor, `Content-Length` previsto, `zlib.crc32`, leitura antecipada de 2). [server/db.mjs](server/db.mjs) `getOrderZipManifestInPg` (3 consultas em paralelo, filtra `expires_at > NOW()` em vez de rodar o expurgo global) e leitura em lotes base64 de até 16 MB (1º lote de 1 MB). O download individual também deixou de rodar o expurgo global. Pool com `idleTimeoutMillis` de 5 min.
  * Medido: pedido real de 10 fotos com 1º byte em ~1,9 s (antes ~2,6 a 3,6 s só no fim); pedido sintético de 96 MB com 5,5x menos CPU e 3,4x menos memória. Detalhes em [docs/relatorio-auditoria.md](docs/relatorio-auditoria.md) (Rodada 03).
  * **Armadilha registrada:** `pg` 8 com `binary: true` **corrompe BYTEA** (o `pg-protocol` lê a coluna como texto UTF-8). Usar `encode(file_data,'base64')`.
* **Correções de UI:** travessões removidos de [js/admin/app.js](js/admin/app.js), [js/product.js](js/product.js) e [termo-lgpd.html](termo-lgpd.html); regra CSS `.admin-lock form[hidden]` em `css/admin.css`.
* **Testes:** 13/13 passando. Novos 0c (14 rotas sem sessão → 401, login, cookie, CSRF, 429) e 0d (rastreio), Teste 8 agora autenticado, conferindo bytes e CRC-32 dentro do `.ZIP` e foto vencida fora do pacote. Teste de ponta a ponta no navegador: login, ZIP, logout e modo demonstração estático.
* **Auditoria:** 🔴 REPROVADO para produção real por pendências **anteriores** a esta rodada (V7 valor do pedido vindo do cliente; TLS `rejectUnauthorized: false`). Os bloqueadores desta rodada foram fechados.

### [LOG-011] Status do Pedido Sincronizado do Painel para a Cliente
* **Problema relatado:** ao mudar a etapa no painel, a cliente continuava vendo a etapa antiga. O banco era atualizado (`PATCH /api/v1/store/orders/status`), mas `pedido.html` e `minha-conta.html` liam só a cópia do `localStorage` da cliente. Antes do LOG-010 a cópia era renovada pelo snapshot público, que também vazava os pedidos de todas as clientes.
* **Correção:**
  * `GET /api/v1/me/orders` (sessão de cliente; só pedidos com `user_id` da própria conta, máx. 50) em [server/auth-routes.mjs](server/auth-routes.mjs) + `getUserOrdersInPg` em [server/db.mjs](server/db.mjs).
  * [js/order.js](js/order.js): ao abrir o pedido, a cada 60 s com a aba visível e ao voltar para a aba, consulta `/track` com os 4 últimos dígitos do telefone da cópia local e atualiza status e linha do tempo. Com o servidor respondendo, o botão "Simular confirmação do pagamento" some (só o ateliê muda etapas).
  * [js/store.js](js/store.js) `mergeServerOrders()`: o servidor é a fonte da verdade; da etapa "Pago" em diante o pagamento aparece como aprovado.
  * [js/my-account.js](js/my-account.js): lista pedidos da conta vindos do servidor (mesmo se o e-mail do checkout for outro) + os deste navegador.
* **Testes:** 14/14 (novo 4b: `/me/orders` exige login e só devolve pedidos da própria conta). Verificado no navegador: cópia local "Aguardando pagamento" virou "Em produção" e "PIX (aprovado)" sozinha.

### [LOG-012] Controle da Vitrine e Conteúdo do Site pelo Painel (Rodada 05)
* **Ação:** Implementação completa da aba **"Site e vitrine"** no painel administrativo (`/painel-tp/`) conforme [docs/05-plano-painel-conteudo-site.md](docs/05-plano-painel-conteudo-site.md).
* **Migração Aplicada:** [supabase/migrations/005_site_content.sql](supabase/migrations/005_site_content.sql):
  * Tabelas `public.media_assets` (biblioteca WebP servida em `/media/<sha256>.webp` com cache imutável de 1 ano), `public.site_banners` (banners de `topo`, `meio` e `popup` com agendamento por data) e `public.site_announcements` (faixas promocionais no topo do site), todas com RLS ativa.
  * Colunas novas em `public.products`: `home_order`, `image_url`, `compare_at_price` (preço "de R$ X por R$ Y") e `badges` (`novidade`, `mais_vendido`).
* **Backend e Injeção Segura:** [server/media.mjs](server/media.mjs), [server/site-content.mjs](server/site-content.mjs), [server/site-content-routes.mjs](server/site-content-routes.mjs) e injeção de `<script type="application/json" id="site-content">` em [server.mjs](server.mjs).
* **Frontend Público e Painel:** [js/site-content.js](js/site-content.js), [css/site-content.css](css/site-content.css), [js/admin/site-content.js](js/admin/site-content.js), [js/admin/site-banners.js](js/admin/site-banners.js), [js/admin/site-strips.js](js/admin/site-strips.js), [js/admin/site-showcase.js](js/admin/site-showcase.js), [js/admin/media-upload.js](js/admin/media-upload.js), [js/admin/products.js](js/admin/products.js) e [js/admin/sortable.js](js/admin/sortable.js).
* **Testes:** Suíte [tests/site-content.test.mjs](tests/site-content.test.mjs) validando links seguros, dimensões WebP, autorização admin + CSRF, período ativo de banners/faixas, vitrine de até 12 itens e preços promocionais.

### [LOG-013] Expansão do Catálogo para 12 Linhas e 24 Produtos (Calendários, Agendas, Planners e Livros de Maternidade)
* **Ação:** Inclusão das 4 novas linhas solicitadas pelo cliente no catálogo oficial ([js/data/seed.js](js/data/seed.js), [index.html](index.html), [loja.html](loja.html) e Supabase PostgreSQL):
  1. **Calendários (`calendarios`):** `p17` (*Calendário de mesa personalizado* — sob demanda, com opção de 12 fotos ou floral) e `p18` (*Calendário de mesa floral A6* — pronta entrega).
  2. **Agendas (`agendas`):** `p19` (*Agenda diária personalizada* — sob demanda, datada ou permanente, laminação fosca/brilho/holográfica) e `p20` (*Agenda permanente floral* — pronta entrega).
  3. **Planners (`planners`):** `p21` (*Planner anual personalizado* — sob demanda, com 12 divisórias em abas, visão vertical/horizontal) e `p22` (*Planner semanal de mesa* — pronta entrega).
  4. **Livros de maternidade (`maternidade`):** `p23` (*Livro do bebê e maternidade personalizado* — sob demanda, com opção de caixa de recordações) e `p24` (*Caderneta de saúde do bebê personalizada* — sob demanda).
* **Fotografia de Produto:** Geradas e otimizadas 4 novas imagens WebP (`img/p-calendario.webp`, `img/p-agenda.webp`, `img/p-planner.webp`, `img/p-maternidade.webp`).
* **Sincronização Idempotente:** [server/pg-pool.mjs](server/pg-pool.mjs) (`seedEcommerceIfNeeded`) e [js/store.js](js/store.js) (`init`) atualizados para inserir automaticamente novos produtos do seed (`ON CONFLICT (id) DO NOTHING`) sem sobrescrever produtos já editados no banco.

### [LOG-014] Blindagem Financeira (Veto V7 Fechado) + Estrutura Pronta para Gateway de Pagamento (Asaas / Multi-Provider)
* **Ação:** Fechamento do Veto V7 de segurança financeira e preparação completa do backend e banco para conectar o gateway de pagamento (com adaptador nativo para **Asaas** e modo `sandbox_sim` enquanto a cliente não cria a conta).
* **Migração Aplicada:** [supabase/migrations/006_payments_and_financial_lock.sql](supabase/migrations/006_payments_and_financial_lock.sql):
  * Novas colunas em `public.orders`: `payment_provider`, `gateway_charge_id`, `gateway_checkout_url`, `pix_qr_payload`, `boleto_digitable_line`, `paid_at`.
  * Nova tabela `public.payment_webhook_events` com RLS ativa (sem política pública) e chave única `(provider, event_id)` para garantir idempotência estrita contra reprocessamento de webhooks.
* **Adaptador do Gateway ([server/payments.mjs](server/payments.mjs)):**
  * `createGatewayCharge()`: cria cliente e cobrança no **Asaas v3** (`PIX`, `BOLETO` ou Cartão/`UNDEFINED`) quando `PAYMENT_PROVIDER=asaas` + `ASAAS_API_KEY` estão configurados no `.env`, retornando `checkoutUrl`, `pixQrPayload` e `boletoLine`. Sem API key, opera no modo `sandbox_sim`.
  * `verifyWebhookAuth()`: verifica o segredo `PAYMENT_WEBHOOK_SECRET` via `crypto.timingSafeEqual` tanto pelo cabeçalho oficial `asaas-access-token` quanto por HMAC-SHA256 (`x-webhook-signature`).
* **Recálculo Autoritativo + Reserva Atômica de Estoque ([server/db.mjs](server/db.mjs)):**
  * `createOrderInPg()` agora ignora qualquer preço, adicional, desconto ou frete vindo do navegador: trava as linhas em `public.products` com `SELECT ... FOR UPDATE`, verifica estoque em tempo real (`409` se insuficiente), soma preço base + adicionais do catálogo, valida o cupom em `public.coupons`, aplica a regra de frete de `public.store_settings`, gera o código `TP-YYYY-XXXX` no servidor quando omitido e grava o pedido auditado.
  * `processPaymentWebhookInPg()` valida que o valor pago no webhook não é inferior ao total calculado pelo servidor, garante idempotência e atualiza status para `pago` (ou devolve estoque e cancela em estorno/exclusão).
* **Nova Rota de Webhook ([server/auth-routes.mjs](server/auth-routes.mjs)):** `POST /api/v1/webhooks/payment`.
* **Testes:** Adicionado Teste 9 em [tests/security-auth.test.mjs](tests/security-auth.test.mjs) provando bloqueio de fraude de preço no checkout e validação + idempotência do webhook Asaas.

### [LOG-015] Bloqueio de Cupons de Primeira Compra e Cupons Já Utilizados
* **Ação:** Implementada trava anti-abuso de cupons tanto no PostgreSQL quanto no checkout e no painel administrativo.
* **Migração Aplicada:** [supabase/migrations/007_coupon_usage_lock.sql](supabase/migrations/007_coupon_usage_lock.sql):
  * Novas colunas em `public.coupons`: `first_purchase_only` (`BEMVINDA10` marcado como `TRUE`), `single_use_per_customer` (`TRUE` por padrão), `max_uses`, `used_count`.
  * Nova tabela `public.coupon_redemptions` com RLS ativa, registrando `(coupon_code, order_id, user_id, email_norm, phone_digits)`.
* **Regras de Bloqueio ([server/db.mjs](server/db.mjs) `validateCouponEligibilityInPg`):**
  * Cruza `user_id`, e-mail normalizado e telefone (apenas dígitos) contra pedidos reais não cancelados (`is_demo = FALSE AND status <> 'cancelado'`).
  * Bloqueia com `HTTP 409` (`COUPON_ALREADY_USED`) qualquer tentativa de reutilizar um cupom já usado pelo mesmo cliente.
  * Bloqueia com `HTTP 409` (`COUPON_FIRST_PURCHASE_ONLY`) qualquer cupom de primeira compra se o cliente já tiver pedido anterior real.
  * Se um pedido for cancelado em `updateOrderStatusInPg`, o resgate é estornado automaticamente em `coupon_redemptions`.
* **API, Checkout e Painel:**
  * Rota `POST /api/v1/store/coupons/validate` em [server/auth-routes.mjs](server/auth-routes.mjs) para feedback imediato ao aplicar o cupom.
  * [js/store.js](js/store.js) e [js/checkout.js](js/checkout.js) validam em tempo real com o servidor e impedem envio do pedido caso bloqueado.
  * [js/admin/app.js](js/admin/app.js) ganhou checkbox `"Exclusivo 1ª compra"` e exibição das regras de uso por cliente.
* **Testes:** Adicionado Teste 10 em [tests/security-auth.test.mjs](tests/security-auth.test.mjs) provando uso único na 1ª compra (`BEMVINDA10` OK → 2ª tentativa `409`), bloqueio de outro cupom de 1ª compra após já ter comprado e bloqueio de reuso de cupom comum (`ATELIE15`).

---

## ✅ Checklist de Pendências (ordem de prioridade)
- [x] 🔴 Recalcular preço, desconto e frete no servidor em `POST /api/v1/store/orders` (veto V7 FECHADO no LOG-014).
- [x] 🔴 Receptor de Webhooks com verificação criptográfica (`asaas-access-token` / HMAC-SHA256) e idempotência no PostgreSQL (LOG-014).
- [ ] 🔴 TLS do Postgres com o CA do Supabase (`ssl: { ca }`) em `server/pg-pool.mjs`.
- [ ] 🔴 `APP_SECRET_HEX` no `.env` de produção (hoje a chave do CPF fica em `data/.secret_key`).
- [ ] 🟡 Colar `PAYMENT_PROVIDER=asaas`, `ASAAS_API_KEY` e `PAYMENT_WEBHOOK_SECRET` no `.env` assim que a Thaís criar a conta no Asaas.
- [x] 🟡 Configurar `ADMIN_EMAIL` e `ADMIN_PASSWORD_HASH` no `.env` local: `npm run admin:hash` agora pede e-mail e senha e grava direto no `.env`.
- [ ] 🟡 Código de pedido gerado 100% no servidor em todos os cenários (hoje o servidor gera se omitido, e aceita formato válido da demo).
- [x] 🟡 `GET /api/v1/me/orders` para "Minha conta" listar pedidos de qualquer aparelho (LOG-011).
- [ ] 🟡 Vincular upload de foto a um token do carrinho.
- [ ] 🟡 Backup com restore testado + RTO/RPO.
- [ ] 🟡 Definir hospedagem do backend Node (servidor contínuo, por causa do keep-alive interno) para sair da demo estática.
- [ ] 🔵 Fotos no Supabase Storage privado; MFA da admin; converter o dossiê para PDF.

---

## 🛠️ Comandos Operacionais para o Claude Code

Para testar ou rodar o projeto localmente:
```bash
# 1. Instalar dependências (apenas 'pg' é usado)
npm install

# 2. Rodar a suíte completa de testes automatizados (testa banco, auth, LGPD, criptografia)
npm test

# 3. Disparar batimento manual de Keep-Alive no Supabase
npm run keep-alive

# 4. Configurar o login do painel (pede e-mail e senha e grava no .env)
npm run admin:hash

# 5. Iniciar o servidor Node.js
npm start # ou node server.mjs (porta padrão 8080)
```

---

## 🔒 Regras Críticas que o Claude Code DEVE Seguir
1. **Segurança de Credenciais:** Nunca exiba ou commite o conteúdo de `.env`. O arquivo `.env` contém o `DATABASE_URL` do Supabase e as chaves de criptografia.
2. **Tipografia e Estilo:** Nunca use travessões longos (`—` ou `–`) em textos visíveis do HTML/UI (regra de UI do projeto). Use hífen simples `-` com espaços ou barras `/`.
3. **Persistência:** Toda e qualquer alteração de produtos, pedidos ou clientes DEVE ser feita via queries parametrizadas no PostgreSQL (`pool.query(...)`), nunca armazenando em memória ou arquivo local que se perca no deploy.
4. **Atualização deste Log:** Sempre que concluir uma nova funcionalidade ou alteração, adicione uma entrada `[LOG-XXX]` neste arquivo `CLAUDE_HANDOVER_LOG.md` e atualize o checklist de pendências e o [dossiê](docs/dossie-entrega-cliente.md).
5. **Protocolo:** seguir as skills `site-blindado` (páginas) e `arquitetura-blindada` (backend/app): plano aprovado antes de codar, revisão adversarial e auditoria ao fim de cada rodada.
6. **Rotas novas da API:** toda rota nova em `/api/v1/store/*` é administrativa por padrão. Para torná-la pública, ela precisa ser declarada explicitamente no bloco público de `server/auth-routes.mjs`, com rate limit e sem dados pessoais.
