-- Add multiple prizes support for contests
-- Support up to 5 prizes

-- Add prize columns for top 5 ranks
alter table public.contests 
  add column prize_1 text,
  add column prize_2 text,
  add column prize_3 text,
  add column prize_4 text,
  add column prize_5 text;

-- Migrate existing prize to prize_1
update public.contests set prize_1 = prize where prize is not null;

-- Make prize_1 required
alter table public.contests alter column prize_1 set not null;

-- Remove old prize column
alter table public.contests drop column prize;

-- Add comment for clarity
comment on column public.contests.prize_1 is 'Prize for rank #1 (top prize)';
comment on column public.contests.prize_2 is 'Prize for rank #2';
comment on column public.contests.prize_3 is 'Prize for rank #3';
comment on column public.contests.prize_4 is 'Prize for rank #4';
comment on column public.contests.prize_5 is 'Prize for rank #5';
