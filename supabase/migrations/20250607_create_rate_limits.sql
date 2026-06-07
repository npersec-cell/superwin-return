-- Rate Limiting Table
-- Stores API request counts for rate limiting

CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier text NOT NULL,  -- IP address or user ID
  endpoint text NOT NULL,     -- API endpoint
  count integer DEFAULT 1,    -- Number of requests
  window_start timestamptz DEFAULT now(),  -- Start of rate limit window
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Unique constraint for upsert
  UNIQUE(identifier, endpoint, window_start)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup 
  ON public.rate_limits(identifier, endpoint, window_start);

-- Index for cleanup (remove old entries)
CREATE INDEX IF NOT EXISTS idx_rate_limits_cleanup 
  ON public.rate_limits(window_start);

-- Enable RLS (only service role can access)
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- No public access (service role only)
CREATE POLICY "Service role only" ON public.rate_limits
  FOR ALL USING (auth.role() = 'service_role');

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_rate_limits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_rate_limits_updated_at
  BEFORE UPDATE ON public.rate_limits
  FOR EACH ROW
  EXECUTE FUNCTION update_rate_limits_updated_at();

-- Cleanup function (call periodically)
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM public.rate_limits 
  WHERE window_start < now() - interval '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
