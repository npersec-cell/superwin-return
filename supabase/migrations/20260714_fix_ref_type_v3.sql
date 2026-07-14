-- Fix coin_ledger entries with ref_type = 'prediction' to use ref_type = 'prediction_entry'
-- These entries were created before RPC function was updated

-- Step 1: First update ref_type and ref_id
UPDATE coin_ledger l
SET 
  ref_type = 'prediction_entry',
  ref_id = pe.id
FROM prediction_entries pe
WHERE l.ref_type = 'prediction'
  AND l.ref_id = pe.prediction_id
  AND l.amount = -pe.amount;

-- Step 2: Then update detail for entries that have ref_type = 'prediction_entry' but detail = 'Bet placed'
UPDATE coin_ledger l
SET detail = 'Tournament: ' || p.tournament_name || ' · Question: ' || p.question || ' · Answer: ' || o.label
FROM prediction_entries pe
JOIN predictions p ON pe.prediction_id = p.id
JOIN prediction_options o ON pe.option_id = o.id
WHERE l.ref_type = 'prediction_entry'
  AND l.ref_id = pe.id
  AND l.detail = 'Bet placed';

-- Check how many entries were updated
SELECT COUNT(*) 
FROM coin_ledger 
WHERE ref_type = 'prediction_entry' 
  AND detail LIKE 'Tournament: %';
