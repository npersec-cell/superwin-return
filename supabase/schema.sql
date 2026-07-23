-- SUPERWIN RETURN - Phase 1 schema draft
-- Do not run until Supabase project is ready and policies are reviewed.

create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text unique not null,
  email text not null,
  display_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  coin_balance integer not null default 1000 check (coin_balance >= 0),
  lifetime_profit integer not null default 0,
  last_claim_at timestamptz,
  next_claim_at timestamptz,
  status text not null default 'active' check (status in ('active', 'suspended', 'banned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coin_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  type text not null check (type in ('claim', 'predict', 'payout', 'refund', 'fee', 'adjustment', 'insurance', 'insurance_refund')),
  amount integer not null,
  balance_after integer not null,
  ref_type text,
  ref_id uuid,
  detail text,
  created_at timestamptz not null default now()
);

create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  tournament_name text not null,
  question text not null,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed', 'resolved', 'canceled')),
  opens_at timestamptz,
  closes_at timestamptz,
  fee_rate numeric not null default 0.03,
  winning_option_id uuid,
  resolved_at timestamptz,
  canceled_at timestamptz,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prediction_options (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.predictions(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'predictions_winning_option_fk'
      and conrelid = 'public.predictions'::regclass
  ) then
    alter table public.predictions
      add constraint predictions_winning_option_fk
      foreign key (winning_option_id)
      references public.prediction_options(id);
  end if;
end $$;

create table if not exists public.prediction_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  prediction_id uuid not null references public.predictions(id),
  option_id uuid references public.prediction_options(id) on delete set null,
  amount integer not null check (amount > 0),
  estimated_return_percent numeric,
  status text not null default 'running' check (status in ('running', 'won', 'lost', 'refunded')),
  insurance boolean not null default false,
  insurance_cost integer not null default 0,
  payout_amount integer not null default 0,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Monthly leaderboards table removed - system now uses all-time profit only
-- create table if not exists public.monthly_leaderboards (...)

create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  month text not null,
  rank integer not null,
  user_id uuid references public.users(id),
  reward_name text,
  status text not null default 'pending' check (status in ('pending', 'contacting', 'completed', 'canceled')),
  proof_image_url text,
  proof_note text,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references public.users(id),
  action text not null,
  target_type text,
  target_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_users_clerk_user_id on public.users(clerk_user_id);
create index if not exists idx_coin_ledger_user_created on public.coin_ledger(user_id, created_at desc);
create index if not exists idx_predictions_status_closes on public.predictions(status, closes_at);
create index if not exists idx_prediction_options_prediction on public.prediction_options(prediction_id, sort_order);
create index if not exists idx_prediction_entries_user_status on public.prediction_entries(user_id, status, created_at desc);
create index if not exists idx_prediction_entries_prediction_option on public.prediction_entries(prediction_id, option_id);
-- idx_monthly_leaderboards_month_profit removed (table removed)

-- ── Chat Messages ──
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  clerk_user_id text,
  display_name text,
  message text not null check (char_length(trim(message)) > 0 and char_length(trim(message)) <= 500),
  is_deleted boolean not null default false,
  deleted_by_admin uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chat_messages_created on public.chat_messages(created_at desc);
create index if not exists idx_chat_messages_not_deleted on public.chat_messages(is_deleted, created_at desc);
