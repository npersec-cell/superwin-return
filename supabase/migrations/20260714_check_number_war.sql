-- Check if there are Number War entries in predictions table
SELECT id, tournament_name, question, status
FROM predictions
WHERE tournament_name LIKE '%Number War%'
   OR tournament_name LIKE '%number_war%'
   OR question LIKE '%Number War%'
ORDER BY created_at DESC
LIMIT 10;
