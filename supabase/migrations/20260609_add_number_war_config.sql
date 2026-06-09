-- Migration: Add number_war_config table for open/close dates
-- Created: 2026-06-09

CREATE TABLE IF NOT EXISTS public.number_war_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  open_at TIMESTAMPTZ,
  close_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default config if not exists (open immediately, close in 7 days)
INSERT INTO public.number_war_config (open_at, close_at, is_active)
SELECT now(), now() + interval '7 days', true
WHERE NOT EXISTS (SELECT 1 FROM public.number_war_config);

-- Enable RLS
ALTER TABLE public.number_war_config ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS number_war_config_read ON public.number_war_config;
DROP POLICY IF EXISTS number_war_config_admin ON public.number_war_config;

-- Policy: anyone can read config
CREATE POLICY number_war_config_read ON public.number_war_config
  FOR SELECT USING (true);

-- Policy: only admins can modify
CREATE POLICY number_war_config_admin ON public.number_war_config
  FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- Grant permissions
GRANT SELECT ON public.number_war_config TO authenticated;
GRANT SELECT ON public.number_war_config TO anon;
