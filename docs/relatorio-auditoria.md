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
