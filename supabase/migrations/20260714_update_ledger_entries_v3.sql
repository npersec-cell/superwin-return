-- Update coin_ledger entries with ref_type = 'prediction' to use ref_type = 'prediction_entry'
-- and update detail with tournament/question/answer

-- Step 1: First update ref_type and ref_id
UPDATE coin_ledger l
SET 
  ref_type = 'prediction_entry',
  ref_id = pe.id,
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
WHERE ref_type = 'prediction_entry' 
  AND tournament_name IS NOT NULL 
  AND question IS NOT NULL 
  AND answer IS NOT NULL;

-- Check if there are entries that still have detail = 'Bet placed'
SELECT COUNT(*) 
FROM coin_ledger 
WHERE type = 'predict' 
  AND detail = 'Bet placed';
