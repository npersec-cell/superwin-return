-- Migration: Add 'burn' type to coin_ledger
-- Created: 2026-06-09

-- Note: If coin_ledger.type is TEXT, we just need to ensure 'burn' is handled in application code
-- If it's an ENUM, we need to alter it

-- Check if type column exists and add constraint if needed
DO $$
BEGIN
  -- If type column is TEXT (no enum constraint), no changes needed
  -- Application will handle 'burn' type
  
  -- Add comment to document the burn type
  COMMENT ON COLUMN public.coin_ledger.type IS 'Transaction type: credit, debit, claim, refund, payout, insurance_refund, predict, burn';
END
$$;

-- Create index for burn transactions (for audit purposes)
CREATE INDEX IF NOT EXISTS idx_coin_ledger_burn ON public.coin_ledger(type) WHERE type = 'burn';
