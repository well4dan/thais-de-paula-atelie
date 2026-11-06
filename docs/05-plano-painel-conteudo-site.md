# Plano de Implementação - Thaís de Paula Ateliê (Rodada 05)

**Perfil:** P2 · **Data:** 2026-11-06 · **Versão do plano:** 1
**Ordem acordada:** esta rodada vem antes dos e-mails automáticos ([04-plano-emails-status-pedido.md](04-plano-emails-status-pedido.md)), que passam a usar a migração 006.

## 1. Resumo executivo
O painel vira o controle da vitrine do site. A Thaís passa a montar sozinha, sem mexer em código:
- a vitrine da página inicial, escolhendo e ordenando os produtos;
- banners no topo, no meio da página e em popup;
- faixas promocionais com agendamento por data;
- foto própria de cada produto, preço promocional e selos.

Tudo tem prévia, liga/desliga e datas de início e fim.

Sucesso medido por:
- qualquer mudança salva no painel aparece no site em até 60 s;
- nenhuma imagem pública passa de 400 KB;
- a página inicial não perde nota de desempenho (LCP ≤ 2,5 s, CLS ≤ 0,1);
- toda escrita é exclusiva da administradora.

## 2. Regras de negócio (testáveis)
| # | Regra |
|---|---|
| R1 | Banner e faixa só aparecem se `ativo = sim` **e** a data atual estiver entre início e fim (vazio = sem limite). O filtro é feito no servidor. |
| R2 | **Banner do topo:** com 1 ou mais ativos, eles substituem a área principal do topo em carrossel (troca a cada 6 s, pausa ao passar o mouse ou focar, setas e bolinhas acessíveis). Sem banner ativo, volta o topo atual com as polaroides. |
| R3 | **Banner do meio:** aparece como faixa larga entre "Como funciona" e a vitrine. Com vários, vira carrossel. |
| R4 | **Popup:** no máximo 1 popup ativo por vez (o mais recente vence). Abre depois de X segundos (mínimo 3), na página inicial e na loja, nunca no checkout, no pedido, na conta ou no painel. A frequência é escolhida: 1 vez por visita, 1 vez por dia ou 1 vez só. Fecha no X, no Esc e clicando fora. |
| R5 | **Faixa promocional:** fica no topo de todas as páginas públicas. Com várias ativas, alternam a cada 5 s. A cliente pode fechar (volta na próxima visita). Cores só da paleta da marca, para manter contraste AA. |
| R6 | **Vitrine da home:** a Thaís escolhe até 12 produtos e a ordem (arrastar ou setas). Produto oculto ou sem estoque na pronta entrega sai da vitrine automaticamente, sem perder a posição dos outros. |
| R7 | **Preço promocional:** "de R$ X por R$ Y" só aparece se o preço "de" for maior que o preço atual. O carrinho e o checkout sempre usam o preço atual. |
| R8 | **Selos:** Novidade, Promoção, Mais vendido e Últimas unidades. Promoção é automático com preço "de"; Últimas unidades é automático com estoque ≤ 3. |
| R9 | **Imagens:** JPG, PNG ou WebP até 10 MB entram no painel e são convertidas no navegador para WebP (lado maior 1920 px nos banners, 1200 px nos produtos). Ficam com até 400 KB, e o servidor recusa acima de 600 KB. O texto alternativo é obrigatório. |
| R10 | Links de botões aceitam só endereço do próprio site (`/loja.html`, `/produto.html?p=...`), `https://` ou WhatsApp (`https://wa.me/...`). `javascript:` e similares são recusados. |

## 3. Escopo
**Nesta rodada:** os 5 módulos acima + biblioteca de imagens + nova aba **"Site e vitrine"** no painel + selos e "de / por" nos cards, na página do produto e na loja.

**Fora desta rodada:**
- editar textos fixos das seções (sobre, dúvidas, etapas);
- mudar a ordem das seções da home;
- galeria com várias fotos por produto;
- rascunho com publicação agendada do site inteiro;
- teste A/B.

Isso fica para uma próxima rodada.

## 4. Decisões arquiteturais
| # | Decisão | Alternativa descartada | Motivo | Custo de reverter |
|---|---|---|---|---|
| 1 | Imagens convertidas para WebP **no navegador da Thaís** antes do envio | Converter no servidor (`sharp`) | `sharp` é dependência nativa pesada; o canvas resolve e já chega leve | Baixo |
| 2 | Imagens públicas em tabela `media_assets` (BYTEA), servidas em `/media/<hash>.webp` com cache de 1 ano (`immutable`) + cache em memória no servidor | Supabase Storage | Sem serviço nem chave nova agora; o endereço muda quando a imagem muda, então o navegador baixa cada uma uma vez só. Migrável depois | Médio |
| 3 | O servidor injeta o conteúdo ativo na própria página HTML (`<script type="application/json" id="site-content">`), com cache em memória invalidado a cada salvamento no painel | Página buscar por `fetch` depois de abrir | Sem ida extra ao servidor e sem "pulo" de layout; a CSP continua sem `unsafe-inline`, porque JSON não executa | Baixo |
| 4 | Sem servidor (Vercel de demonstração), a home mostra o conteúdo padrão atual | - | A demo continua funcionando | - |
| 5 | Vitrine por coluna `products.home_order` (vazia = fora da home) | Tabela separada | Menos JOIN; uma consulta só | Baixo |
| 6 | Painel dividido em módulos (`js/admin/site-content.js`, `media-upload.js`, `sortable.js`) | Crescer o `app.js` (já com 615 linhas) | Limite de 400 linhas por arquivo do protocolo | Baixo |
| 7 | Arrastar e soltar com alternativa por teclado (setas ↑ ↓) | Só mouse | Acessibilidade | - |

## 5. Modelo de dados (migração `005_site_content.sql`, não destrutiva)
| Tabela / coluna | Conteúdo | RLS |
|---|---|---|
| `media_assets` | `id`, `sha256` (único), `mime` (`image/webp`), `width`, `height`, `size_bytes ≤ 614400`, `data BYTEA`, `alt_text`, `created_at` | ativa, sem política pública |
| `site_banners` | `id`, `placement` (`topo` / `meio` / `popup`), `title ≤ 80`, `subtitle ≤ 160`, `cta_label ≤ 30`, `cta_url ≤ 300`, `image_id` → media, `image_mobile_id` (opcional), `theme` (claro/escuro para o texto), `sort_order`, `active`, `starts_at`, `ends_at`, `popup_delay_s ≥ 3`, `popup_frequency` (`visita` / `dia` / `uma_vez`), datas de criação e alteração | ativa |
| `site_announcements` | `id`, `text ≤ 140`, `link_url`, `link_label ≤ 30`, `theme` (`rosa` / `salvia` / `cacau` / `dourado`), `sort_order`, `active`, `starts_at`, `ends_at`, `dismissible` | ativa |
| `products.home_order` | `INT NULL` (posição na vitrine) | já ativa |
| `products.image_id` | foto própria (→ media); se vazia, usa a imagem atual | já ativa |
| `products.compare_at_price` | `INT NULL CHECK (> 0)` | já ativa |
| `products.badges` | `TEXT[]` com valores de uma lista fixa (`novidade`, `mais_vendido`) | já ativa |

A migração copia os produtos com `featured = true` para `home_order`, mantendo a vitrine de hoje.

## 6. Contratos de API
| Rota | Método | Auth | Saída / regra |
|---|---|---|---|
| `/media/<sha256>.webp` | GET | público | imagem com `Cache-Control: public, max-age=31536000, immutable`; 404 se não existir |
| `/api/v1/admin/media` | POST | admin + CSRF | recebe WebP em base64; confere a assinatura do arquivo (RIFF/WEBP), tamanho e dimensões; devolve `{ id, url }` (mesmo hash = mesma imagem) |
| `/api/v1/admin/banners` | GET / POST / PUT / DELETE | admin + CSRF nas escritas | CRUD com validação R1, R4 e R10 |
| `/api/v1/admin/banners/order` | PUT | admin + CSRF | nova ordem por posição |
| `/api/v1/admin/announcements` | GET / POST / PUT / DELETE | admin + CSRF | CRUD com validação R5 e R10 |
| `/api/v1/admin/showcase` | PUT | admin + CSRF | lista ordenada de até 12 ids de produto (R6) |
| `/api/v1/store/products` | POST | admin + CSRF | passa a aceitar `imageId`, `compareAtPrice`, `badges` |
| `/api/v1/store/snapshot` | GET | público | produtos com `imageUrl`, `compareAtPrice`, `badges`, `homeOrder` |
| HTML de `/`, `/loja.html`, `/produto.html`, demais páginas públicas | GET | público | `#site-content` com faixas ativas (todas as páginas) + banners e popup (home e loja) |

## 7. Matriz de autorização
| Papel | Mídia | Banners / faixas / vitrine | Produtos |
|---|---|---|---|
| Visitante | R (só a imagem pública) | R (só ativos e no período) | R (só ativos) |
| Cliente logada | igual ao visitante | igual ao visitante | igual ao visitante |
| Admin | C R | C R U D | C R U D |

## 8. Etapas
| # | Objetivo | Arquivos principais | Critério de pronto | Risco | Esforço |
|---|---|---|---|---|---|
| 1 | Migração 005 + biblioteca de mídia (envio validado, entrega com cache longo e cache em memória) | `supabase/migrations/005_site_content.sql`, `server/media.mjs` (novo), `server.mjs`, `server/admin-routes.mjs` | imagem enviada no painel abre em `/media/...` com cache de 1 ano | 🟡 | M |
| 2 | API de banners, faixas e vitrine + campos novos de produto + injeção do conteúdo no HTML com invalidação | `server/site-content.mjs` (novo), `server/db.mjs`, `server.mjs` | conteúdo fora do período nunca sai do servidor; salvar no painel reflete na hora | 🟡 | G |
| 3 | Site público: faixa no topo, carrossel do topo, banner do meio, popup, vitrine ordenada, selos e "de / por" | `js/site-content.js` (novo), `js/home.js`, `js/ui.js`, `js/product.js`, `css/site-content.css` (novo), páginas HTML | testado em 360, 768 e 1280 px; teclado e leitor de tela; `prefers-reduced-motion` | 🟡 | G |
| 4 | Painel: aba "Site e vitrine" com Faixas, Banners (topo, meio, popup) e Vitrine (arrastar e soltar), envio de imagem com conversão, recorte e prévia; produto com foto própria, preço "de" e selos | `js/admin/site-content.js`, `js/admin/media-upload.js`, `js/admin/sortable.js` (novos), `js/admin/app.js`, `painel-tp/index.html`, `css/admin.css` | fluxo completo feito no navegador do app | 🟡 | G |
| 5 | Testes (autorização de todas as rotas novas, R1 a R10, URL maliciosa, imagem falsa ou grande demais), pre-flight de design, dossiê e handover (LOG-012) | `tests/`, `docs/`, `CLAUDE_HANDOVER_LOG.md` | `npm test` verde, zero 🔴 na revisão | 🟢 | M |

Checkpoints para você validar: depois da etapa 3 (como o site fica) e depois da etapa 4 (usar o painel).

## 9. Riscos
| Risco | Mitigação |
|---|---|
| Banner pesado deixar a home lenta | Conversão para WebP ≤ 400 KB, `fetchpriority="high"` só no 1º banner do topo, demais com `loading="lazy"`, proporção reservada para não "pular" |
| Popup irritar ou ser penalizado pelo Google no celular | Atraso mínimo de 3 s, nunca cobre a tela toda no celular, frequência controlada, fecha fácil |
| Texto do banner ilegível sobre a foto | Tema claro/escuro por banner + véu de contraste automático atrás do texto |
| Banco crescer com imagens | Limite de 600 KB por imagem, mesma imagem não duplica (hash); botão para remover imagem sem uso |
| Link malicioso num botão | Validação R10 no servidor + renderização só por `textContent`/atributos seguros |

## 10. Premissas
- Uma única administradora (Thaís).
- As cores das faixas ficam presas à paleta da marca (Rosa Queimado, Verde Sálvia, Marrom Cacau, Dourado Folha) para não quebrar a identidade nem o contraste.
- Na demonstração da Vercel (sem servidor) o site mostra o conteúdo padrão atual e o painel continua em modo demonstração.

---
**Aguardando aprovação para iniciar a Fase 4.**
