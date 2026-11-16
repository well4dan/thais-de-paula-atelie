-- =============================================================================
-- Thaís de Paula Ateliê - Migração 006 (Supabase PostgreSQL)
-- Blindagem Financeira de Pedidos + Receptor de Webhooks (Asaas / Multi-Provider)
-- Não destrutiva: adiciona colunas em orders e cria tabela payment_webhook_events com RLS.
-- =============================================================================

-- 17. Campos de integração com gateway na tabela orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'sandbox_sim',
  ADD COLUMN IF NOT EXISTS gateway_charge_id TEXT,
  ADD COLUMN IF NOT EXISTS gateway_checkout_url TEXT,
  ADD COLUMN IF NOT EXISTS pix_qr_payload TEXT,
  ADD COLUMN IF NOT EXISTS boleto_digitable_line TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_gateway_charge_id ON public.orders(gateway_charge_id) WHERE gateway_charge_id IS NOT NULL;

-- 18. Registro idempotente de eventos de webhook recebidos do gateway de pagamento
CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  order_id TEXT REFERENCES public.orders(id) ON DELETE SET NULL,
  gateway_charge_id TEXT,
  amount_cents INTEGER,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_order_id ON public.payment_webhook_events(order_id);

-- Row Level Security (RLS) ativada sem política pública: acesso restrito ao servidor
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
