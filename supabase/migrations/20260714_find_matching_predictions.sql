-- Try to find matching predictions by timestamp (within 5 minutes)
-- This is a fallback for entries that don't have matching prediction_entries

-- First, get all coin_ledger entries with ref_type = 'prediction' and detail = 'Bet placed'
WITH old_entries AS (
  SELECT id, amount, created_at, ref_id
  FROM coin_ledger 
  WHERE ref_type = 'prediction' 
    AND detail = 'Bet placed'
  ORDER BY created_at DESC
  LIMIT 10
)
-- Find matching predictions by timestamp (within 5 minutes)
SELECT oe.id, oe.amount, oe.created_at, oe.ref_id, p.id, p.tournament_name, p.question, p.created_at
FROM old_entries oe
LEFT JOIN predictions p ON ABS(EXTRACT(EPOCH FROM (oe.created_at - p.created_at))) < 300
ORDER BY oe.created_at DESC;
