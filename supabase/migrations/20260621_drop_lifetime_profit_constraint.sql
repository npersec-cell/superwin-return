-- Fix: Drop the incorrect CHECK constraint on lifetime_profit
-- lifetime_profit tracks real P&L and MUST allow negative values
-- Only profit_score should be protected from going negative

-- 1. Drop the incorrect constraint
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS lifetime_profit_non_negative;

-- 2. Make sure profit_score constraint EXISTS (this one is correct)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profit_score_non_negative') THEN
    ALTER TABLE public.users
      ADD CONSTRAINT profit_score_non_negative CHECK (profit_score >= 0);
  END IF;
END $$;

-- 3. Verify: show remaining constraints on users table
SELECT
  conname AS constraint_name,
  contype AS type,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.users'::regclass
ORDER BY conname;
