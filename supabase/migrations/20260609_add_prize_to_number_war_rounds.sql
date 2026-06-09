-- Add prize columns to number_war_rounds table
ALTER TABLE number_war_rounds 
ADD COLUMN IF NOT EXISTS prize_name TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS prize_image_url TEXT DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN number_war_rounds.prize_name IS 'Prize name for this round';
COMMENT ON COLUMN number_war_rounds.prize_image_url IS 'Prize image URL (150x150 recommended)';
