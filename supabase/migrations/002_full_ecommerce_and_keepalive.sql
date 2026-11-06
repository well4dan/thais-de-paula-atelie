-- Migração 002: Esquema Completo de Produção no PostgreSQL (Supabase)
-- Thaís de Paula Ateliê: Identidade, LGPD, Catálogo, Pedidos, Auditoria e Keep-Alive Anti-Pausa

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Tabela de Usuários (Clientes e Administradoras)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 120),
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  cpf_hash TEXT NOT NULL UNIQUE,
  cpf_encrypted TEXT NOT NULL,
  cpf_masked TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 2. Endereços de Entrega
CREATE TABLE IF NOT EXISTS public.addresses (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  cep TEXT NOT NULL,
  street TEXT NOT NULL,
  number TEXT NOT NULL,
  complement TEXT NOT NULL DEFAULT '',
  district TEXT NOT NULL,
  city TEXT NOT NULL,
  uf TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON public.addresses(user_id);

-- 3. Trilha Jurídica Imutável de Consentimento LGPD
CREATE TABLE IF NOT EXISTS public.consent_logs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  terms_version TEXT NOT NULL,
  lgpd_version TEXT NOT NULL,
  accepted_terms BOOLEAN NOT NULL CHECK (accepted_terms = TRUE),
  accepted_lgpd BOOLEAN NOT NULL CHECK (accepted_lgpd = TRUE),
  ip_hash TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consent_logs_user_id ON public.consent_logs(user_id);

-- 4. Sessões Autenticadas (HttpOnly + CSRF)
CREATE TABLE IF NOT EXISTS public.sessions (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON public.sessions(user_id);

-- 5. Catálogo de Produtos (Pronta Entrega e Sob Demanda)
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  line TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('pronta', 'demanda')),
  price INTEGER NOT NULL CHECK (price > 0),
  stock INTEGER,
  lead_days INTEGER NOT NULL DEFAULT 0,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  image TEXT NOT NULL,
  description TEXT NOT NULL,
  options_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Cupons de Desconto
CREATE TABLE IF NOT EXISTS public.coupons (
  code TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('percent', 'fixed')),
  value INTEGER NOT NULL CHECK (value > 0),
  min_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Pedidos do E-commerce
CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  customer_json JSONB NOT NULL,
  shipping_json JSONB NOT NULL,
  payment_json JSONB NOT NULL,
  coupon_code TEXT,
  totals_json JSONB NOT NULL,
  lead_days INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL,
  history_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);

-- 8. Itens do Pedido
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  image TEXT NOT NULL,
  mode TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_price INTEGER NOT NULL,
  selections_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  photo_data TEXT
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);

-- 9. Configurações da Loja
CREATE TABLE IF NOT EXISTS public.store_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  settings_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Trilha de Auditoria de Segurança
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY,
  request_id TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Keep-Alive Heartbeat (Impede que o Supabase Free pause por inatividade)
CREATE TABLE IF NOT EXISTS public.keep_alive_heartbeat (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_beat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_beats BIGINT NOT NULL DEFAULT 1,
  last_source TEXT NOT NULL DEFAULT 'boot',
  note TEXT NOT NULL DEFAULT 'Thaís de Paula Ateliê - Keep Alive'
);

-- Habilita Row Level Security (RLS) em todas as tabelas do schema public
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keep_alive_heartbeat ENABLE ROW LEVEL SECURITY;

-- Política pública de leitura apenas para produtos ativos (vitrine)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'products_public_read'
  ) THEN
    CREATE POLICY "products_public_read" ON public.products FOR SELECT USING (active = true);
  END IF;
END $$;
