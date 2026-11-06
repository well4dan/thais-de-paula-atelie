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
  * **Banco de Dados:** **Supabase PostgreSQL** via `pg@8.13.3` (`DATABASE_URL` no `.env`). Row Level Security (RLS) habilitada em todas as 11 tabelas.
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
│   └── auth-routes.mjs                 # Roteador das APIs (/api/v1/auth/*, /api/v1/me/*, /api/v1/store/*, /api/v1/health/*)
├── scripts/
│   └── keep-alive.mjs                  # Script CLI para disparar batimento no Supabase (`npm run keep-alive`)
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql      # Schema inicial de teste
│       ├── 002_full_ecommerce_and_keepalive.sql # Migration base (11 tabelas, RLS e índices)
│       └── 003_order_attachments_ttl7d.sql      # Cofre temporário de imagens originais dos clientes (TTL 7 dias + expurgo SQL)
├── tests/
│   └── security-auth.test.mjs          # Testes automatizados oficiais (10/10 testes passando contra o Supabase)
├── docs/
│   └── dossie-entrega-cliente.md       # Dossiê em Markdown para entrega à cliente Thaís (futuro PDF)
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

# 4. Iniciar o servidor Node.js
npm start # ou node server.mjs (porta padrão 8080)
```

---

## 🔒 Regras Críticas que o Claude Code DEVE Seguir
1. **Segurança de Credenciais:** Nunca exiba ou commite o conteúdo de `.env`. O arquivo `.env` contém o `DATABASE_URL` do Supabase e as chaves de criptografia.
2. **Tipografia e Estilo:** Nunca use travessões longos (`—` ou `–`) em textos visíveis do HTML/UI (regra de UI do projeto). Use hífen simples `-` com espaços ou barras `/`.
3. **Persistência:** Toda e qualquer alteração de produtos, pedidos ou clientes DEVE ser feita via queries parametrizadas no PostgreSQL (`pool.query(...)`), nunca armazenando em memória ou arquivo local que se perca no deploy.
4. **Atualização deste Log:** Sempre que concluir uma nova funcionalidade ou alteração, adicione uma entrada `[LOG-XXX]` neste arquivo `CLAUDE_HANDOVER_LOG.md`.
