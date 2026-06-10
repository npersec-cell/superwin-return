SELECT id, question, opens_at, closes_at, updated_at
FROM predictions
ORDER BY created_at DESC
LIMIT 5;
