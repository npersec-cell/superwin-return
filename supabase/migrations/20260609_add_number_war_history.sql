-- Add number_war_history table for tracking all Number War transactions

CREATE TABLE IF NOT EXISTS public.number_war_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  round_id UUID REFERENCES public.number_war_rounds(id) ON DELETE SET NULL,
  slot_number INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('buy', 'takeover', 'sold')),
  amount INTEGER NOT NULL,
  price INTEGER NOT NULL,
  profit INTEGER DEFAULT 0,
  opponent_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nw_history_user ON public.number_war_history(user_id);
CREATE INDEX IF NOT EXISTS idx_nw_history_round ON public.number_war_history(round_id);
CREATE INDEX IF NOT EXISTS idx_nw_history_created ON public.number_war_history(created_at DESC);

ALTER TABLE public.number_war_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "number_war_history_select_own" ON public.number_war_history;
CREATE POLICY "number_war_history_select_own"
  ON public.number_war_history FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
  ));

DROP POLICY IF EXISTS "number_war_history_insert_system" ON public.number_war_history;
CREATE POLICY "number_war_history_insert_system"
  ON public.number_war_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

GRANT SELECT ON public.number_war_history TO authenticated;
GRANT INSERT ON public.number_war_history TO authenticated;
