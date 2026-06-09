-- Migration: Create winners_log table for Number War
-- Created: 2026-06-09

CREATE TABLE IF NOT EXISTS public.winners_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  slot_number INTEGER NOT NULL CHECK (slot_number >= 0 AND slot_number <= 200),
  prediction_id UUID REFERENCES public.predictions(id) ON DELETE SET NULL,
  shipping_status TEXT NOT NULL DEFAULT 'pending' CHECK (shipping_status IN ('pending', 'processing', 'shipped', 'delivered')),
  tracking_number TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_winners_log_user ON public.winners_log(user_id);
CREATE INDEX IF NOT EXISTS idx_winners_log_status ON public.winners_log(shipping_status);
CREATE INDEX IF NOT EXISTS idx_winners_log_slot ON public.winners_log(slot_number);

-- Enable RLS
ALTER TABLE public.winners_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "winners_log_select_own"
  ON public.winners_log FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
  ));

CREATE POLICY "winners_log_insert_admin"
  ON public.winners_log FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
  ));

CREATE POLICY "winners_log_update_admin"
  ON public.winners_log FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
  ));

COMMENT ON TABLE public.winners_log IS 'Logs winners of Number War and their shipping status';
COMMENT ON COLUMN public.winners_log.shipping_status IS 'pending -> processing -> shipped -> delivered';
