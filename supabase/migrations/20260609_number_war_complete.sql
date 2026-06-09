-- Complete Number War Setup (idempotent)
-- Run this if you're setting up Number War for the first time
-- or if previous migrations failed due to missing dependencies

-- 1. Create number_slots table (if not exists)
CREATE TABLE IF NOT EXISTS public.number_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_number INTEGER NOT NULL CHECK (slot_number >= 0 AND slot_number <= 200),
  owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  current_price INTEGER NOT NULL DEFAULT 10,
  total_takeovers INTEGER NOT NULL DEFAULT 0,
  round_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_number_slots_owner ON public.number_slots(owner_id);
CREATE INDEX IF NOT EXISTS idx_number_slots_number ON public.number_slots(slot_number);
CREATE INDEX IF NOT EXISTS idx_number_slots_round ON public.number_slots(round_id);

ALTER TABLE public.number_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view number slots" ON public.number_slots;
CREATE POLICY "Public can view number slots"
  ON public.number_slots FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can update slots" ON public.number_slots;
CREATE POLICY "Authenticated users can update slots"
  ON public.number_slots FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 2. Create winners_log table (if not exists)
CREATE TABLE IF NOT EXISTS public.winners_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  match_name TEXT NOT NULL,
  winning_score INTEGER NOT NULL,
  slot_number INTEGER NOT NULL,
  round_id UUID,
  shipping_status TEXT DEFAULT 'pending' CHECK (shipping_status IN ('pending', 'preparing', 'shipped', 'delivered')),
  tracking_number TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_winners_log_user ON public.winners_log(user_id);
CREATE INDEX IF NOT EXISTS idx_winners_log_round ON public.winners_log(round_id);

ALTER TABLE public.winners_log ENABLE ROW LEVEL SECURITY;

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

-- 3. Create number_war_rounds table (if not exists)
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

-- 4. Link number_slots to rounds (add round_id if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'number_slots' AND column_name = 'round_id'
  ) THEN
    ALTER TABLE public.number_slots ADD COLUMN round_id UUID REFERENCES public.number_war_rounds(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 5. Link winners_log to rounds (add round_id if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'winners_log' AND column_name = 'round_id'
  ) THEN
    ALTER TABLE public.winners_log ADD COLUMN round_id UUID REFERENCES public.number_war_rounds(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 6. Create composite unique constraint on number_slots (round_id, slot_number)
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
GRANT SELECT ON public.number_slots TO authenticated;
GRANT SELECT ON public.number_slots TO anon;
