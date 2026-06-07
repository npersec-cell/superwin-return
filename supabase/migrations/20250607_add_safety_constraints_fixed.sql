-- Add safety constraints (Fixed version)
-- Run this in Supabase SQL Editor

-- 1. profit_score >= 0
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profit_score_non_negative') THEN
    ALTER TABLE public.users ADD CONSTRAINT profit_score_non_negative CHECK (profit_score >= 0);
  END IF;
END $$;

-- 2. coin_balance >= 0
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coin_balance_non_negative') THEN
    ALTER TABLE public.users ADD CONSTRAINT coin_balance_non_negative CHECK (coin_balance >= 0);
  END IF;
END $$;

-- 3. lifetime_profit >= 0
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lifetime_profit_non_negative') THEN
    ALTER TABLE public.users ADD CONSTRAINT lifetime_profit_non_negative CHECK (lifetime_profit >= 0);
  END IF;
END $$;

-- 4. prediction_entries.amount > 0
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'amount_positive') THEN
    ALTER TABLE public.prediction_entries ADD CONSTRAINT amount_positive CHECK (amount > 0);
  END IF;
END $$;

-- 5. prediction_entries.insurance_cost >= 0
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'insurance_cost_non_negative') THEN
    ALTER TABLE public.prediction_entries ADD CONSTRAINT insurance_cost_non_negative CHECK (insurance_cost >= 0);
  END IF;
END $$;

-- Verify constraints
SELECT conname, contype, conrelid::regclass
FROM pg_constraint
WHERE conrelid::regclass::text IN ('public.users', 'public.prediction_entries')
ORDER BY conrelid;
