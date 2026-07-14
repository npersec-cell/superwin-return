-- Update coin_ledger entries that have ref_type = 'prediction' but don't have tournament_name/question/answer
-- These entries were created before RPC function was updated

-- First, check if there are matching prediction_entries for these coin_ledger entries
-- by using prediction_id (ref_id) and amount

-- Step 1: Find matching prediction_entries by prediction_id and amount
-- Note: coin_ledger.amount is negative, prediction_entries.amount is positive
-- So we need to match with ABS(coin_ledger.amount) = prediction_entries.amount

-- Step 2: Update coin_ledger entries with ref_type = 'prediction'
UPDATE coin_ledger l
SET 
  tournament_name = p.tournament_name,
  question = p.question,
  answer = o.label,
  detail = 'Tournament: ' || p.tournament_name || ' · Question: ' || p.question || ' · Answer: ' || o.label
FROM prediction_entries pe
JOIN predictions p ON pe.prediction_id = p.id
JOIN prediction_options o ON pe.option_id = o.id
WHERE l.ref_type = 'prediction'
  AND l.ref_id = pe.prediction_id
  AND ABS(l.amount) = pe.amount;

-- Check how many entries were updated
SELECT COUNT(*) 
FROM coin_ledger 
WHERE ref_type = 'prediction' 
  AND tournament_name IS NOT NULL 
  AND question IS NOT NULL 
  AND answer IS NOT NULL;

-- Check if there are entries that still have detail = 'Bet placed'
SELECT COUNT(*) 
FROM coin_ledger 
WHERE type = 'predict' 
  AND detail = 'Bet placed';
