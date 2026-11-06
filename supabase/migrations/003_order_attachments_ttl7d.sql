-- =============================================================================
-- Thaís de Paula Ateliê — Migração 003 (Supabase PostgreSQL)
-- Cofre Temporário de Imagens dos Clientes para Produção de Artes (TTL = 7 Dias)
-- =============================================================================

-- 12. Arquivos / Imagens Originais Enviados pelos Clientes (Expiração em 7 dias)
CREATE TABLE IF NOT EXISTS public.order_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  file_data BYTEA,
  sha256_hash TEXT NOT NULL,
  downloaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  purged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_order_attachments_order_id ON public.order_attachments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_attachments_expires_at ON public.order_attachments(expires_at) WHERE purged_at IS NULL;

-- Adiciona coluna attachments_json em order_items para referenciar múltiplos arquivos por item
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS attachments_json JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Habilita Row Level Security (RLS) na tabela de anexos
ALTER TABLE public.order_attachments ENABLE ROW LEVEL SECURITY;

-- Função SQL de Expurgo Automático de Imagens Vencidas (> 7 dias) ou Órfãs (> 24h sem pedido)
CREATE OR REPLACE FUNCTION public.purge_expired_order_images()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  purged_count INTEGER := 0;
  c1 INTEGER := 0;
  c2 INTEGER := 0;
BEGIN
  -- 1. Limpa os bytes (file_data = NULL) de anexos cujo prazo de 7 dias já venceu
  -- ou que foram enviados no carrinho mas o pedido nunca foi concluído após 24 horas
  UPDATE public.order_attachments
  SET file_data = NULL,
      purged_at = NOW()
  WHERE purged_at IS NULL
    AND (
      expires_at <= NOW()
      OR (order_id IS NULL AND created_at <= NOW() - INTERVAL '24 hours')
    );
  GET DIAGNOSTICS c1 = ROW_COUNT;

  -- 2. Limpa photo_data legada em order_items de pedidos com mais de 7 dias
  UPDATE public.order_items oi
  SET photo_data = 'expirada_7_dias'
  FROM public.orders o
  WHERE oi.order_id = o.id
    AND oi.photo_data IS NOT NULL
    AND oi.photo_data <> 'removida'
    AND oi.photo_data <> 'expirada_7_dias'
    AND o.created_at <= NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS c2 = ROW_COUNT;

  purged_count := c1 + c2;
  RETURN purged_count;
END;
$$;
