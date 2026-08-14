-- Migration: Create BTC Quick Predict 24/7 feature
-- Date: 2026-08-14
-- PURPOSE: Enable continuous BTC/USD up/down predictions with auto-resolution

-- ── 1. Create btc_quick_predictions table ──
CREATE TABLE IF NOT EXISTS public.btc_quick_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  direction text NOT NULL CHECK (direction IN ('UP', 'DOWN')),
  duration_seconds integer NOT NULL CHECK (duration_seconds IN (60, 300, 900)),
  entry_price numeric(12, 2) NOT NULL,
  exit_price numeric(12, 2),
  stake_amount integer NOT NULL CHECK (stake_amount IN (100, 500, 1000)),
  multiplier numeric(3, 1) NOT NULL DEFAULT 1.9,
  potential_payout integer NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'won', 'lost', 'refunded')),
  payout_amount integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  expires_at timestamptz NOT NULL
);

-- ── 2. Indexes for performance ──
CREATE INDEX IF NOT EXISTS idx_btc_quick_user_status 
  ON public.btc_quick_predictions(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_btc_quick_expires 
  ON public.btc_quick_predictions(expires_at) WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_btc_quick_created 
  ON public.btc_quick_predictions(created_at DESC);

-- ── 3. Add 'quick_predict' to coin_ledger type ──
-- Note: PostgreSQL enums can't be easily altered, so we use text check constraint
-- The coin_ledger.type already uses text with CHECK, so we just need to update the constraint
-- Actually, looking at schema, coin_ledger.type uses CHECK constraint, not ENUM
-- So we need to drop and recreate the constraint to add 'quick_predict' type
ALTER TABLE public.coin_ledger DROP CONSTRAINT IF EXISTS coin_ledger_type_check;
ALTER TABLE public.coin_ledger ADD CONSTRAINT coin_ledger_type_check 
  CHECK (type IN ('claim', 'predict', 'payout', 'refund', 'fee', 'adjustment', 'insurance', 'insurance_refund', 'quick_predict', 'quick_payout', 'quick_refund'));

-- ── 4. Atomic function: place BTC quick prediction ──
DROP FUNCTION IF EXISTS place_btc_quick_predict_atomic(uuid, text, integer, numeric, integer, numeric);

CREATE OR REPLACE FUNCTION place_btc_quick_predict_atomic(
  p_user_id uuid,
  p_direction text,
  p_duration_seconds integer,
  p_entry_price numeric,
  p_stake_amount integer,
  p_multiplier numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user RECORD;
  v_entry_id uuid;
  v_now timestamptz := now();
  v_expires_at timestamptz;
  v_potential_payout integer;
  v_balance_after integer;
BEGIN
  -- ========== 1. Lock user row (prevents race condition) ==========
  SELECT id, coin_balance, status
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

  -- ========== 2. Validate stake amount ==========
  IF p_stake_amount NOT IN (100, 500, 1000) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Stake must be 100, 500, or 1000');
  END IF;

  -- ========== 3. Check coin balance ==========
  IF v_user.coin_balance < p_stake_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient coins');
  END IF;

  -- ========== 4. Calculate values ==========
  v_expires_at := v_now + (p_duration_seconds || ' seconds')::interval;
  v_potential_payout := floor(p_stake_amount * p_multiplier)::integer;

  -- ========== 5. Deduct coins from user balance ==========
  v_balance_after := v_user.coin_balance - p_stake_amount;
  UPDATE users
  SET coin_balance = v_balance_after,
      updated_at = v_now
  WHERE id = p_user_id;

  -- ========== 6. Create prediction entry ==========
  INSERT INTO btc_quick_predictions (
    user_id, direction, duration_seconds, entry_price, 
    stake_amount, multiplier, potential_payout, expires_at
  ) VALUES (
    p_user_id, p_direction, p_duration_seconds, p_entry_price,
    p_stake_amount, p_multiplier, v_potential_payout, v_expires_at
  ) RETURNING id INTO v_entry_id;

  -- ========== 7. Record coin ledger entry ==========
  INSERT INTO coin_ledger (user_id, type, amount, balance_after, ref_type, ref_id, detail)
  VALUES (
    p_user_id, 'quick_predict', -p_stake_amount, v_balance_after,
    'btc_quick_prediction', v_entry_id,
    format('BTC Quick Predict %s %s coins @ $%s', p_direction, p_stake_amount, p_entry_price)
  );

  -- ========== 8. Return success ==========
  RETURN jsonb_build_object(
    'ok', true,
    'entryId', v_entry_id,
    'balanceAfter', v_balance_after,
    'expiresAt', v_expires_at,
    'potentialPayout', v_potential_payout
  );
END;
$func$;

-- ── 5. Function: Auto-resolve expired BTC quick predictions ──
DROP FUNCTION IF EXISTS resolve_expired_btc_quick_predictions(numeric);

CREATE OR REPLACE FUNCTION resolve_expired_btc_quick_predictions(
  p_current_btc_price numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_rec RECORD;
  v_won_count integer := 0;
  v_lost_count integer := 0;
  v_total_payout integer := 0;
  v_user_balance integer;
  v_payout integer;
  v_now timestamptz := now();
BEGIN
  -- Loop through all expired running predictions
  FOR v_rec IN 
    SELECT id, user_id, direction, entry_price, stake_amount, multiplier, potential_payout
    FROM btc_quick_predictions
    WHERE status = 'running' AND expires_at <= v_now
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Determine win/loss
    IF (v_rec.direction = 'UP' AND p_current_btc_price > v_rec.entry_price)
       OR (v_rec.direction = 'DOWN' AND p_current_btc_price < v_rec.entry_price) THEN
      -- User won
      v_payout := v_rec.potential_payout;
      
      -- Credit user
      UPDATE users SET coin_balance = coin_balance + v_payout, updated_at = v_now
      WHERE id = v_rec.user_id
      RETURNING coin_balance INTO v_user_balance;

      -- Record payout in ledger
      INSERT INTO coin_ledger (user_id, type, amount, balance_after, ref_type, ref_id, detail)
      VALUES (
        v_rec.user_id, 'quick_payout', v_payout, v_user_balance,
        'btc_quick_prediction', v_rec.id,
        format('BTC Quick Predict WIN: %s @ $%s → $%s (+%s)', v_rec.direction, v_rec.entry_price, p_current_btc_price, v_payout)
      );

      -- Mark as won
      UPDATE btc_quick_predictions 
      SET status = 'won', exit_price = p_current_btc_price, resolved_at = v_now, payout_amount = v_payout
      WHERE id = v_rec.id;

      v_won_count := v_won_count + 1;
      v_total_payout := v_total_payout + v_payout;

    ELSIF p_current_btc_price = v_rec.entry_price THEN
      -- Exact same price = refund
      UPDATE users SET coin_balance = coin_balance + v_rec.stake_amount, updated_at = v_now
      WHERE id = v_rec.user_id
      RETURNING coin_balance INTO v_user_balance;

      INSERT INTO coin_ledger (user_id, type, amount, balance_after, ref_type, ref_id, detail)
      VALUES (
        v_rec.user_id, 'quick_refund', v_rec.stake_amount, v_user_balance,
        'btc_quick_prediction', v_rec.id,
        format('BTC Quick Predict REFUND: same price $%s', v_rec.entry_price)
      );

      UPDATE btc_quick_predictions 
      SET status = 'refunded', exit_price = p_current_btc_price, resolved_at = v_now
      WHERE id = v_rec.id;
    ELSE
      -- User lost: get current balance (already deducted stake at bet time)
      SELECT coin_balance INTO v_user_balance FROM users WHERE id = v_rec.user_id;
      
      INSERT INTO coin_ledger (user_id, type, amount, balance_after, ref_type, ref_id, detail)
      VALUES (
        v_rec.user_id, 'fee', 0, v_user_balance,
        'btc_quick_prediction', v_rec.id,
        format('BTC Quick Predict LOSS: %s @ $%s → $%s (-%s)', v_rec.direction, v_rec.entry_price, p_current_btc_price, v_rec.stake_amount)
      );

      UPDATE btc_quick_predictions 
      SET status = 'lost', exit_price = p_current_btc_price, resolved_at = v_now
      WHERE id = v_rec.id;

      v_lost_count := v_lost_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'resolved', v_won_count + v_lost_count,
    'won', v_won_count,
    'lost', v_lost_count,
    'totalPayout', v_total_payout
  );
END;
$func$;

-- ── 6. RLS Policies ──
ALTER TABLE public.btc_quick_predictions ENABLE ROW LEVEL SECURITY;

-- Users can see their own predictions
DROP POLICY IF EXISTS "Users can view own BTC predictions" ON public.btc_quick_predictions;
CREATE POLICY "Users can view own BTC predictions"
  ON public.btc_quick_predictions FOR SELECT
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ));

-- Anyone can insert (via RPC function which runs as SECURITY DEFINER)
DROP POLICY IF EXISTS "Enable insert via RPC" ON public.btc_quick_predictions;
CREATE POLICY "Enable insert via RPC"
  ON public.btc_quick_predictions FOR INSERT
  WITH CHECK (true);

-- Users can only update their own (for resolve)
DROP POLICY IF EXISTS "Users can update own BTC predictions" ON public.btc_quick_predictions;
CREATE POLICY "Users can update own BTC predictions"
  ON public.btc_quick_predictions FOR UPDATE
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ));

COMMENT ON TABLE public.btc_quick_predictions IS 'BTC/USD quick 24/7 predictions: UP/DOWN within 1/5/15 minutes';
