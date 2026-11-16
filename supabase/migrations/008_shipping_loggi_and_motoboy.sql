-- =============================================================================
-- Thaís de Paula Ateliê - Migração 008 (Supabase PostgreSQL)
-- Logística Híbrida: Motoboy Cambé (R$ 10) / Londrina (R$ 20) + Transportadora Loggi
-- Não destrutiva: adiciona colunas de rastreio e transportadora em public.orders.
-- =============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_carrier TEXT NOT NULL DEFAULT 'retirada',
  ADD COLUMN IF NOT EXISTS tracking_code TEXT,
  ADD COLUMN IF NOT EXISTS tracking_url TEXT,
  ADD COLUMN IF NOT EXISTS loggi_shipment_id TEXT,
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_tracking_code ON public.orders(tracking_code) WHERE tracking_code IS NOT NULL;
