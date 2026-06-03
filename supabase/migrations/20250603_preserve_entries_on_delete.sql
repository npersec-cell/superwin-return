-- Migration: Make prediction_entries.option_id nullable + ON DELETE SET NULL
-- Reason: Preserve entries for leaderboard when predictions are permanently deleted

-- 1. Drop existing FK constraint
alter table public.prediction_entries
  drop constraint if exists prediction_entries_option_id_fkey;

-- 2. Make column nullable
alter table public.prediction_entries
  alter column option_id drop not null;

-- 3. Re-add FK with ON DELETE SET NULL
alter table public.prediction_entries
  add constraint prediction_entries_option_id_fkey
  foreign key (option_id) references public.prediction_options(id)
  on delete set null;
