-- Migration: Add Number War fields to predictions table
-- Created: 2026-06-09

-- Add Number War configuration columns to predictions (tournaments)
ALTER TABLE public.predictions
ADD COLUMN IF NOT EXISTS number_war_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS number_war_open_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS number_war_close_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS number_war_winner_slot INTEGER;

-- Add comments for clarity
COMMENT ON COLUMN public.predictions.number_war_enabled IS 'เปิด/ปิด Number War สำหรับทัวร์นี้';
COMMENT ON COLUMN public.predictions.number_war_open_at IS 'วันเวลาเปิดรับซื้อเลข Number War';
COMMENT ON COLUMN public.predictions.number_war_close_at IS 'วันเวลาปิดรับซื้อเลข Number War';
COMMENT ON COLUMN public.predictions.number_war_winner_slot IS 'เลขที่ชนะ Number War (null = ยังไม่ประกาศ)';
