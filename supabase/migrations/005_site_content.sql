-- =============================================================================
-- Thaís de Paula Ateliê - Migração 005 (Supabase PostgreSQL)
-- Conteúdo do site controlado pelo painel: imagens, banners (topo, meio, popup),
-- faixas promocionais, vitrine da home e promoções dos produtos.
-- Não destrutiva: só cria tabelas/colunas e preenche a vitrine com os destaques atuais.
-- =============================================================================

-- 14. Biblioteca de imagens públicas (WebP já otimizado no navegador da administradora)
CREATE TABLE IF NOT EXISTS public.media_assets (
  sha256 TEXT PRIMARY KEY CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  mime_type TEXT NOT NULL CHECK (mime_type = 'image/webp'),
  width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 4096),
  height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 4096),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 614400),
  data BYTEA NOT NULL,
  label TEXT NOT NULL DEFAULT '' CHECK (char_length(label) <= 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_assets_created_at ON public.media_assets(created_at DESC);
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

-- 15. Banners: topo da home (carrossel), meio da página e popup
CREATE TABLE IF NOT EXISTS public.site_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement TEXT NOT NULL CHECK (placement IN ('topo', 'meio', 'popup')),
  title TEXT NOT NULL DEFAULT '' CHECK (char_length(title) <= 80),
  subtitle TEXT NOT NULL DEFAULT '' CHECK (char_length(subtitle) <= 160),
  cta_label TEXT NOT NULL DEFAULT '' CHECK (char_length(cta_label) <= 30),
  cta_url TEXT NOT NULL DEFAULT '' CHECK (char_length(cta_url) <= 300),
  image_url TEXT NOT NULL CHECK (image_url ~ '^/(media|img)/[A-Za-z0-9._-]+\.webp$'),
  image_mobile_url TEXT CHECK (image_mobile_url IS NULL OR image_mobile_url ~ '^/(media|img)/[A-Za-z0-9._-]+\.webp$'),
  alt_text TEXT NOT NULL CHECK (char_length(alt_text) BETWEEN 3 AND 160),
  text_theme TEXT NOT NULL DEFAULT 'claro' CHECK (text_theme IN ('claro', 'escuro')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  popup_delay_s INTEGER NOT NULL DEFAULT 4 CHECK (popup_delay_s BETWEEN 3 AND 60),
  popup_frequency TEXT NOT NULL DEFAULT 'visita' CHECK (popup_frequency IN ('visita', 'dia', 'uma_vez')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_site_banners_placement ON public.site_banners(placement, sort_order);
ALTER TABLE public.site_banners ENABLE ROW LEVEL SECURITY;

-- 16. Faixas promocionais no topo de todas as páginas públicas
CREATE TABLE IF NOT EXISTS public.site_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL CHECK (char_length(text) BETWEEN 3 AND 140),
  link_url TEXT NOT NULL DEFAULT '' CHECK (char_length(link_url) <= 300),
  link_label TEXT NOT NULL DEFAULT '' CHECK (char_length(link_label) <= 30),
  theme TEXT NOT NULL DEFAULT 'cacau' CHECK (theme IN ('rosa', 'salvia', 'cacau', 'dourado')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  dismissible BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_site_announcements_order ON public.site_announcements(sort_order);
ALTER TABLE public.site_announcements ENABLE ROW LEVEL SECURITY;

-- Vitrine da home, preço promocional "de / por" e selos dos produtos
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS home_order INTEGER CHECK (home_order BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS compare_at_price INTEGER CHECK (compare_at_price > 0),
  ADD COLUMN IF NOT EXISTS badges TEXT[] NOT NULL DEFAULT '{}'::text[]
    CHECK (badges <@ ARRAY['novidade', 'mais_vendido']::text[]);

-- Preenche a vitrine uma única vez com os destaques atuais (só se ninguém montou a vitrine ainda)
CREATE OR REPLACE FUNCTION public.backfill_home_showcase()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE home_order IS NOT NULL) THEN
    UPDATE public.products p
    SET home_order = ranked.position
    FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY id ASC) AS position
      FROM public.products
      WHERE featured = TRUE AND active = TRUE
    ) ranked
    WHERE p.id = ranked.id AND ranked.position <= 12;
  END IF;
END;
$$;

SELECT public.backfill_home_showcase();
