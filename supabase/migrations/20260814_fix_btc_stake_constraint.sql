-- Migration: Relax BTC stake constraint to allow any amount >= 5
-- Date: 2026-08-14
-- PURPOSE: Support accumulated stake (click-to-add) with min 5 coins

-- Drop old check constraint on btc_quick_predictions table
ALTER TABLE public.btc_quick_predictions DROP CONSTRAINT IF EXISTS btc_quick_predictions_stake_amount_check;

-- Add new constraint: minimum 5 coins (no upper limit restriction)
ALTER TABLE public.btc_quick_predictions ADD CONSTRAINT btc_quick_predictions_stake_amount_check 
  CHECK (stake_amount >= 5);

COMMENT ON CONSTRAINT btc_quick_predictions_stake_amount_check ON public.btc_quick_predictions 
  IS 'Stake must be at least 5 coins (supports accumulated multi-click betting)';
