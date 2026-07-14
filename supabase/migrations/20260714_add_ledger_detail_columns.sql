-- Add new columns to coin_ledger for storing tournament/question/answer
-- This will prevent data loss when predictions/prediction_entries are deleted

ALTER TABLE coin_ledger 
ADD COLUMN IF NOT EXISTS tournament_name TEXT,
ADD COLUMN IF NOT EXISTS question TEXT,
ADD COLUMN IF NOT EXISTS answer TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_coin_ledger_tournament_question 
ON coin_ledger(tournament_name, question);
