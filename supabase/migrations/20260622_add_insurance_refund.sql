-- Migration: Add insurance_refund column to prediction_entries
-- Date: 2026-06-22
-- PURPOSE: Store insurance refund amount for accurate payout calculation

-- 1. Add insurance_refund column
ALTER TABLE public.prediction_entries 
ADD COLUMN IF NOT EXISTS insurance_refund integer NOT NULL DEFAULT 0;

-- 2. Update comment
COMMENT ON COLUMN public.prediction_entries.insurance_refund 
IS 'Amount refunded by insurance (usually 50% of bet amount)';

-- 3. Update resolve function to store insurance_refund
DROP FUNCTION IF EXISTS resolve_prediction_atomic(uuid, uuid, timestamptz);

CREATE OR REPLACE FUNCTION resolve_prediction_atomic(
  p_prediction_id uuid,
  p_winning_option_id uuid,
  p_resolved_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prediction RECORD;
  v_total_pool integer;
  v_winning_pool integer;
  v_fee_rate numeric;
  v_distributable integer;
  v_entry RECORD;
  v_payout integer;
  v_insurance_refund integer;
  v_total_paid integer := 0;
  v_total_insurance_refunded integer := 0;
  v_winners_count integer := 0;
  v_insured_losers_count integer := 0;
BEGIN
  -- Lock prediction row to prevent concurrent resolves
  SELECT id, tournament_name, question, fee_rate, status
  INTO v_prediction
  FROM predictions
  WHERE id = p_prediction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Prediction not found');
  END IF;

  IF v_prediction.status = 'resolved' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Prediction already resolved');
  END IF;

  IF v_prediction.status NOT IN ('open', 'closed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Prediction must be open or closed to resolve');
  END IF;

  -- Calculate total pool (all running entries)
  SELECT COALESCE(SUM(amount), 0)::integer
  INTO v_total_pool
  FROM prediction_entries
  WHERE prediction_id = p_prediction_id AND status = 'running';

  -- Calculate winning pool
  SELECT COALESCE(SUM(amount), 0)::integer
  INTO v_winning_pool
  FROM prediction_entries
  WHERE prediction_id = p_prediction_id AND option_id = p_winning_option_id AND status = 'running';

  -- If nobody bet on winning option, allow resolution anyway.
  -- The pool becomes platform revenue; insured losers still get refunds.
  v_fee_rate := COALESCE(v_prediction.fee_rate, 0.03);
  v_distributable := FLOOR((v_total_pool * (1 - v_fee_rate))::numeric)::integer;

  -- Process winning entries
  FOR v_entry IN
    SELECT id, user_id, amount, insurance, insurance_cost
    FROM prediction_entries
    WHERE prediction_id = p_prediction_id
      AND option_id = p_winning_option_id
      AND status = 'running'
    ORDER BY id
  LOOP
    -- Safety: skip if winning_pool is 0 (should not happen, loop would be empty)
    IF v_winning_pool = 0 THEN
      CONTINUE;
    END IF;
    v_payout := FLOOR((v_entry.amount::numeric / v_winning_pool) * v_distributable)::integer;
    v_total_paid := v_total_paid + v_payout;
    v_winners_count := v_winners_count + 1;

    -- Update user balance + lifetime_profit + profit_score (profit from this bet)
    UPDATE users
    SET
      coin_balance = coin_balance + v_payout,
      -- Real-time net profit: amount was already deducted when bet was placed,
      -- so we add the full payout here.
      lifetime_profit = lifetime_profit + v_payout,
      profit_score = profit_score + (v_payout - v_entry.amount),
      updated_at = p_resolved_at
    WHERE id = v_entry.user_id;

    -- Update entry
    UPDATE prediction_entries
    SET status = 'won', payout_amount = v_payout, resolved_at = p_resolved_at, insurance_refund = 0
    WHERE id = v_entry.id;

    -- Insert payout ledger
    INSERT INTO coin_ledger (user_id, type, amount, balance_after, ref_type, ref_id, detail)
    SELECT
      v_entry.user_id,
      'payout',
      v_payout,
      coin_balance,
      'prediction_entry',
      v_entry.id,
      'Tournament: ' || v_prediction.tournament_name || ' . Question: ' || v_prediction.question || ' . Result: Won . Payout: ' || v_payout
    FROM users WHERE id = v_entry.user_id;
  END LOOP;

  -- Process losing entries (insurance refund)
  FOR v_entry IN
    SELECT id, user_id, amount, insurance, insurance_cost
    FROM prediction_entries
    WHERE prediction_id = p_prediction_id
      AND option_id IS DISTINCT FROM p_winning_option_id
      AND status = 'running'
    ORDER BY id
  LOOP
    v_insurance_refund := 0;
    IF v_entry.insurance THEN
      v_insurance_refund := FLOOR((v_entry.amount * 0.5)::numeric)::integer;
    END IF;

    UPDATE prediction_entries
    SET 
      status = 'lost', 
      payout_amount = 0, 
      resolved_at = p_resolved_at,
      insurance_refund = v_insurance_refund
    WHERE id = v_entry.id;

    -- Insurance refund: return 50% of bet amount
    IF v_insurance_refund > 0 THEN
      v_total_insurance_refunded := v_total_insurance_refunded + v_insurance_refund;
      v_insured_losers_count := v_insured_losers_count + 1;

      -- Insurance refund: return 50% to coin_balance AND add to lifetime_profit
      -- (partial recovery from loss, so lifetime_profit increases by the refunded amount)
      UPDATE users
      SET
        coin_balance = coin_balance + v_insurance_refund,
        lifetime_profit = lifetime_profit + v_insurance_refund,
        updated_at = p_resolved_at
      WHERE id = v_entry.user_id;

      INSERT INTO coin_ledger (user_id, type, amount, balance_after, ref_type, ref_id, detail)
      SELECT
        v_entry.user_id,
        'insurance_refund',
        v_insurance_refund,
        coin_balance,
        'prediction_entry',
        v_entry.id,
        'Tournament: ' || v_prediction.tournament_name || ' . Question: ' || v_prediction.question || ' . Result: Insured Loss . Refund: ' || v_insurance_refund
      FROM users WHERE id = v_entry.user_id;
    END IF;
  END LOOP;

  -- Update prediction status
  UPDATE predictions
  SET status = 'resolved', winning_option_id = p_winning_option_id, resolved_at = p_resolved_at, updated_at = p_resolved_at
  WHERE id = p_prediction_id;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'predictionId', p_prediction_id,
      'totalPool', v_total_pool,
      'winningPool', v_winning_pool,
      'distributable', v_distributable,
      'totalPaid', v_total_paid,
      'totalInsuranceRefunded', v_total_insurance_refunded,
      'winnersCount', v_winners_count,
      'insuredLosersCount', v_insured_losers_count,
      'feeRate', v_fee_rate
    )
  );
END;
$$;

-- 4. Grant execute permission
GRANT EXECUTE ON FUNCTION resolve_prediction_atomic(uuid, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_prediction_atomic(uuid, uuid, timestamptz) TO service_role;
