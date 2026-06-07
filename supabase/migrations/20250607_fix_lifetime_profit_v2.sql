-- Apply this in Supabase SQL Editor
-- Migration: Fix lifetime_profit calculation
-- Date: 2026-06-07

-- Drop old function
DROP FUNCTION IF EXISTS resolve_prediction_atomic(uuid, uuid, timestamptz);

-- Create fixed function (using $func$ delimiter to avoid JSON escaping issues)
CREATE OR REPLACE FUNCTION resolve_prediction_atomic(
  p_prediction_id uuid,
  p_winning_option_id uuid,
  p_resolved_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
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
  -- Lock prediction row
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

  -- Calculate total pool
  SELECT COALESCE(SUM(amount), 0)::integer
  INTO v_total_pool
  FROM prediction_entries
  WHERE prediction_id = p_prediction_id AND status = 'running';

  -- Calculate winning pool
  SELECT COALESCE(SUM(amount), 0)::integer
  INTO v_winning_pool
  FROM prediction_entries
  WHERE prediction_id = p_prediction_id AND option_id = p_winning_option_id AND status = 'running';

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
    IF v_winning_pool = 0 THEN
      CONTINUE;
    END IF;
    v_payout := FLOOR((v_entry.amount::numeric / v_winning_pool) * v_distributable)::integer;
    v_total_paid := v_total_paid + v_payout;
    v_winners_count := v_winners_count + 1;

    -- FIXED: lifetime_profit adds net profit only (principal already deducted when bet was placed)
    UPDATE users
    SET
      coin_balance = coin_balance + v_payout,
      lifetime_profit = lifetime_profit + (v_payout - v_entry.amount),
      profit_score = profit_score + (v_payout - v_entry.amount),
      updated_at = p_resolved_at
    WHERE id = v_entry.user_id;

    UPDATE prediction_entries
    SET status = 'won', payout_amount = v_payout, resolved_at = p_resolved_at
    WHERE id = v_entry.id;

    INSERT INTO coin_ledger (user_id, type, amount, balance_after, ref_type, ref_id, detail)
    SELECT
      v_entry.user_id,
      'payout',
      v_payout,
      coin_balance,
      'prediction_entry',
      v_entry.id,
      'Tournament: ' || v_prediction.tournament_name || '. Question: ' || v_prediction.question || '. Result: Won. Payout: ' || v_payout
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
    UPDATE prediction_entries
    SET status = 'lost', payout_amount = 0, resolved_at = p_resolved_at
    WHERE id = v_entry.id;

    IF v_entry.insurance THEN
      v_insurance_refund := FLOOR((v_entry.amount * 0.5)::numeric)::integer;
      IF v_insurance_refund > 0 THEN
        v_total_insurance_refunded := v_total_insurance_refunded + v_insurance_refund;
        v_insured_losers_count := v_insured_losers_count + 1;

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
          'Tournament: ' || v_prediction.tournament_name || '. Question: ' || v_prediction.question || '. Result: Insured Loss. Refund: ' || v_insurance_refund
        FROM users WHERE id = v_entry.user_id;
      END IF;
    END IF;
  END LOOP;

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
$func$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION resolve_prediction_atomic(uuid, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_prediction_atomic(uuid, uuid, timestamptz) TO service_role;
