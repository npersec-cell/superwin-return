-- Create contests table for reward contests
-- กิจกรรมชิงรางวัล

create table if not exists public.contests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  end_time timestamptz not null,
  prize text not null,
  winner_user_id uuid references public.users(id),
  status text not null default 'active' check (status in ('active', 'ended', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create index for contests
create index if not exists idx_contests_status_end_time on public.contests(status, end_time);

-- Create RLS policy for contests
-- Admin can read/write all, users can read active contests
alter table public.contests enable row level security;

-- Policy for admins to read all contests
create policy if not exists "Admins can read all contests"
  on public.contests for select
  using (true);

-- Policy for users to read active contests
create policy if not exists "Users can read active contests"
  on public.contests for select
  using (status = 'active');

-- Policy for admins to insert contests
create policy if not exists "Admins can insert contests"
  on public.contests for insert
  with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
      and u.role = 'admin'
    )
  );

-- Policy for admins to update contests
create policy if not exists "Admins can update contests"
  on public.contests for update
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
      and u.role = 'admin'
    )
  );

-- Create user_contest_claimed table to track claimed rewards
create table if not exists public.user_contest_claimed (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id) on delete cascade,
  user_id uuid not null references public.users(id),
  claimed_at timestamptz not null default now(),
  unique (contest_id, user_id)
);

-- Create index for user_contest_claimed
create index if not exists idx_user_contest_claimed_user on public.user_contest_claimed(user_id);
create index if not exists idx_user_contest_claimed_contest on public.user_contest_claimed(contest_id);

-- Policy for user_contest_claimed
alter table public.user_contest_claimed enable row level security;

create policy if not exists "Users can insert their own claims"
  on public.user_contest_claimed for insert
  with check (user_id = auth.uid());

create policy if not exists "Users can read their own claims"
  on public.user_contest_claimed for select
  using (user_id = auth.uid());

create policy if not exists "Admins can read all claims"
  on public.user_contest_claimed for select
  using (true);
