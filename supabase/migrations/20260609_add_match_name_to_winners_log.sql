-- Migration: Add match_name and winning_score to winners_log
-- Created: 2026-06-09

-- Add match_name column
ALTER TABLE public.winners_log 
ADD COLUMN IF NOT EXISTS match_name TEXT;

-- Add winning_score column (single number)
ALTER TABLE public.winners_log 
ADD COLUMN IF NOT EXISTS winning_score INTEGER;

-- Add notes for clarity
COMMENT ON COLUMN public.winners_log.match_name IS 'ชื่อการแข่งขัน เช่น PUBG Tournament Round 3';
COMMENT ON COLUMN public.winners_log.winning_score IS 'เลขที่ชนะ (0-200) เช่น 55';
