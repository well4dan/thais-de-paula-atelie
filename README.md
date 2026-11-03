# Thaís de Paula Ateliê · Site Institucional + E-commerce (Demonstração)

Site completo de apresentação e loja online demonstrativa para o **Thaís de Paula Ateliê** ("Transformando papel em momentos especiais"), construído a partir dos cartões oficiais e do flyer das 8 linhas de produtos.

## Como abrir e testar

Basta servir a pasta raiz com qualquer servidor estático:

```bash
npx serve .
# ou
python3 -m http.server 8080
```

Depois acesse `http://localhost:8080`.

## Páginas e funcionalidades

- **Início (`/index.html`):** Hero com cascata de polaroides, valores da marca, bento interativo das 8 linhas do flyer, comparativo *Sob demanda × Pronta entrega*, passo a passo, vitrine de destaques, história do ateliê com os cartões originais e FAQ.
- **Loja (`/loja.html`):** Catálogo das 16 peças (2 por linha, entre pronta entrega e sob demanda), busca instantânea, filtro por linha, filtro por disponibilidade e ordenação.
- **Produto (`/produto.html?p=caderno-floral-personalizado`):** Escolha de variações, campos de personalização (nome, tema, observações), upload de foto com redimensionamento automático e prévia ao vivo antes de adicionar ao carrinho.
- **Carrinho (gaveta lateral):** Resumo da personalização, controle de quantidade respeitando estoque e barra de progresso para frete grátis.
- **Checkout (`/checkout.html`):** Cupom de desconto (teste `BEMVINDA10` ou `ATELIE15`), opção de retirada combinada pelo WhatsApp ou envio pelos Correios, e **pagamento simulado** (Pix com aprovação imediata, Cartão de crédito de teste com preenchimento em 1 clique, ou Boleto simulado).
- **Acompanhamento de Pedido (`/pedido.html`):** Linha do tempo do status da encomenda, botão para simular aprovação de pagamento pendente e botão para enviar o resumo direto para o WhatsApp do ateliê.
- **Painel Admin Oculto (`/painel-tp/`):**
  - **URL:** `/painel-tp/` (sem link público no site e com cabeçalho `X-Robots-Tag: noindex, nofollow`).
  - **PIN padrão da demonstração:** `2611`
  - **Recursos:** indicadores (faturamento simulado, pedidos, ticket médio), gráfico dos últimos 14 dias, gestão de pedidos com mudança de status em tempo real e download da foto enviada pelo cliente, cadastro/edição de produtos e estoque, cupons, configurações de frete/WhatsApp, exportação CSV e botão para restaurar os dados da demonstração.
