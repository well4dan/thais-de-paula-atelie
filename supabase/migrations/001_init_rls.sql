-- Migração 001: Estrutura de Produção com RLS (Supabase / PostgreSQL)
-- Thaís de Paula Ateliê — Autenticação, Endereços e Trilha de Consentimento LGPD

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 3 and 120),
  email text not null unique,
  phone text not null,
  cpf_hash text not null unique,
  cpf_encrypted text not null,
  cpf_masked text not null,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  cep text not null check (cep ~ '^[0-9]{5}-[0-9]{3}$'),
  street text not null check (char_length(street) between 2 and 160),
  number text not null check (char_length(number) between 1 and 30),
  complement text not null default '',
  district text not null check (char_length(district) between 2 and 100),
  city text not null check (char_length(city) between 2 and 100),
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  is_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_addresses_user_id on public.addresses(user_id);

create table if not exists public.consent_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  terms_version text not null,
  lgpd_version text not null,
  accepted_terms boolean not null check (accepted_terms = true),
  accepted_lgpd boolean not null check (accepted_lgpd = true),
  ip_hash text not null,
  user_agent text not null,
  accepted_at timestamptz not null default now()
);

create index if not exists idx_consent_logs_user_id on public.consent_logs(user_id);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  actor_id uuid,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Habilitar Row Level Security (RLS) em todas as tabelas
alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.consent_logs enable row level security;
alter table public.audit_logs enable row level security;

-- Políticas de isolamento: cada titular só enxerga e altera os próprios dados
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id and role = 'customer');

create policy "addresses_all_own" on public.addresses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "consent_logs_select_own" on public.consent_logs
  for select using (auth.uid() = user_id);

create policy "consent_logs_insert_own" on public.consent_logs
  for insert with check (auth.uid() = user_id);
