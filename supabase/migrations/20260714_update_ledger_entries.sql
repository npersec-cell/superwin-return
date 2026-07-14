-- Update coin_ledger entries that have ref_type = 'prediction_entry' but don't have tournament_name/question/answer
-- This will backfill the new columns from prediction_entries, predictions, and prediction_options

-- First, add new columns if they don't exist
ALTER TABLE coin_ledger 
ADD COLUMN IF NOT EXISTS tournament_name TEXT,
ADD COLUMN IF NOT EXISTS question TEXT,
ADD COLUMN IF NOT EXISTS answer TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_coin_ledger_tournament_question 
ON coin_ledger(tournament_name, question);

-- Update coin_ledger entries that have ref_type = 'prediction_entry' and ref_id
-- but don't have tournament_name/question/answer
UPDATE coin_ledger l
SET 
  tournament_name = p.tournament_name,
  question = p.question,
  answer = o.label,
  detail = 'Tournament: ' || p.tournament_name || ' · Question: ' || p.question || ' · Answer: ' || o.label
FROM prediction_entries pe
JOIN predictions p ON pe.prediction_id = p.id
JOIN prediction_options o ON pe.option_id = o.id
WHERE l.ref_type = 'prediction_entry'
  AND l.ref_id = pe.id
  AND (l.tournament_name IS NULL OR l.question IS NULL OR l.answer IS NULL);

-- Check how many entries were updated
SELECT COUNT(*) 
FROM coin_ledger 
WHERE ref_type = 'prediction_entry' 
  AND tournament_name IS NOT NULL 
  AND question IS NOT NULL 
  AND answer IS NOT NULL;
