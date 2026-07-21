-- Migration: Fix place_prediction_atomic - remove deprecated profit_score references
-- Date: 2026-07-21
-- PURPOSE: Clean up deprecated profit_score, simplify insurance handling

DROP FUNCTION IF EXISTS place_prediction_atomic(uuid, uuid, uuid, integer, boolean);

CREATE OR REPLACE FUNCTION place_prediction_atomic(
  p_user_id uuid,
  p_prediction_id uuid,
  p_option_id uuid,
  p_amount integer,
  p_insurance boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user RECORD;
  v_prediction RECORD;
  v_selected_option RECORD;
  v_entry_id uuid;
  v_now timestamptz := now();
  v_coin_balance_after integer;
  v_lifetime_profit_after integer;
  v_insurance_cost integer := 0;
BEGIN
  -- ========== 1. Lock user row (prevents Race Condition) ==========
  SELECT id, coin_balance, lifetime_profit, status
  INTO v_user
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'User not found');
  END IF;

  IF v_user.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Account is not active');
  END IF;

  -- ========== 2. Validate prediction ==========
  SELECT id, status, opens_at, closes_at, tournament_name, question, fee_rate
  INTO v_prediction
  FROM predictions
  WHERE id = p_prediction_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Prediction not found');
  END IF;

  IF v_prediction.status <> 'open' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Prediction is not open');
  END IF;

  IF v_prediction.opens_at IS NOT NULL AND v_prediction.opens_at > v_now THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Prediction is not open yet');
  END IF;

  IF v_prediction.closes_at IS NOT NULL AND v_prediction.closes_at <= v_now THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Prediction is closed');
  END IF;

  -- ========== 3. Validate option ==========
  SELECT id, label INTO v_selected_option
  FROM prediction_options
  WHERE id = p_option_id AND prediction_id = p_prediction_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Option not found');
  END IF;

  -- ========== 4. Check coin balance ==========
  IF v_user.coin_balance < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not enough coins');
  END IF;

  -- ========== 5. Insurance disabled ==========
  v_insurance_cost := 0;

  -- ========== 6. Check for duplicate prediction ==========
  IF EXISTS (
    SELECT 1 FROM prediction_entries
    WHERE user_id = p_user_id AND prediction_id = p_prediction_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You have already predicted this question');
  END IF;

  -- ========== 7. Calculate new balances ==========
  v_coin_balance_after := v_user.coin_balance - p_amount;
  v_lifetime_profit_after := GREATEST(0, v_user.lifetime_profit - p_amount);

  -- ========== 8. Update user balances ==========
  UPDATE users
  SET
    coin_balance = v_coin_balance_after,
    lifetime_profit = v_lifetime_profit_after,
    updated_at = v_now
  WHERE id = p_user_id;

  -- ========== 9. Create prediction entry ==========
  INSERT INTO prediction_entries (
    user_id,
    prediction_id,
    option_id,
    amount,
    status,
    insurance,
    insurance_cost,
    created_at
  ) VALUES (
    p_user_id,
    p_prediction_id,
    p_option_id,
    p_amount,
    'running',
    p_insurance,
    v_insurance_cost,
    v_now
  )
  RETURNING id INTO v_entry_id;

  -- ========== 10. Insert coin_ledger entry ==========
  INSERT INTO coin_ledger (user_id, type, amount, balance_after, ref_type, ref_id, detail, tournament_name, question, answer)
  VALUES (
    p_user_id,
    'predict',
    -p_amount,
    v_coin_balance_after,
    'prediction_entry',
    v_entry_id,
    'Tournament: ' || v_prediction.tournament_name || ' · Question: ' || v_prediction.question || ' · Answer: ' || v_selected_option.label,
    v_prediction.tournament_name,
    v_prediction.question,
    v_selected_option.label
  );

  -- ========== 11. Return success ==========
  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'entryId', v_entry_id,
      'amount', p_amount,
      'insurance', p_insurance,
      'insuranceCost', v_insurance_cost,
      'coinBalanceAfter', v_coin_balance_after,
      'lifetimeProfitAfter', v_lifetime_profit_after
    )
  );
END;
$func$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION place_prediction_atomic(uuid, uuid, uuid, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION place_prediction_atomic(uuid, uuid, uuid, integer, boolean) TO service_role;
