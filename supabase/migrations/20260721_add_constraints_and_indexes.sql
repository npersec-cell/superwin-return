-- Migration: Add critical constraints and performance indexes
-- Date: 2026-07-21
-- PURPOSE: Prevent duplicate predictions, improve query performance

-- =====================================================
-- 1. UNIQUE CONSTRAINT: Prevent same user predicting same question twice
-- =====================================================
-- First, remove any existing duplicate entries (keep the earliest one)
DELETE FROM prediction_entries pe1
WHERE EXISTS (
  SELECT 1 FROM prediction_entries pe2
  WHERE pe2.user_id = pe1.user_id 
    AND pe2.prediction_id = pe1.prediction_id
    AND pe2.created_at < pe1.created_at
);

-- Now add the unique constraint
ALTER TABLE prediction_entries 
ADD CONSTRAINT uniq_user_prediction 
UNIQUE (user_id, prediction_id);

-- =====================================================
-- 2. PERFORMANCE INDEXES
-- =====================================================

-- Index for leaderboard queries: fetch all entries for multiple users
CREATE INDEX IF NOT EXISTS idx_prediction_entries_user_status 
ON prediction_entries(user_id, status);

-- Index for running predictions lookup by user
CREATE INDEX IF NOT EXISTS idx_prediction_entries_user_running 
ON prediction_entries(user_id, status) WHERE status = 'running';

-- Index for coin_ledger lookups by user
CREATE INDEX IF NOT EXISTS idx_coin_ledger_user_created 
ON coin_ledger(user_id, created_at DESC);

-- Index for claim cooldown check
CREATE INDEX IF NOT EXISTS idx_users_next_claim 
ON users(next_claim_at) WHERE next_claim_at IS NOT NULL;

-- Index for admin dashboard: active users
CREATE INDEX IF NOT EXISTS idx_users_status 
ON users(status);

-- Index for predictions: open predictions ordered by close time
CREATE INDEX IF NOT EXISTS idx_predictions_status_closes 
ON predictions(status, closes_at) WHERE status = 'open';

-- =====================================================
-- 3. CLEANUP: Remove obsolete reload_count column reference
-- =====================================================
-- NOTE: Keep reload_count column for backward compatibility but stop using it
-- Most Active now uses claim_count instead

COMMENT ON COLUMN users.reload_count IS 'Deprecated: use claim_count instead';
