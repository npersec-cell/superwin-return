-- Migration: Create number_slots table for PUBG Number War
-- Created: 2026-06-09

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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_number_slots_owner ON public.number_slots(owner_id);
CREATE INDEX IF NOT EXISTS idx_number_slots_number ON public.number_slots(slot_number);

-- Enable RLS
ALTER TABLE public.number_slots ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "number_slots_select_all"
  ON public.number_slots FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "number_slots_insert_admin"
  ON public.number_slots FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
  ));

CREATE POLICY "number_slots_update_admin"
  ON public.number_slots FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
  ));

COMMENT ON TABLE public.number_slots IS 'Stores number slots 0-200 for PUBG Number War game';
COMMENT ON COLUMN public.number_slots.current_price IS 'Current price in coins to buy/takeover this slot';
COMMENT ON COLUMN public.number_slots.total_takeovers IS 'Number of times this slot has been taken over';
