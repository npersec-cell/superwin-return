-- =====================================================
-- Migration: Data Integrity & Performance Improvements
-- Date: 2026-07-21
-- PURPOSE: Add constraints, indexes, and soft delete support
-- =====================================================

-- ── 1. UNIQUE CONSTRAINT: ป้องกันการทายคำถามเดิมซ้ำ (Most Predictions anti-gaming) ──
-- นับแค่ 1 ต่อคำถาม ไม่ว่าย้ำกี่ครั้ง
ALTER TABLE prediction_entries
  ADD CONSTRAINT uniq_user_prediction 
  UNIQUE (user_id, prediction_id);

-- ── 2. PERFORMANCE INDEXES: เร่งความเร็ว query ที่ใช้บ่อย ──

-- Leaderboard queries: ดึง users เรียงตาม coin_balance
CREATE INDEX IF NOT EXISTS idx_users_coin_balance 
  ON users(coin_balance DESC);

-- Prediction entries: ดึง entries ของ user เฉพาะ status ที่ต้องการ
CREATE INDEX IF NOT EXISTS idx_entries_user_status 
  ON prediction_entries(user_id, status);

-- Prediction entries: ดึง entries ตาม prediction_id (สำหรับ open predictions)
CREATE INDEX IF NOT EXISTS idx_entries_prediction_status 
  ON prediction_entries(prediction_id, status);

-- Coin ledger: ดึงประวัติของ user เร็วขึ้น
CREATE INDEX IF NOT EXISTS idx_ledger_user_created 
  ON coin_ledger(user_id, created_at DESC);

-- Predictions: ดึง predictions ที่เปิดอยู่และยังไม่ปิด
CREATE INDEX IF NOT EXISTS idx_predictions_status_closes 
  ON predictions(status, closes_at);

-- Users: ดึง users ที่ไม่ใช่ admin/test accounts สำหรับ leaderboard
CREATE INDEX IF NOT EXISTS idx_users_role_email 
  ON users(role, email);

-- ── 3. SOFT DELETE SUPPORT: เพิ่ม deleted_at แทนการลบข้อมูลจริง ──
ALTER TABLE predictions 
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

ALTER TABLE prediction_entries 
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- ── 4. AUDIT LOG TABLE: ติดตามการเปลี่ยนแปลง coin_balance ──
CREATE TABLE IF NOT EXISTS balance_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  action_type text NOT NULL, -- 'claim', 'predict', 'payout', 'refund', 'admin_adjust'
  amount_before integer NOT NULL,
  amount_after integer NOT NULL,
  amount_delta integer NOT NULL,
  ref_type text, -- 'prediction_entry', 'claim', 'contest'
  ref_id uuid,
  detail text,
  performed_by uuid, -- null = system, otherwise admin user id
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_user_created 
  ON balance_audit_log(user_id, created_at DESC);

COMMENT ON TABLE balance_audit_log IS 'Audit trail for all coin_balance changes';

-- ── 5. TRIGGER: อัตโนมัติบันทึก audit log เมื่อ coin_balance เปลี่ยน ──
CREATE OR REPLACE FUNCTION track_balance_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.coin_balance IS DISTINCT FROM NEW.coin_balance THEN
    INSERT INTO balance_audit_log (
      user_id, action_type, amount_before, amount_after, amount_delta,
      ref_type, ref_id, detail, performed_by
    ) VALUES (
      NEW.id,
      'balance_change',
      COALESCE(OLD.coin_balance, 0),
      COALESCE(NEW.coin_balance, 0),
      COALESCE(NEW.coin_balance, 0) - COALESCE(OLD.coin_balance, 0),
      'users_table',
      NULL,
      'Auto-tracked balance change: ' || COALESCE(NEW.updated_at::text, ''),
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_track_balance_changes ON users;
CREATE TRIGGER trg_track_balance_changes
  AFTER UPDATE ON users
  FOR EACH ROW
  WHEN (OLD.coin_balance IS DISTINCT FROM NEW.coin_balance)
  EXECUTE FUNCTION track_balance_changes();

-- ── 6. HELPER FUNCTION: คำนวณ unique prediction count ต่อ user ──
-- ใช้สำหรับ leaderboard แทนการนับทุก entry
CREATE OR REPLACE FUNCTION get_unique_prediction_count(p_user_id uuid)
RETURNS integer AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(DISTINCT prediction_id) INTO v_count
  FROM prediction_entries
  WHERE user_id = p_user_id
    AND status IN ('won', 'lost', 'refunded')
    AND deleted_at IS NULL;
  RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- ── 7. HELPER FUNCTION: คำนวณ highest single win ──
CREATE OR REPLACE FUNCTION get_highest_single_win(p_user_id uuid)
RETURNS integer AS $$
DECLARE
  v_max integer;
BEGIN
  SELECT MAX(payout_amount - amount) INTO v_max
  FROM prediction_entries
  WHERE user_id = p_user_id
    AND status = 'won'
    AND deleted_at IS NULL;
  RETURN COALESCE(v_max, 0);
END;
$$ LANGUAGE plpgsql STABLE;
