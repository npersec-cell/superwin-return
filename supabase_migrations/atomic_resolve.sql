CREATE OR REPLACE FUNCTION resolve_prediction_atomic(
  p_prediction_id UUID,
  p_winning_option_id UUID,
  p_resolved_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prediction RECORD;
  v_winning_option_label TEXT;
  v_total_pool INT := 0;
  v_winning_pool INT := 0;
  v_distributable INT := 0;
  v_winners INT := 0;
  v_losers INT := 0;
  v_total_paid INT := 0;
  v_entry RECORD;
  v_payout INT := 0;
  v_profit_delta INT := 0;
  v_insurance_refund INT := 0;
  v_balance_after INT := 0;
  v_profit_score_delta INT := 0;
  v_result JSONB;
BEGIN
  SELECT id, tournament_name, question, status, fee_rate
  INTO v_prediction
  FROM predictions
  WHERE id = p_prediction_id
    AND status IN ('open', 'closed', 'resolving')
  FOR UPDATE;

  IF v_prediction.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Prediction not found or already resolved');
  END IF;

  SELECT label INTO v_winning_option_label
  FROM prediction_options
  WHERE id = p_winning_option_id AND prediction_id = p_prediction_id;

  IF v_winning_option_label IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Winning option not found');
  END IF;

  UPDATE predictions
  SET status = 'resolving', updated_at = p_resolved_at
  WHERE id = p_prediction_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_pool
  FROM prediction_entries
  WHERE prediction_id = p_prediction_id AND status = 'running';

  SELECT COALESCE(SUM(amount), 0) INTO v_winning_pool
  FROM prediction_entries
  WHERE prediction_id = p_prediction_id AND status = 'running' AND option_id = p_winning_option_id;

  v_distributable := FLOOR(v_total_pool * (1 - COALESCE(v_prediction.fee_rate, 0)));

  FOR v_entry IN
    SELECT pe.id, pe.user_id, pe.option_id, pe.amount, pe.insurance,
           u.coin_balance, u.lifetime_profit, COALESCE(u.profit_score, 0) AS profit_score
    FROM prediction_entries pe
    JOIN users u ON u.id = pe.user_id
    WHERE pe.prediction_id = p_prediction_id AND pe.status = 'running'
    FOR UPDATE OF pe, u
  LOOP
    IF v_entry.option_id = p_winning_option_id AND v_winning_pool > 0 THEN
      v_payout := FLOOR((v_entry.amount::FLOAT / v_winning_pool) * v_distributable);
      v_profit_delta := v_payout - v_entry.amount;
      v_profit_score_delta := GREATEST(0, v_profit_delta);
      v_winners := v_winners + 1;
    ELSE
      v_payout := 0;
      v_profit_delta := -v_entry.amount;
      v_profit_score_delta := 0;
      v_losers := v_losers + 1;
    END IF;

    v_insurance_refund := 0;
    IF v_entry.option_id != p_winning_option_id AND v_entry.insurance THEN
      v_insurance_refund := FLOOR(v_entry.amount * 0.5);
    END IF;

    v_balance_after := v_entry.coin_balance + v_payout + v_insurance_refund;

    UPDATE users
    SET coin_balance = v_balance_after,
        lifetime_profit = lifetime_profit + v_profit_delta,
        profit_score = profit_score + v_profit_score_delta,
        updated_at = p_resolved_at
    WHERE id = v_entry.user_id;

    UPDATE prediction_entries
    SET status = CASE WHEN v_entry.option_id = p_winning_option_id THEN 'won'::TEXT ELSE 'lost'::TEXT END,
        payout_amount = v_payout,
        resolved_at = p_resolved_at
    WHERE id = v_entry.id;

    INSERT INTO coin_ledger (user_id, type, amount, balance_after, ref_type, ref_id, detail, created_at)
    VALUES (
      v_entry.user_id,
      'payout',
      v_payout,
      v_entry.coin_balance + v_payout,
      'prediction_entry',
      v_entry.id,
      'Tournament: ' || v_prediction.tournament_name ||
      ' - Question: ' || v_prediction.question ||
      ' - Winning: ' || v_winning_option_label ||
      ' - Result: ' || CASE WHEN v_entry.option_id = p_winning_option_id THEN 'Won' ELSE 'Lost' END ||
      ' - Payout: ' || v_payout ||
      ' - Profit: ' || v_profit_delta,
      p_resolved_at
    );

    IF v_insurance_refund > 0 THEN
      INSERT INTO coin_ledger (user_id, type, amount, balance_after, ref_type, ref_id, detail, created_at)
      VALUES (
        v_entry.user_id,
        'insurance_refund',
        v_insurance_refund,
        v_balance_after,
        'prediction_entry',
        v_entry.id,
        'Tournament: ' || v_prediction.tournament_name ||
        ' - Question: ' || v_prediction.question ||
        ' - Insurance Refund: 50% of ' || v_entry.amount || ' = ' || v_insurance_refund,
        p_resolved_at
      );
    END IF;

    v_total_paid := v_total_paid + v_payout;
  END LOOP;

  UPDATE predictions
  SET status = 'resolved',
      winning_option_id = p_winning_option_id,
      resolved_at = p_resolved_at,
      updated_at = p_resolved_at
  WHERE id = p_prediction_id;

  v_result := jsonb_build_object(
    'ok', TRUE,
    'data', jsonb_build_object(
      'predictionId', p_prediction_id,
      'winningOptionId', p_winning_option_id,
      'winners', v_winners,
      'losers', v_losers,
      'totalPool', v_total_pool,
      'winningPool', v_winning_pool,
      'distributable', v_distributable,
      'totalPaid', v_total_paid
    )
  );

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    UPDATE predictions
    SET status = 'open', updated_at = p_resolved_at
    WHERE id = p_prediction_id AND status = 'resolving';
    RAISE;
END;
$$;
