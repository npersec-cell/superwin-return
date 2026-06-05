-- Add insurance column to prediction_entries table
-- Run this SQL in Supabase SQL Editor

ALTER TABLE prediction_entries 
ADD COLUMN IF NOT EXISTS insurance BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN prediction_entries.insurance IS 'Whether the user bought insurance for this prediction. If true, losing bet gets 50% refund.';

-- Verify the column was added
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'prediction_entries' AND column_name = 'insurance';
