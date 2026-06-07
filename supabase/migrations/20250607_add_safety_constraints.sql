-- ============================================
-- Migration: Add safety constraints
-- Date: 2026-06-07
-- Purpose: Prevent negative balances and scores
-- ============================================

-- 1. Prevent profit_score from going negative
ALTER TABLE public.users
ADD CONSTRAINT IF NOT EXISTS profit_score_non_negative 
CHECK (profit_score >= 0);

-- 2. Prevent coin_balance from going negative (safety net)
ALTER TABLE public.users
ADD CONSTRAINT IF NOT EXISTS coin_balance_non_negative 
CHECK (coin_balance >= 0);

-- 3. Prevent lifetime_profit from going negative
ALTER TABLE public.users
ADD CONSTRAINT IF NOT EXISTS lifetime_profit_non_negative 
CHECK (lifetime_profit >= 0);

-- 4. Prevent prediction_entries.amount from being zero or negative
ALTER TABLE public.prediction_entries
ADD CONSTRAINT IF NOT EXISTS amount_positive 
CHECK (amount > 0);

-- 5. Prevent insurance_cost from being negative
ALTER TABLE public.prediction_entries
ADD CONSTRAINT IF NOT EXISTS insurance_cost_non_negative 
CHECK (insurance_cost >= 0);

-- ============================================
-- Add comments for documentation
-- ============================================
COMMENT ON CONSTRAINT profit_score_non_negative ON public.users 
IS 'Security: Prevent profit score from going negative (insurance abuse)';

COMMENT ON CONSTRAINT coin_balance_non_negative ON public.users 
IS 'Security: Prevent user balance from going negative (over-betting)';

COMMENT ON CONSTRAINT lifetime_profit_non_negative ON public.users 
IS 'Data integrity: lifetime_profit should never be negative';
