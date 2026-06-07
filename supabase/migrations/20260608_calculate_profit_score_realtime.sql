-- Migration: Calculate profit_score in real-time from prediction_entries
-- Date: 2026-06-08
-- Purpose: Fix profit_score mismatch by calculating it from existing data

-- Create function to calculate profit_score in real-time
CREATE OR REPLACE FUNCTION calculate_user_profit_score(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_profit_score INTEGER := 0;
BEGIN
  -- Calculate profit_score from won entries only
  -- Formula: SUM(payout_amount - amount) for all won predictions
  -- This matches the current logic in resolve_prediction_atomic()
  SELECT COALESCE(SUM(pe.payout_amount - pe.amount), 0)
  INTO v_profit_score
  FROM prediction_entries pe
  WHERE pe.user_id = p_user_id
    AND pe.status = 'won';
  
  RETURN v_profit_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION calculate_user_profit_score(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_user_profit_score(UUID) TO service_role;

-- Add comment for documentation
COMMENT ON FUNCTION calculate_user_profit_score(UUID) IS 
  'Calculate profit_score in real-time from won prediction entries. Returns 0 if no won entries exist.';
