-- Migration 2: Create number_slots table for PUBG Number War (0-200)
-- FIXED: Removed IF NOT EXISTS from CREATE POLICY (PostgreSQL doesn't support it)

CREATE TABLE IF NOT EXISTS public.number_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_number INTEGER NOT NULL CHECK (slot_number >= 0 AND slot_number <= 200),
  owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  current_price INTEGER NOT NULL DEFAULT 10,
  total_takeovers INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(slot_number)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_number_slots_owner ON public.number_slots(owner_id);
CREATE INDEX IF NOT EXISTS idx_number_slots_number ON public.number_slots(slot_number);
CREATE INDEX IF NOT EXISTS idx_number_slots_price ON public.number_slots(current_price);

-- Enable RLS
ALTER TABLE public.number_slots ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Everyone can view slots
-- NOTE: DROP POLICY first to avoid duplicate policy errors
DROP POLICY IF EXISTS "Public can view number slots" ON public.number_slots;
CREATE POLICY "Public can view number slots"
  ON public.number_slots FOR SELECT
  USING (true);

-- RLS Policy: Only authenticated users can update (via API)
DROP POLICY IF EXISTS "Authenticated users can update slots" ON public.number_slots;
CREATE POLICY "Authenticated users can update slots"
  ON public.number_slots FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
