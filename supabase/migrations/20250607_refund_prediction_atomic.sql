-- Migration: Create refund_prediction_atomic function
-- Date: 2026-06-07
-- Purpose: Atomic refund to prevent race conditions and partial refunds

DROP FUNCTION IF EXISTS refund_prediction_atomic(uuid, timestamptz);

CREATE OR REPLACE FUNCTION refund_prediction_atomic(
  p_prediction_id uuid,
  p_refunded_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_prediction RECORD;
  v_entry RECORD;
  v_total_refunded integer := 0;
  v_refunded_count integer := 0;
  v_user_balance_after integer;
  v_user_profit_after integer;
  v_user_lifetime_after integer;
BEGIN
  -- 1. Lock prediction row
  SELECT id, tournament_name, question, status
  INTO v_prediction
  FROM predictions
  WHERE id = p_prediction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Prediction not found');
  END IF;

  -- 2. Validate prediction is refundable
  IF v_prediction.status = 'resolved' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Resolved prediction cannot be refunded');
  END IF;

  IF v_prediction.status = 'canceled' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Prediction already canceled');
  END IF;

  IF v_prediction.status NOT IN ('open', 'closed', 'draft') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Prediction cannot be refunded in current status: ' || v_prediction.status);
  END IF;

  -- 3. Check if there are any running entries
  IF NOT EXISTS (
    SELECT 1 FROM prediction_entries
    WHERE prediction_id = p_prediction_id AND status = 'running'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No running entries to refund');
  END IF;

  -- 4. Process each running entry (refund all at once)
  FOR v_entry IN
    SELECT id, user_id, amount, insurance, insurance_cost
    FROM prediction_entries
    WHERE prediction_id = p_prediction_id
      AND status = 'running'
    ORDER BY id
    FOR UPDATE
  LOOP
    -- Lock user row
    SELECT coin_balance, profit_score, lifetime_profit
    INTO v_user_balance_after, v_user_profit_after, v_user_lifetime_after
    FROM users
    WHERE id = v_entry.user_id
    FOR UPDATE;

    -- Calculate new balances
    v_user_balance_after := v_user_balance_after + v_entry.amount;
    v_user_profit_after := v_user_profit_after + (CASE WHEN v_entry.insurance THEN v_entry.insurance_cost ELSE 0 END);
    v_user_lifetime_after := GREATEST(0, v_user_lifetime_after + v_entry.amount);

    -- Update user balances
    UPDATE users
    SET
      coin_balance = v_user_balance_after,
      profit_score = v_user_profit_after,
      lifetime_profit = v_user_lifetime_after,
      updated_at = p_refunded_at
    WHERE id = v_entry.user_id;

    -- Update prediction entry status
    UPDATE prediction_entries
    SET status = 'refunded',
        payout_amount = v_entry.amount,
        resolved_at = p_refunded_at
    WHERE id = v_entry.id;

    -- Insert coin_ledger for coin refund
    INSERT INTO coin_ledger (user_id, type, amount, balance_after, ref_type, ref_id, detail)
    VALUES (
      v_entry.user_id,
      'refund',
      v_entry.amount,
      v_user_balance_after,
      'prediction_entry',
      v_entry.id,
      'Tournament: ' || v_prediction.tournament_name || ' · Question: ' || v_prediction.question || ' · Result: Refunded · Refund: ' || v_entry.amount
    );

    -- Insert coin_ledger for insurance refund (if applicable)
    IF v_entry.insurance AND v_entry.insurance_cost > 0 THEN
      INSERT INTO coin_ledger (user_id, type, amount, balance_after, ref_type, ref_id, detail)
      VALUES (
        v_entry.user_id,
        'refund',
        v_entry.insurance_cost,
        v_user_profit_after,
        'prediction_entry',
        v_entry.id,
        'Tournament: ' || v_prediction.tournament_name || ' · Question: ' || v_prediction.question || ' · Result: Refunded · Insurance Refund: ' || v_entry.insurance_cost || ' green ammo'
      );
    END IF;

    v_total_refunded := v_total_refunded + v_entry.amount;
    v_refunded_count := v_refunded_count + 1;
  END LOOP;

  -- 5. Update prediction status to canceled
  UPDATE predictions
  SET status = 'canceled',
      canceled_at = p_refunded_at,
      updated_at = p_refunded_at
  WHERE id = p_prediction_id;

  -- 6. Return success
  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'predictionId', p_prediction_id,
      'refundedCount', v_refunded_count,
      'totalRefunded', v_total_refunded
    )
  );
END;
$func$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION refund_prediction_atomic(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION refund_prediction_atomic(uuid, timestamptz) TO service_role;
