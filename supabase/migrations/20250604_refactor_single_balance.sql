-- Migration: drop free_coins column (no longer needed)
-- Run this after the app code has been updated to stop using free_coins

-- Only run this if free_coins exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'free_coins'
  ) THEN
    -- Migrate data: add free_coins back to coin_balance
    UPDATE public.users SET coin_balance = coin_balance + free_coins;
    -- Drop the column
    ALTER TABLE public.users DROP COLUMN free_coins;
  END IF;
END $$;
