-- =============================================================================
-- Thaís de Paula Ateliê - Migração 004 (Supabase PostgreSQL)
-- Sessões da administradora validadas no servidor (substitui o PIN de demonstração)
-- Não destrutiva: só cria tabela/índices e remove a chave adminPin das configurações.
-- =============================================================================

-- 13. Sessões da Administradora (cookie HttpOnly separado do cookie das clientes)
CREATE TABLE IF NOT EXISTS public.admin_sessions (
  token_hash TEXT PRIMARY KEY,
  csrf_token TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON public.admin_sessions(expires_at) WHERE revoked_at IS NULL;

-- Sem política pública: apenas o servidor (papel dono) acessa esta tabela
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

-- O PIN de demonstração nunca mais fica salvo no banco
UPDATE public.store_settings
SET settings_json = settings_json - 'adminPin', updated_at = NOW()
WHERE settings_json ? 'adminPin';
