-- Fix coin_ledger entries with detail = 'Bet placed'
-- These entries were created before RPC function was updated to include ref_type/ref_id
-- We need to enrich them with tournament, question, and answer info

-- Step 1: Update coin_ledger entries that have ref_type = 'prediction_entry' and ref_id
-- but still have old detail (e.g., 'Bet placed')
UPDATE coin_ledger l
SET detail = 
  'Tournament: ' || p.tournament_name || ' · Question: ' || p.question || ' · Answer: ' || o.label
FROM prediction_entries pe
JOIN predictions p ON pe.prediction_id = p.id
JOIN prediction_options o ON pe.option_id = o.id
WHERE l.ref_type = 'prediction_entry'
  AND l.ref_id = pe.id
  AND l.detail = 'Bet placed';

-- Step 2: For entries without ref_type/ref_id, try to match by amount and timestamp
-- This is a fallback for very old entries
-- Note: This is less reliable because multiple entries might have the same amount
-- We'll use the most recent matching entry

-- First, let's check how many entries have detail = 'Bet placed' without ref_type
SELECT COUNT(*) 
FROM coin_ledger 
WHERE type = 'predict' 
  AND detail = 'Bet placed' 
  AND (ref_type IS NULL OR ref_type = '');

-- For these entries, we'll try to find matching prediction_entries by amount and created_at
-- This is complex and might not be accurate, so we'll skip this for now
-- Instead, we'll just display the amount and type in the UI
