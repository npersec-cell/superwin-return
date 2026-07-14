-- Fix coin_ledger entries with detail containing "Status: Running" to use "Answer: xxx" instead
UPDATE coin_ledger l
SET detail = 'Tournament: ' || p.tournament_name || ' · Question: ' || p.question || ' · Answer: ' || o.label
FROM prediction_entries pe
JOIN predictions p ON pe.prediction_id = p.id
JOIN prediction_options o ON pe.option_id = o.id
WHERE l.ref_type = 'prediction_entry'
  AND l.ref_id = pe.id
  AND l.detail LIKE '%Status: Running%';

-- Check how many entries were updated
SELECT COUNT(*) 
FROM coin_ledger 
WHERE detail LIKE '%Status: Running%';
