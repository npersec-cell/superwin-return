-- ============================================================
-- REVERT AUTO-CLOSED PREDICTIONS
-- Run this in Supabase SQL Editor to find and revert
-- predictions that were incorrectly auto-closed
-- ============================================================

-- Step 1: Find predictions that were likely auto-closed
-- (closes_at was recently overwritten to now(), status='closed')
SELECT 
  id,
  tournament_name,
  question,
  status,
  opens_at,
  closes_at,
  updated_at,
  created_at
FROM predictions
WHERE 
  status = 'closed'
  AND closes_at > NOW() - INTERVAL '24 hours'  -- closed within last 24 hours
  AND updated_at > NOW() - INTERVAL '24 hours'
ORDER BY updated_at DESC;

-- Step 2: REVERT (run only after verifying the IDs above)
-- This reverts them to status='open' and restores closes_at from tournaments table
-- NOTE: You need to manually verify each prediction's correct closes_at
/*
UPDATE predictions
SET 
  status = 'open',
  closes_at = (
    SELECT close_at FROM tournaments 
    WHERE tournaments.name = predictions.tournament_name 
    LIMIT 1
  )
WHERE id IN (
  -- Paste the IDs from Step 1 here
  -- 'uuid-here'
);
*/

-- Step 3: If tournaments table doesn't have the right close_at,
-- you may need to manually set closes_at for each prediction:
/*
UPDATE predictions
SET 
  status = 'open',
  closes_at = '2026-06-15 18:00:00+07'  -- set correct close time here
WHERE id = 'paste-prediction-id-here';
*/
