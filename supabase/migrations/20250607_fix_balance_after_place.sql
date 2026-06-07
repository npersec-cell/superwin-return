-- Fix balance_after in place_prediction_atomic()
-- Date: 2026-06-07
-- Fix: Read actual balance from DB after UPDATE (not calculated)

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
AS $$
DECLARE
  v_user RECORD;
  v_prediction RECORD;
  v_option_exists boolean;
  v_insurance_cost integer := 0;
  v_entry_id uuid;
  v_now timestamptz := now();
  v_coin_balance_after integer;
  v_profit_score_after integer;
  v_lifetime_profit_after integer;
BEGIN
  -- ========== 1. Lock user row (prevents Race Condition) ==========
  SELECT id, coin_balance, profit_score, lifetime_profit, status
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

  -- Check time window
  IF v_prediction.opens_at IS NOT NULL AND v_prediction.opens_at > v_now THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Prediction is not open yet');
  END IF;

  IF v_prediction.closes_at IS NOT NULL AND v_prediction.closes_at <= v_now THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Prediction is closed');
  END IF;

  -- ========== 3. Validate option ==========
  SELECT EXISTS (
    SELECT 1 FROM prediction_options
    WHERE id = p_option_id AND prediction_id = p_prediction_id
  ) INTO v_option_exists;

  IF NOT v_option_exists THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Option not found');
  END IF;

  -- ========== 4. Check coin balance ==========
  IF v_user.coin_balance < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not enough coins');
  END IF;

  -- ========== 5. Calculate insurance cost ==========
  IF p_insurance THEN
    v_insurance_cost := GREATEST(
      FLOOR(p_amount * GREATEST(0.05, 0.20 - (LN(GREATEST(p_amount, 10) / 10) * 0.05))),
      1
    );

    IF v_user.profit_score < v_insurance_cost THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Not enough green ammo for insurance');
    END IF;
  END IF;

  -- ========== 6. Check for duplicate prediction ==========
  IF EXISTS (
    SELECT 1 FROM prediction_entries
    WHERE user_id = p_user_id AND prediction_id = p_prediction_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You have already predicted this question');
  END IF;

  -- ========== 7. Update user balances (let DB calculate) ==========
  UPDATE users
  SET
    coin_balance = coin_balance - p_amount,
    profit_score = CASE 
      WHEN p_insurance THEN profit_score - v_insurance_cost
      ELSE profit_score
    END,
    lifetime_profit = GREATEST(0, lifetime_profit - p_amount),
    updated_at = v_now
  WHERE id = p_user_id;

  -- ========== 8. READ ACTUAL BALANCES FROM DB (not calculated) ==========
  SELECT coin_balance, profit_score, lifetime_profit
  INTO v_coin_balance_after, v_profit_score_after, v_lifetime_profit_after
  FROM users
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

  -- ========== 10. Insert coin_ledger entries (use ACTUAL DB values) ==========
  -- Ledger: bet deduction
  INSERT INTO coin_ledger (user_id, type, amount, balance_after, ref_type, ref_id, detail)
  VALUES (
    p_user_id,
    'predict',
    -p_amount,
    v_coin_balance_after,  -- ✅ Actual DB value
    'prediction_entry',
    v_entry_id,
    'Tournament: ' || v_prediction.tournament_name || ' · Question: ' || v_prediction.question || ' · Status: Running'
  );

  -- Ledger: insurance cost (if applicable)
  IF p_insurance AND v_insurance_cost > 0 THEN
    INSERT INTO coin_ledger (user_id, type, amount, balance_after, ref_type, ref_id, detail)
    VALUES (
      p_user_id,
      'insurance',
      -v_insurance_cost,
      v_profit_score_after,  -- ✅ Actual DB value
      'prediction_entry',
      v_entry_id,
      'Tournament: ' || v_prediction.tournament_name || ' · Insurance Cost: ' || v_insurance_cost || ' green ammo'
    );
  END IF;

  -- ========== 11. Return success (use ACTUAL DB values) ==========
  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'entryId', v_entry_id,
      'amount', p_amount,
      'insurance', p_insurance,
      'insuranceCost', v_insurance_cost,
      'coinBalanceAfter', v_coin_balance_after,  -- ✅ Actual DB value
      'profitScoreAfter', v_profit_score_after,  -- ✅ Actual DB value
      'lifetimeProfitAfter', v_lifetime_profit_after  -- ✅ Actual DB value
    )
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION place_prediction_atomic(uuid, uuid, uuid, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION place_prediction_atomic(uuid, uuid, uuid, integer, boolean) TO service_role;
