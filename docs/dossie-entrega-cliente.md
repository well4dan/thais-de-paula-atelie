# Dossiê Executivo e Técnico de Entrega do Projeto
## Thaís de Paula Ateliê · Papelaria Personalizada & Presentes Afetivos

**Cliente:** Thaís de Paula Ateliê (`@thaisdepaulatelie`)  
**WhatsApp Oficial Integrado:** `(43) 98422-1611`  
**Slogan Oficial:** *"Transformando papel em momentos especiais."*  
**Status do Documento:** Versão 1.1 (Em atualização contínua até a emissão final em PDF)  
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
   * **Vitrine das 12 Linhas Oficiais do Ateliê:**
     1. *Cadernos Personalizados* (Universitário, Colegial, A5, Devocional, Pedagógico)
     2. *Agendas Personalizadas* (Diária datada 1 dia por página e Agenda permanente floral)
     3. *Planners* (Planner anual personalizado com abas divisórias e Planner semanal de mesa)
     4. *Calendários* (Calendário de mesa personalizado com 12 fotos ou floral e Calendário A6)
     5. *Livros de Maternidade* (Livro do bebê e maternidade com caixa de recordações e Caderneta de saúde/vacinação personalizada)
     6. *Blocos de Notas* (Bloco personalizado e Kit bloco com caneta)
     7. *Lápis Personalizados* (Kits com nome gravado e ponteira)
     8. *Fotos Polaroide* (Kits com legenda personalizada, varal de polaroides e prévia de corte ao vivo)
     9. *Quadros Decorativos em MDF* (Com foto da família ou do pet)
     10. *Adesivos em Vinil* (À prova d'água com recorte eletrônico)
     11. *Etiquetas Escolares* (Kits completos termocolantes e vinílicos resistentes à água)
     12. *Ímãs de Geladeira* (Foto-ímãs recortados e duplas ilustradas)
   * **Seção Sobre o Ateliê, Depoimentos de Clientes e Perguntas Frequentes (FAQ).**

---

### Fase 2: Loja Virtual Híbrida (`loja.html` e `produto.html`)
1. **Catálogo Completo com 24 Produtos em 12 Linhas (`loja.html`):**
   * Filtros instantâneos por **Modalidade** (*Todos*, *Pronta Entrega*, *Sob Demanda*), **Categoria** (as 12 linhas do ateliê), **Busca por texto** e **Ordenação** (*Destaques*, *Menor Preço*, *Maior Preço*, *Ordem Alfabética*).
   * Badges dinâmicos de disponibilidade: indicação exata de unidades restantes na Pronta Entrega (`Últimas X un.`) ou prazo de produção no Sob Demanda (`Sob demanda · 3 a 5 dias`).
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
     2. **Termo de Consentimento para Tratamento de Dados Pessoais (LGPD) (`termo-lgpd.html`):** Detalha na forma da Lei nº 13.709/2018 a finalidade de cada dado coletado (Nome, CPF para emissão fiscal/envio, Endereço para entrega, WhatsApp para aprovação de arte), base legal, segurança e direitos do titular.
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
2. **Download Fiel Individual e Pacote Completo em `.ZIP` no Painel (`/painel-tp/`):**
   * Ao abrir os detalhes do pedido no painel (ou diretamente na tabela de pedidos), a Thaís conta com o botão **"Baixar todas as fotos (.ZIP)"**.
   * O sistema gera instantaneamente um arquivo único `TP-2026-XXXX-fotos-cliente.zip` contendo:
     * Todas as fotos originais numeradas em ordem (`01_...`, `02_...`);
     * Um arquivo de texto `LEIAME-TP-2026-XXXX.txt` com o nome da cliente, WhatsApp e todas as instruções de personalização de cada item para facilitar a produção na gráfica/ateliê.
   * Também é possível baixar cada arquivo individualmente clicando em **"Baixar arquivo original"**.
3. **Exclusão Automática Após 7 Dias (Economia de Banco + Conformidade LGPD):**
   * **Regra Automática de 7 Dias:** A função `public.purge_expired_order_images()` no PostgreSQL verifica continuamente os pedidos e, assim que completam **7 dias**, **apaga automaticamente os arquivos pesados de imagem do banco de dados**, mantendo apenas o registro histórico do pedido.
   * **Botão "Apagar imagens agora (Arte pronta)":** Caso a Thaís já tenha baixado as fotos e produzido a peça antes dos 7 dias, ela pode clicar em um botão no próprio pedido para liberar espaço imediatamente.

---

### Fase 9: Painel Blindado no Servidor e Download Rápido das Fotos em `.ZIP`
1. **Acesso ao painel com e-mail e senha validados no servidor:**
   * O antigo PIN de demonstração era conferido apenas no navegador. Agora, quando o site roda com o servidor, a entrada no `/painel-tp/` exige **e-mail e senha da administradora**, conferidos no servidor.
   * A senha nunca fica gravada em texto: o servidor guarda só uma "impressão digital" criptográfica (hash `scrypt`), gerada pelo comando `npm run admin:hash`.
   * A sessão do painel dura **8 horas**, usa um cookie protegido (`HttpOnly` e `SameSite=Strict`), exige token anti-falsificação (CSRF) em toda alteração e bloqueia o acesso por **15 minutos** após 5 senhas erradas.
   * Ao clicar em sair, os pedidos com dados das clientes são apagados do navegador usado.
2. **Dados das clientes fechados para o público:**
   * A vitrine pública recebe só catálogo, cupons ativos e configurações da loja. Pedidos, nomes, telefones, endereços e fotos ficam disponíveis **somente para a administradora logada**.
   * Todas as ações do painel (alterar status, produtos, cupons, configurações, baixar e apagar fotos, gerar `.ZIP`) passaram a ser recusadas pelo servidor sem login.
3. **Rastreio de pedido com confirmação do telefone (`pedido.html`):**
   * Para consultar um pedido feito em outro aparelho, a cliente informa o código `TP-2026-XXXX` **e os 4 últimos dígitos do telefone** usado na compra. A resposta mostra apenas status, prazo e itens, sem nenhum dado pessoal.
4. **`.ZIP` das fotos mais rápido e leve:**
   * O download começa assim que a primeira foto sai do banco, com barra de progresso real no navegador, em vez de esperar o pacote inteiro ficar pronto.
   * As fotos trafegam do banco em formato mais compacto (cerca de **30 a 45% menos tempo de transferência** que antes) e são buscadas em lotes, poucas de cada vez.
   * Em um pedido grande (12 fotos de 8 MB), o servidor passou a usar **5,5 vezes menos processamento** e **3,4 vezes menos memória**.
   * Foto com mais de 7 dias nunca entra no pacote, mesmo antes da limpeza automática rodar.
5. **Etapas do pedido chegam sozinhas para a cliente:**
   * Quando a Thaís muda a etapa no painel, a página do pedido da cliente se atualiza sozinha: ao abrir, a cada minuto enquanto estiver aberta e ao voltar para ela.
   * Em **Minha conta**, a cliente logada vê todos os pedidos feitos com a conta dela, de qualquer celular ou computador, sempre com a etapa atual.
6. **Versão de apresentação continua funcionando:**
   * Na versão publicada só para demonstração (sem servidor), o painel abre em **modo demonstração** com PIN e dados fictícios salvos apenas no navegador.

---

### Fase 10: Controle da Vitrine, Banners, Popup e Faixas Promocionais pelo Painel (`005_site_content.sql`)
1. **Nova Aba "Site e Vitrine" no Painel (`/painel-tp/`):**
   * **Vitrine da Página Inicial:** A Thaís escolhe até 12 produtos e define a ordem exata em que aparecem na Home (arrastando ou pelas setas). Produtos sem estoque na pronta entrega ou ocultos saem sozinhos da vitrine.
   * **Banners do Topo, do Meio e Popup:** Criação de banners com imagem convertida automaticamente para WebP leve, título, subtítulo, botão com link e agendamento opcional de data/hora de início e fim.
   * **Faixas Promocionais no Topo:** Avisos rápidos no topo de todas as páginas (ex.: *"Frete grátis acima de R$ 199"* ou *"Agenda de Natal aberta"*), com cores oficiais da paleta da marca e agendamento por período.
   * **Preços Promocionais ("De / Por") e Selos nos Produtos:** Suporte a preço antigo riscado (*"De R$ 89,90 por R$ 74,90"*), foto própria enviada direto pelo painel e selos automáticos ou manuais (*Novidade*, *Mais vendido*, *Promoção* e *Últimas unidades*).

---

### Fase 11: Blindagem Financeira no Servidor e Preparação para Gateway de Pagamento (`006_payments_and_financial_lock.sql`)
1. **Recálculo de Valores 100% no Servidor (Zero Fraude de Preço):**
   * Ao fechar um pedido no checkout, o servidor ignora qualquer valor enviado pelo navegador e recalcula no banco de dados PostgreSQL o preço unitário de cada produto, adicionais escolhidos, cupom de desconto e regra de frete.
   * O estoque de produtos a pronta entrega é verificado e reservado dentro da mesma transação segura (`SELECT ... FOR UPDATE`), impedindo venda duplicada da última unidade.
2. **Estrutura Pronta para Gateway (Asaas / PIX / Cartão / Boleto):**
   * Criado o módulo [server/payments.mjs](file:///home/wellington/Projetos/SITES/Thais%20de%20Paula/server/payments.mjs) já compatível com a API oficial do **Asaas** (e operável em modo simulação até que a conta da cliente seja conectada no `.env`).
   * Implementado o receptor oficial de notificações automáticas de pagamento (**Webhook `POST /api/v1/webhooks/payment`**) com validação criptográfica (`asaas-access-token` e `HMAC-SHA256`), conferência do valor pago e tabela `payment_webhook_events` para nunca processar um mesmo pagamento duas vezes.
3. **Bloqueio de Cupons de Primeira Compra e Cupons Já Utilizados (`007_coupon_usage_lock.sql`):**
   * Cupons marcados como **Exclusivo 1ª compra** (como `BEMVINDA10`) são bloqueados automaticamente se o cliente (por conta logada, e-mail ou WhatsApp) já possuir qualquer pedido real anterior.
   * Cupons marcados como **uso único por cliente** (como `ATELIE15`) são gravados na tabela `coupon_redemptions` e bloqueados em tentativas de reutilização pela mesma pessoa. Se um pedido for cancelado, o sistema libera o cupom automaticamente.
4. **CPF Protegido por LGPD no Checkout e QR Code PIX / Fatura na Página do Pedido (`checkout.html` e `pedido.html`):**
   * Adicionado campo de **CPF validado** no checkout (preenchido automaticamente quando a cliente já tem conta), permitindo emissão imediata de nota/cobrança no **Asaas** sem gravar o CPF aberto nos pedidos (apenas mascarado `***.456.789-00`).
   * A página do pedido (`pedido.html`) já exibe o **QR Code PIX**, botão **Copiar PIX (Copia e Cola)**, linha digitável de boleto e botão direto para a **fatura segura no Asaas**.
5. **Frete Híbrido: Motoboy Regional + Transportadora Loggi (`008_shipping_loggi_and_motoboy.sql`):**
   * **Cambé / PR:** Entrega via Motoboy com valor fixo de **R$ 10,00** identificado automaticamente pelo CEP ou cidade.
   * **Londrina / PR:** Entrega via Motoboy com valor fixo de **R$ 20,00** identificado automaticamente pelo CEP ou cidade.
   * **Demais cidades do Brasil:** Cotação automática para envio pela **Transportadora Loggi** (`server/shipping-loggi.mjs`), com botão **"Gerar envio na Loggi"** direto no painel da Thaís para emitir o código e link de rastreio.
6. **Autopreenchimento Instantâneo de Endereço por CEP (BrasilAPI + ViaCEP + OpenCEP):**
   * Ao digitar o CEP no **Cadastro de Conta**, na área **Minha Conta** ou no **Checkout**, o sistema consulta automaticamente 3 bases oficiais gratuitas em cascata com cache de 24h, preenchendo Rua, Bairro, Cidade e Estado sem erro de digitação e já calculando o frete correto na mesma hora.
7. **Controle de Upload de Fotos por Produto e por Linha no Painel (`/painel-tp/`):**
   * Na aba **Produtos & Estoque**, a coluna **Upload de Fotos** permite habilitar ou desabilitar com um clique quais peças aceitam envio de imagens pelo cliente (e escolher se o envio é **opcional** ou **obrigatório**), além de contar com filtro por linha (ex.: *Cadernos personalizados*) e botões em lote (**Ativar/Desativar upload de fotos nesta linha**) que preservam todas as opções de personalização do produto (nome, tamanho, miolo, tema).

---

## 3. Mapa de Páginas e Rotas Entregues

| Página / Rota | Arquivo Principal | Finalidade |
| :--- | :--- | :--- |
| **Início (Institucional)** | `index.html` | Apresentação da marca, vitrine das 8 linhas, modos de compra, depoimentos e FAQ |
| **Catálogo da Loja** | `loja.html` | Busca e filtragem de produtos a Pronta Entrega e Sob Demanda |
| **Página de Produto** | `produto.html` | Detalhes técnicos, controle de estoque e configurador de personalização com prévia de foto |
| **Checkout & Pedido** | `checkout.html` | Fechamento de compra, cálculo de frete, cupom e integração com WhatsApp |
| **Rastreio de Pedido** | `pedido.html` | Consulta pública de status do pedido em 5 etapas pelo código `TP-2026-XXXX` + 4 últimos dígitos do telefone |
| **Login & Cadastro** | `conta.html` | Criação de conta (Nome, CPF, Endereço, Senha forte) com aceite obrigatório de Termos + LGPD |
| **Minha Conta & LGPD** | `minha-conta.html` | Painel do cliente logado, edição de endereço, portabilidade JSON e exclusão de conta |
| **Termos de Uso** | `termos-de-uso.html` | Contrato completo de uso do site, encomendas personalizadas, trocas e direitos autorais |
| **Termo LGPD** | `termo-lgpd.html` | Termo de Consentimento para Tratamento de Dados Pessoais (Lei nº 13.709/2018) |
| **Política de Privacidade** | `politica-de-privacidade.html` | Diretrizes gerais de privacidade e cookies |
| **Painel Administrativo** | `painel-tp/index.html` | Gestão restrita (login com e-mail e senha) de pedidos, estoque, preços, cupons, fotos das clientes e relatórios CSV |

---

## 4. Auditoria de Qualidade e Testes Automatizados Executados

* **Validador Estrutural, SEO e Acessibilidade (`validar_site.py`):**
  * **500 verificações aprovadas com 0 erros bloqueantes** (HTML semântico, contraste WCAG AA, tags Open Graph, Schema.org JSON-LD `Store` + `LocalBusiness`, `sitemap.xml`, `robots.txt` e `llms.txt`).
* **Suíte Automatizada de Segurança e Integração Supabase PostgreSQL (`tests/security-auth.test.mjs`):**
  * Teste 0: Batimento cardíaco Keep-Alive gravando no Supabase PostgreSQL (`PASS`).
  * Teste 0b: Vitrine pública com catálogo, estoque e cupons, sem nenhum pedido ou dado de cliente (`PASS`).
  * Teste 0c: As 13 rotas do painel recusam acesso sem login; login da administradora com cookie protegido, CSRF obrigatório e bloqueio após 5 senhas erradas (`PASS`).
  * Teste 0d: Rastreio público exige os 4 últimos dígitos do telefone e não devolve dados pessoais (`PASS`).
  * Teste 1: Bloqueio de cadastro sem aceite dos Termos de Uso ou do Termo LGPD (`PASS`).
  * Teste 2: Rejeição de CPF inválido e senha fraca (`PASS`).
  * Teste 3: Criação de conta com criptografia AES-256-GCM do CPF, hash scrypt da senha e gravação de log LGPD no Supabase (`PASS`).
  * Teste 4: Proteção contra ataque CSRF em alterações cadastrais (`PASS`).
  * Teste 5: Atualização de endereço e exportação de pacote de portabilidade LGPD (`PASS`).
  * Teste 6: Bloqueio automático de ataque de força bruta no login com HTTP 429 (`PASS`).
  * Teste 4b: "Minha conta" exige login e lista só os pedidos da própria cliente, com a etapa atualizada pelo ateliê (`PASS`).
  * Teste 7: Direito ao esquecimento LGPD com exclusão e anonimização no PostgreSQL (`PASS`).
  * Teste 8: Foto original enviada pela cliente baixada byte a byte idêntica (individual e dentro do `.ZIP`, com conferência de CRC-32), foto vencida fora do pacote e expurgo após 7 dias com `HTTP 410` (`PASS`).
  * Testes 9, 10 e 11 + `tests/site-content.test.mjs`: Blindagem financeira (V7), Webhook Asaas idempotente, bloqueio de cupons de 1ª compra/reutilizados, frete híbrido Motoboy (Cambé R$ 10 / Londrina R$ 20) + Loggi, API gratuita de CEP, vitrine/banners e alternância de upload de fotos por produto preservando opções no PostgreSQL (`PASS`).
  * **Resultado da última execução (16/11/2026): 29 de 29 testes aprovados, 0 falhas.**

---

## 5. Guia Rápido de Operação para a Cliente (Thaís de Paula)

1. **Para gerenciar pedidos, estoque e cupons:**
   * Acesse `/painel-tp/` no navegador.
   * Entre com o **e-mail e a senha da administradora**. Eles são definidos pelo responsável técnico com o comando `npm run admin:hash`, e a senha não fica escrita em nenhuma tela ou arquivo do site. Para trocar a senha, peça ao responsável técnico para rodar o comando de novo.
   * Por segurança, o painel pede login de novo a cada 8 horas e bloqueia por 15 minutos depois de 5 senhas erradas.
2. **Quando um cliente fizer um pedido:**
   * O pedido ficará salvo automaticamente no banco de dados em nuvem (aba **Pedidos** do painel) **e** chegará formatado no seu WhatsApp `(43) 98422-1611`.
   * Conforme você avançar na produção, basta mudar o status do pedido no painel (*Pagamento Confirmado* → *Em Produção* → *Pronto/Postado* → *Entregue*) para que o cliente acompanhe pelo link dele (com o código do pedido e os 4 últimos dígitos do telefone).
3. **Para pegar as fotos de um pedido personalizado:**
   * Na aba **Pedidos**, clique em **Baixar .ZIP**. O download começa na hora e traz todas as fotos originais numeradas + o arquivo `LEIAME` com as instruções de cada item.
   * Depois de produzir a arte, clique em **Apagar imagens agora (Arte pronta)**. Se esquecer, o sistema apaga sozinho após 7 dias.
4. **Para cadastrar ou alterar estoque de Pronta Entrega:**
   * Na aba **Produtos & Estoque**, use os botões `+1` e `-1` ou clique em **Editar** para ajustar preços, fotos e descrições. Todas as alterações são salvas diretamente no banco em nuvem do Supabase.
5. **Para habilitar ou desabilitar o upload de fotos em um produto ou linha (ex.: Cadernos):**
   * Na aba **Produtos & Estoque**, selecione a linha desejada no filtro **Linha** (ex.: *Cadernos personalizados*) e clique em **Ativar upload de fotos nesta linha** ou **Desativar upload de fotos nesta linha**.
   * Para controlar produto por produto, marque ou desmarque **Aceita fotos** diretamente na coluna **Upload de Fotos** da tabela (e selecione se a foto é **Opcional** ou **Obrigatória**), ou ajuste dentro de **Editar**. Na loja pública, apenas os produtos marcados exibirão o campo de envio de fotos.
