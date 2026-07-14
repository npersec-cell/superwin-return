-- Remove profit_score column and related constraints
-- This removes the "Green Bullet" (Profit Score) feature from the system

-- 1. Remove profit_score_non_negative constraint if exists
ALTER TABLE users DROP CONSTRAINT IF EXISTS profit_score_non_negative;

-- 2. Remove profit_score column from users table
ALTER TABLE users DROP COLUMN IF EXISTS profit_score;

-- 3. Remove calculate_user_profit_score RPC function if exists
DROP FUNCTION IF EXISTS calculate_user_profit_score;

-- 4. Remove any indexes on profit_score if exists
DROP INDEX IF EXISTS idx_users_profit_score;
