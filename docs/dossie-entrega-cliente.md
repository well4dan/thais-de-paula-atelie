# Dossiê Executivo e Técnico de Entrega do Projeto
## Thaís de Paula Ateliê · Papelaria Personalizada & Presentes Afetivos

**Cliente:** Thaís de Paula Ateliê (`@thaisdepaulatelie`)  
**WhatsApp Oficial Integrado:** `(43) 98422-1611`  
**Slogan Oficial:** *"Transformando papel em momentos especiais."*  
**Status do Documento:** Versão 1.0 (Em atualização contínua até a emissão final em PDF)  
**Data da Última Atualização:** 06 de novembro de 2026  

---

## 1. Visão Geral do Projeto

Este documento registra todas as etapas concebidas, desenvolvidas, auditadas e implantadas desde o início do projeto da plataforma digital do **Thaís de Paula Ateliê**. O sistema foi desenhado sob medida para unir **encantamento visual**, **venda direta de produtos a pronta entrega e sob encomenda personalizada**, **gestão administrativa simplificada** e **segurança jurídica/tecnológica de padrão bancário (LGPD + Criptografia + Banco em Nuvem)**.

### Pilares da Marca Aplicados no Sistema
* **Qualidade:** Acabamento visual refinado, fotos em alta definição otimizadas (`.webp`) e tipografia editorial (*Cormorant Garamond*, *Plus Jakarta Sans* e *JetBrains Mono*).
* **Carinho:** Microinterações suaves, mensagens acolhedoras e jornada de compra sem atrito.
* **Personalização:** Configurador interativo em tempo real para produtos sob demanda (escolha de nome para capa, acabamento holográfico/fosco/brilho, tema e pré-visualização instantânea de fotos para Polaroides, Quadros e Ímãs).
* **Feito com Amor:** Cada tela respeita a paleta cromática extraída dos cartões oficiais do ateliê (Rosa Queimado `#C88278`, Creme Papel Algodão `#FBF7F2`, Dourado Folha `#C9A46A`, Verde Sálvia `#5E7A68` e Marrom Cacau `#2B1E1A`).

---

## 2. Cronologia Completa do Que Foi Desenvolvido (Fase a Fase)

### Fase 1: Identidade Visual, Arquitetura Editorial e Vitrine Institucional
1. **Extração Fiel da Identidade da Marca:**
   * Análise do material oficial do ateliê (cartão de visitas, assinatura visual, monograma `TP` com estrelas de 4 pontas e ramos botânicos).
   * Criação de **Favicon Vetorial (`favicon.svg`)**, ícone Apple Touch e imagem de pré-visualização para WhatsApp/Instagram (**Open Graph `og-image.jpg`**).
2. **Fotografia de Produto e Cenografia Digital (`img/*.webp`):**
   * Produção e otimização de 12 fotografias exclusivas em formato WebP de carregamento ultrarrápido contemplando todas as 8 linhas do ateliê.
3. **Página Inicial de Alto Impacto (`index.html`):**
   * **Hero Editorial Assimétrico:** Apresentação da proposta de valor com atalho direto para a loja e para encomendas personalizadas.
   * **Explicação Visual dos 2 Modos de Compra:** Diferenciação clara entre **Pronta Entrega** (envio em até 24h úteis com controle automático de estoque) e **Sob Demanda** (produção artesanal personalizada em 3 a 5 dias úteis).
   * **Vitrine das 8 Linhas Oficiais:**
     1. *Cadernos Personalizados* (Universitário, Colegial, A5, Devocional, Pedagógico)
     2. *Blocos de Notas & Planners* (Bloco A6, Planner Semanal, Lista de Compras Magnética)
     3. *Lápis Personalizados* (Kits com nome gravado e ponteira)
     4. *Fotos Polaroide* (Kits com legenda personalizada e prévia de corte ao vivo)
     5. *Quadros Decorativos* (Moldura madeira/branca com arte autoral ou foto)
     6. *Adesivos em Vinil* (À prova d'água com recorte eletrônico)
     7. *Etiquetas Escolares* (Kits completos termocolantes e vinílicos)
     8. *Ímãs de Geladeira* (Foto-ímãs, calendários magnéticos e save the date)
   * **Seção Sobre o Ateliê, Depoimentos de Clientes e Perguntas Frequentes (FAQ).**

---

### Fase 2: Loja Virtual Híbrida (`loja.html` e `produto.html`)
1. **Catálogo Completo com 16 Produtos Iniciais (`loja.html`):**
   * Filtros instantâneos por **Modalidade** (*Todos*, *Pronta Entrega*, *Sob Demanda*), **Categoria** (as 8 linhas do ateliê), **Busca por texto** e **Ordenação** (*Destaques*, *Menor Preço*, *Maior Preço*, *Pronta Entrega Primeiro*).
   * Badges dinâmicos de disponibilidade: indicação exata de unidades restantes na Pronta Entrega (`Últimas X un.`) ou prazo de produção no Sob Demanda (`Sob demanda · 3–5 dias`).
2. **Página de Produto e Estúdio de Personalização (`produto.html`):**
   * **Para itens Pronta Entrega:** Trava automática de limite máximo conforme o estoque disponível e baixa automática ao concluir o pedido.
   * **Para itens Sob Demanda:** Formulário dinâmico que coleta:
     * Nome ou frase para estampar na capa/peça;
     * Escolha de laminação/acabamento (*Brilho*, *Fosco Toque de Seda*, *Holográfico Confete* ou *Glitter*);
     * Tema/cor ou envio de **Foto do Cliente com Pré-visualização Instantânea (Live Crop Preview)** na própria tela;
     * Observações especiais para a produção artesanal;
     * **Cálculo automático do prazo estimado de produção** somando a complexidade dos itens do carrinho.
3. **Sacola Lateral Inteligente (Drawer Cart):**
   * Acessível de qualquer página do site, separando visualmente itens de Pronta Entrega e itens Sob Demanda, exibindo o resumo das personalizações escolhidas em cada item.

---

### Fase 3: Checkout Transparente, Cupons, WhatsApp e Rastreio (`checkout.html` e `pedido.html`)
1. **Checkout Completo com Autopreenchimento (`checkout.html`):**
   * Se o cliente estiver logado, **Nome, E-mail, WhatsApp e Endereço completo** são preenchidos automaticamente.
   * Seleção de modalidade de entrega: **Retirada gratuita no Ateliê**, **Entrega Expressa Local (Motoboy)** ou **Envio Nacional (Correios PAC / SEDEX)**.
   * **Sistema de Cupons de Desconto:** Validação em tempo real de cupons percentuais ou de valor fixo (ex.: `BEMVINDA10` para 10% OFF e `ATELIE15` para R$ 15,00 OFF em compras acima de R$ 120,00).
   * Escolha de forma de pagamento (**PIX com QR/Chave**, **Cartão de Crédito** ou **Link de Pagamento**).
   * **Geração Automática do Pedido + Mensagem Estruturada para WhatsApp:** Ao finalizar, o pedido é salvo no banco de dados com código único (ex.: `TP-2026-8492`) e o cliente pode enviar o resumo formatado com todas as personalizações diretamente para o WhatsApp `(43) 98422-1611`.
2. **Página de Acompanhamento de Pedido em Tempo Real (`pedido.html`):**
   * O cliente consulta o andamento do pedido pelo código (`TP-2026-XXXX`) e visualiza a linha do tempo em 5 etapas:
     1. *Pedido Recebido*
     2. *Pagamento Confirmado*
     3. *Em Produção no Ateliê*
     4. *Pronto para Retirada / Postado*
     5. *Entregue*

---

### Fase 4: Painel Administrativo Oculto (`/painel-tp/`)
1. **Acesso Restrito e Invisível a Buscadores:**
   * Localizado na rota `/painel-tp/`, protegida por senha administrativa, cabeçalho `X-Robots-Tag: noindex, nofollow` e bloqueada no `robots.txt` para nunca aparecer no Google.
2. **Funcionalidades de Gestão para a Thaís:**
   * **Dashboard Financeiro e Operacional:** Faturamento total, ticket médio, total de pedidos, pedidos em produção e alertas de estoque baixo.
   * **Quadro de Gestão de Pedidos:** Filtro por status, visualização detalhada das personalizações de cada cliente, botão de atualização rápida de status (que reflete imediatamente na página `pedido.html` do cliente) e atalho para chamar o cliente no WhatsApp.
   * **Controle de Estoque e Catálogo (CRUD):** Criação de novos produtos, edição de preços, alteração rápida de quantidade em estoque (+1 / -1 ou valor exato) e alternância entre Pronta Entrega e Sob Demanda.
   * **Gestão de Cupons de Desconto:** Criação, ativação/desativação e exclusão de cupons promocionais.
   * **Configurações da Loja:** Edição do número de WhatsApp, chave PIX, valor de frete fixo, meta de frete grátis e aviso do topo do site.
   * **Backup e Exportação:** Exportação de relatórios em **CSV (Excel)** e backup completo em JSON.

---

### Fase 5: Segurança de Produção, Cadastro de Clientes e Criptografia (`conta.html` e `minha-conta.html`)
1. **Cadastro Completo de Clientes (`conta.html`):**
   * Coleta obrigatória e validada de:
     * **Nome Completo** (nome e sobrenome);
     * **CPF** com validação matemática oficial dos 2 dígitos verificadores (Módulo 11 da Receita Federal) e máscara automática `000.000.000-00`;
     * **WhatsApp / Telefone** e **E-mail**;
     * **Endereço Completo de Entrega** (CEP com busca automática via ViaCEP, Logradouro, Número, Complemento, Bairro, Cidade e Estado/UF);
     * **Senha Forte** com medidor visual em tempo real (mínimo de 8 caracteres, letra maiúscula, letra minúscula, número e símbolo).
2. **Padrões de Segurança Cibernética Aplicados (`server/security.mjs`):**
   * **Senhas Irreversíveis (`scrypt` + Salt + Comparação Constant-Time):** Nenhuma senha é salva em texto puro; utiliza derivação criptográfica resistente a ataques de força bruta.
   * **CPF Criptografado em Repouso (`AES-256-GCM`) + Índice Cego (`HMAC-SHA256`):** No banco de dados, o CPF fica criptografado com padrão militar AES-256-GCM. Na tela do cliente, aparece mascarado (`***.456.789-00`).
   * **Sessões Seguras (`HttpOnly` + `SameSite=Lax`) e Proteção Anti-CSRF (`X-CSRF-Token`):** Impede roubo de sessão via scripts e falsificação de requisições.
   * **Bloqueio Automático de Força Bruta (Rate Limiting HTTP 429):** Bloqueia tentativas repetidas de adivinhação de senha no login.
   * **Cabeçalhos de Blindagem HTTP:** `Content-Security-Policy (CSP)`, `Strict-Transport-Security (HSTS)`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` e `Referrer-Policy`.

---

### Fase 6: Adequação Jurídica Completa e Portal LGPD (`termos-de-uso.html` e `termo-lgpd.html`)
1. **Trava Dupla de Aceite Obrigatório no Cadastro:**
   * O usuário só consegue concluir o cadastro após marcar explicitamente os dois termos independentes:
     1. **Termos e Condições Gerais de Uso e Compra (`termos-de-uso.html`):** Regula encomendas personalizadas, prazos de produção, regras de arrependimento (Art. 49 do CDC vs. produtos confeccionados sob medida com nome do cliente), propriedade intelectual das artes do ateliê e responsabilidades.
     2. **Termo de Consentimento para Tratamento de Dados Pessoais — LGPD (`termo-lgpd.html`):** Detalha na forma da Lei nº 13.709/2018 a finalidade de cada dado coletado (Nome, CPF para emissão fiscal/envio, Endereço para entrega, WhatsApp para aprovação de arte), base legal, segurança e direitos do titular.
   * **Registro de Prova Jurídica de Consentimento (`consent_logs`):** O banco grava a data/hora exata, versão dos termos (`v1.0-2026-11`), hash criptográfico do IP e navegador em que o cliente aceitou os termos.
2. **Portal do Titular LGPD (`minha-conta.html`):**
   * **Edição de Dados e Endereço:** Atualização cadastral imediata (Art. 18, III da LGPD).
   * **Portabilidade / Download de Dados em 1 Clique:** O cliente baixa um arquivo `.json` contendo todos os seus dados pessoais, endereço e recibos de consentimento (Art. 18, V da LGPD).
   * **Exclusão e Anonimização de Conta:** O cliente pode encerrar sua conta mediante confirmação de senha, revogando o consentimento e anonimizando seus dados identificáveis (Art. 18, VI e IX da LGPD).

---

### Fase 7: Banco de Dados em Nuvem (Supabase PostgreSQL) + Sistema Triplo Anti-Pausa (Keep-Alive)
1. **Arquitetura Relacional Completa no Supabase PostgreSQL (`supabase/migrations/002_full_ecommerce_and_keepalive.sql`):**
   * **11 Tabelas em Nuvem com Row Level Security (RLS) Ativada:**
     1. `public.users` (Clientes cadastrados com CPF criptografado AES-256-GCM e senha scrypt)
     2. `public.addresses` (Endereços completos dos clientes)
     3. `public.consent_logs` (Trilha imutável de aceite dos Termos de Uso e LGPD)
     4. `public.sessions` (Sessões autenticadas com token CSRF)
     5. `public.products` (Catálogo de produtos, preços e estoque em tempo real)
     6. `public.coupons` (Cupons de desconto ativos e regras de pedido mínimo)
     7. `public.orders` (Pedidos realizados no checkout, status e dados de entrega)
     8. `public.order_items` (Itens de cada pedido e detalhes de personalização sob demanda)
     9. `public.store_settings` (Configurações gerais do ateliê)
     10. `public.audit_logs` (Trilha de auditoria de segurança)
     11. `public.keep_alive_heartbeat` (Controle de atividade contínua do banco)
2. **Sistema Triplo de Keep-Alive (Para o Supabase Gratuito Nunca Pausar):**
   * Projetos gratuitos do Supabase pausam após 7 dias sem atividade. Para garantir que o site do ateliê **nunca fique fora do ar ou lento**, foram implementadas 3 camadas independentes de batimento cardíaco (*heartbeat*):
     * **Camada A (Interna no Servidor):** O servidor Node.js executa automaticamente a função `public.touch_keep_alive()` no PostgreSQL a cada **6 horas**.
     * **Camada B (Endpoint Público de Monitoramento):** A rota `GET /api/v1/health/keep-alive` realiza leitura e escrita real na tabela `keep_alive_heartbeat` do Supabase e devolve o contador total de batimentos.
     * **Camada C (Automação Externa via GitHub Actions):** O workflow `.github/workflows/supabase-keepalive.yml` roda automaticamente na nuvem do GitHub a cada **48 horas** (dias ímpares às 08:17 UTC), mantendo o banco ativo mesmo que nenhuma pessoa acesse o site durante feriados ou férias.

---

### Fase 8: Cofre Temporário de Imagens dos Clientes para Artes (Retenção de 7 Dias + Download Original)
1. **Envio de Múltiplas Imagens em Qualidade Original (`produto.html`):**
   * Nas peças personalizadas com foto (Polaroides, Quadros Decorativos, Ímãs de Geladeira, Capas com Foto), a cliente pode anexar **uma ou várias imagens originais** (JPG, PNG ou WebP até 8 MB cada).
   * Os arquivos são enviados **exatamente como a cliente selecionou** (sem perda de nitidez para impressão gráfica) para a tabela segura `public.order_attachments` no PostgreSQL, enquanto o navegador guarda apenas uma miniatura leve para pré-visualização instantânea.
2. **Download Fiel pela Administradora no Painel (`/painel-tp/`):**
   * Ao abrir os detalhes do pedido no painel, a Thaís visualiza cada arquivo anexado com nome original, tamanho em KB/MB, contador de dias restantes e o botão **"Baixar arquivo original"**.
   * Ao clicar, o sistema baixa a imagem original já renomeada com o código do pedido (`TP-2026-XXXX_nome-do-arquivo.jpg`) para facilitar a organização na pasta de produção do ateliê.
3. **Exclusão Automática Após 7 Dias (Economia de Banco + Conformidade LGPD):**
   * **Regra Automática de 7 Dias:** A função `public.purge_expired_order_images()` no PostgreSQL verifica continuamente os pedidos e, assim que completam **7 dias**, **apaga automaticamente os arquivos pesados de imagem do banco de dados**, mantendo apenas o registro histórico do pedido.
   * **Botão "Apagar imagens agora (Arte pronta)":** Caso a Thaís já tenha baixado as fotos e produzido a peça antes dos 7 dias, ela pode clicar em um botão no próprio pedido para liberar espaço imediatamente.

---

## 3. Mapa de Páginas e Rotas Entregues

| Página / Rota | Arquivo Principal | Finalidade |
| :--- | :--- | :--- |
| **Início (Institucional)** | `index.html` | Apresentação da marca, vitrine das 8 linhas, modos de compra, depoimentos e FAQ |
| **Catálogo da Loja** | `loja.html` | Busca e filtragem de produtos a Pronta Entrega e Sob Demanda |
| **Página de Produto** | `produto.html` | Detalhes técnicos, controle de estoque e configurador de personalização com prévia de foto |
| **Checkout & Pedido** | `checkout.html` | Fechamento de compra, cálculo de frete, cupom e integração com WhatsApp |
| **Rastreio de Pedido** | `pedido.html` | Consulta pública de status do pedido em 5 etapas pelo código `TP-2026-XXXX` |
| **Login & Cadastro** | `conta.html` | Criação de conta (Nome, CPF, Endereço, Senha forte) com aceite obrigatório de Termos + LGPD |
| **Minha Conta & LGPD** | `minha-conta.html` | Painel do cliente logado, edição de endereço, portabilidade JSON e exclusão de conta |
| **Termos de Uso** | `termos-de-uso.html` | Contrato completo de uso do site, encomendas personalizadas, trocas e direitos autorais |
| **Termo LGPD** | `termo-lgpd.html` | Termo de Consentimento para Tratamento de Dados Pessoais (Lei nº 13.709/2018) |
| **Política de Privacidade** | `politica-de-privacidade.html` | Diretrizes gerais de privacidade e cookies |
| **Painel Administrativo** | `painel-tp/index.html` | Gestão restrita de pedidos, estoque, preços, cupons e relatórios CSV |

---

## 4. Auditoria de Qualidade e Testes Automatizados Executados

* **Validador Estrutural, SEO e Acessibilidade (`validar_site.py`):**
  * **500 verificações aprovadas com 0 erros bloqueantes** (HTML semântico, contraste WCAG AA, tags Open Graph, Schema.org JSON-LD `Store` + `LocalBusiness`, `sitemap.xml`, `robots.txt` e `llms.txt`).
* **Suíte Automatizada de Segurança e Integração Supabase PostgreSQL (`tests/security-auth.test.mjs`):**
  * Teste 0: Batimento cardíaco Keep-Alive gravando no Supabase PostgreSQL (`PASS`).
  * Teste 0b: Sincronização de catálogo, estoque e cupons via PostgreSQL (`PASS`).
  * Teste 1: Bloqueio de cadastro sem aceite dos Termos de Uso ou do Termo LGPD (`PASS`).
  * Teste 2: Rejeição de CPF inválido e senha fraca (`PASS`).
  * Teste 3: Criação de conta com criptografia AES-256-GCM do CPF, hash scrypt da senha e gravação de log LGPD no Supabase (`PASS`).
  * Teste 4: Proteção contra ataque CSRF em alterações cadastrais (`PASS`).
  * Teste 5: Atualização de endereço e exportação de pacote de portabilidade LGPD (`PASS`).
  * Teste 6: Bloqueio automático de ataque de força bruta no login com HTTP 429 (`PASS`).
  * Teste 7: Direito ao esquecimento LGPD com exclusão e anonimização no PostgreSQL (`PASS`).

---

## 5. Guia Rápido de Operação para a Cliente (Thaís de Paula)

1. **Para gerenciar pedidos, estoque e cupons:**
   * Acesse `/painel-tp/` no navegador.
   * Digite a senha administrativa configurada (padrão inicial: `thais2026`, podendo ser alterada na aba *Configurações* do painel).
2. **Quando um cliente fizer um pedido:**
   * O pedido ficará salvo automaticamente no banco de dados em nuvem (aba **Pedidos** do painel) **e** chegará formatado no seu WhatsApp `(43) 98422-1611`.
   * Conforme você avançar na produção, basta mudar o status do pedido no painel (*Pagamento Confirmado* → *Em Produção* → *Pronto/Postado* → *Entregue*) para que o cliente acompanhe pelo link dele.
3. **Para cadastrar ou alterar estoque de Pronta Entrega:**
   * Na aba **Produtos & Estoque**, use os botões `+1` e `-1` ou clique em **Editar** para ajustar preços, fotos e descrições. Todas as alterações são salvas diretamente no banco em nuvem do Supabase.
