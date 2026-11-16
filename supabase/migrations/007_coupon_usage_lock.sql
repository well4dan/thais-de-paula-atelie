-- =============================================================================
-- Thaís de Paula Ateliê - Migração 007 (Supabase PostgreSQL)
-- Bloqueio de Cupons de Primeira Compra e Cupons Já Utilizados (Uso Único por Cliente)
-- Não destrutiva: adiciona colunas em coupons e cria tabela coupon_redemptions com RLS.
-- =============================================================================

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS first_purchase_only BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS single_use_per_customer BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  ADD COLUMN IF NOT EXISTS used_count INTEGER NOT NULL DEFAULT 0;

UPDATE public.coupons
SET first_purchase_only = TRUE, single_use_per_customer = TRUE
WHERE code = 'BEMVINDA10';

-- 19. Registro de resgates de cupons por cliente/pedido para bloqueio anti-fraude
CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_code TEXT NOT NULL REFERENCES public.coupons(code) ON DELETE CASCADE,
  order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  email_norm TEXT NOT NULL,
  phone_digits TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (coupon_code, order_id)
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_lookup
  ON public.coupon_redemptions(coupon_code, email_norm, phone_digits);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user
  ON public.coupon_redemptions(coupon_code, user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
