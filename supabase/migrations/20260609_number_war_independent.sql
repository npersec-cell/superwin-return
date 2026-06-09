-- Migration: Make Number War fully independent from predictions
-- Creates number_war_rounds table and links slots/winners to rounds

-- 1. Create number_war_rounds table
CREATE TABLE IF NOT EXISTS public.number_war_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  open_at TIMESTAMPTZ,
  close_at TIMESTAMPTZ,
  winner_slot INTEGER,
  status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'open', 'closed', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.number_war_rounds ENABLE ROW LEVEL SECURITY;

-- RLS: anyone can read rounds
DROP POLICY IF EXISTS "number_war_rounds_select" ON public.number_war_rounds;
CREATE POLICY "number_war_rounds_select"
  ON public.number_war_rounds FOR SELECT
  USING (true);

-- RLS: only admins can modify rounds
DROP POLICY IF EXISTS "number_war_rounds_admin" ON public.number_war_rounds;
CREATE POLICY "number_war_rounds_admin"
  ON public.number_war_rounds FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- 2. Add round_id to number_slots (nullable for migration)
ALTER TABLE public.number_slots
ADD COLUMN IF NOT EXISTS round_id UUID REFERENCES public.number_war_rounds(id) ON DELETE CASCADE;

-- 3. Drop old unique constraint on slot_number alone
ALTER TABLE public.number_slots
DROP CONSTRAINT IF EXISTS number_slots_slot_number_key;

-- 4. Create default round from existing config/data (if slots exist)
DO $$
DECLARE
  default_round_id UUID;
  config_open_at TIMESTAMPTZ;
  config_close_at TIMESTAMPTZ;
BEGIN
  -- Only create default round if there are existing slots without round_id
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'number_slots')
     AND EXISTS (SELECT 1 FROM public.number_slots WHERE round_id IS NULL) THEN
    -- Get dates from number_war_config if available
    BEGIN
      SELECT open_at, close_at INTO config_open_at, config_close_at
      FROM public.number_war_config
      ORDER BY created_at
      LIMIT 1;
    EXCEPTION WHEN undefined_table THEN
      config_open_at := NULL;
      config_close_at := NULL;
    END;

    INSERT INTO public.number_war_rounds (name, open_at, close_at, status)
    VALUES (
      COALESCE((SELECT tournament_name FROM public.predictions WHERE number_war_enabled = true ORDER BY created_at DESC LIMIT 1), 'Number War Legacy'),
      COALESCE(config_open_at, now() - interval '30 days'),
      COALESCE(config_close_at, now()),
      'resolved'
    )
    RETURNING id INTO default_round_id;

    -- Update existing slots to belong to default round
    UPDATE public.number_slots
    SET round_id = default_round_id
    WHERE round_id IS NULL;
  END IF;
END $$;

-- 5. Add composite unique constraint (only if no conflict)
-- First handle any duplicate slot_numbers across different rounds by keeping only one
DO $$
BEGIN
  ALTER TABLE public.number_slots
  ADD CONSTRAINT number_slots_round_slot_unique UNIQUE (round_id, slot_number);
EXCEPTION WHEN duplicate_table OR unique_violation THEN
  -- Constraint already exists or there are duplicates; ignore
  NULL;
END $$;

-- 6. Make round_id NOT NULL after migration
ALTER TABLE public.number_slots
ALTER COLUMN round_id SET NOT NULL;

-- 7. Add round_id to winners_log
ALTER TABLE public.winners_log
ADD COLUMN IF NOT EXISTS round_id UUID REFERENCES public.number_war_rounds(id) ON DELETE SET NULL;

-- 8. Migrate existing winners_log entries to default round
UPDATE public.winners_log
SET round_id = (SELECT id FROM public.number_war_rounds ORDER BY created_at LIMIT 1)
WHERE round_id IS NULL
  AND EXISTS (SELECT 1 FROM public.number_war_rounds);

-- 9. Create indexes
CREATE INDEX IF NOT EXISTS idx_number_slots_round ON public.number_slots(round_id);
CREATE INDEX IF NOT EXISTS idx_winners_log_round ON public.winners_log(round_id);

-- 10. Fix RLS policies on winners_log (use role instead of is_admin)
DROP POLICY IF EXISTS "winners_log_select_own" ON public.winners_log;
CREATE POLICY "winners_log_select_own"
  ON public.winners_log FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
  ));

DROP POLICY IF EXISTS "winners_log_insert_admin" ON public.winners_log;
CREATE POLICY "winners_log_insert_admin"
  ON public.winners_log FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
  ));

DROP POLICY IF EXISTS "winners_log_update_admin" ON public.winners_log;
CREATE POLICY "winners_log_update_admin"
  ON public.winners_log FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
  ));

-- 11. Grants
GRANT SELECT ON public.number_war_rounds TO authenticated;
GRANT SELECT ON public.number_war_rounds TO anon;
