-- Fix Number War: Add missing columns for existing tables
-- Run this if you get "column round_id does not exist" error

-- 1. Create number_war_rounds table (if not exists)
CREATE TABLE IF NOT EXISTS public.number_war_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  open_at TIMESTAMPTZ,
  close_at TIMESTAMPTZ,
  winner_slot INTEGER,
  status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'open', 'closed', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.number_war_rounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "number_war_rounds_select" ON public.number_war_rounds;
CREATE POLICY "number_war_rounds_select"
  ON public.number_war_rounds FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "number_war_rounds_admin" ON public.number_war_rounds;
CREATE POLICY "number_war_rounds_admin"
  ON public.number_war_rounds FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- 2. Add round_id to number_slots (safe for existing tables)
ALTER TABLE public.number_slots 
ADD COLUMN IF NOT EXISTS round_id UUID REFERENCES public.number_war_rounds(id) ON DELETE CASCADE;

-- 3. Add round_id to winners_log (safe for existing tables)
ALTER TABLE public.winners_log 
ADD COLUMN IF NOT EXISTS round_id UUID REFERENCES public.number_war_rounds(id) ON DELETE SET NULL;

-- 4. Create indexes
CREATE INDEX IF NOT EXISTS idx_number_slots_round ON public.number_slots(round_id);
CREATE INDEX IF NOT EXISTS idx_winners_log_round ON public.winners_log(round_id);

-- 5. Drop old unique constraint on slot_number alone (if exists)
ALTER TABLE public.number_slots 
DROP CONSTRAINT IF EXISTS number_slots_slot_number_key;

-- 6. Add composite unique constraint (ignore if exists or if duplicates)
DO $$
BEGIN
  ALTER TABLE public.number_slots
  ADD CONSTRAINT number_slots_round_slot_unique UNIQUE (round_id, slot_number);
EXCEPTION WHEN duplicate_table OR unique_violation THEN
  NULL;
END $$;

-- 7. Grants
GRANT SELECT ON public.number_war_rounds TO authenticated;
GRANT SELECT ON public.number_war_rounds TO anon;
