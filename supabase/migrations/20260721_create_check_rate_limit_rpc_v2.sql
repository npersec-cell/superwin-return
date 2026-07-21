-- =====================================================
-- Migration: Create check_rate_limit RPC function
-- Date: 2026-07-21
-- PURPOSE: Enable rate limiting for API endpoints
-- NOTE: This RPC was referenced in code but never created!
-- =====================================================

-- Rate limit log table (stores request timestamps)
CREATE TABLE IF NOT EXISTS rate_limit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL, -- user_id or IP address
  endpoint text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Index for fast cleanup and lookup
CREATE INDEX IF NOT EXISTS idx_rate_limit_lookup 
  ON rate_limit_log(identifier, endpoint, created_at);

-- Auto-cleanup: delete old entries (> 24 hours) daily
-- Run manually or set up pg_cron if available
-- DELETE FROM rate_limit_log WHERE created_at < now() - interval '24 hours';

-- ── RPC FUNCTION: Check rate limit ──
DROP FUNCTION IF EXISTS check_rate_limit(text, text, integer, integer);

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_identifier text,
  p_endpoint text,
  p_max_requests integer,
  p_window_minutes integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_window_start timestamptz;
  v_count integer;
  v_reset_at timestamptz;
  v_first_request timestamptz;
BEGIN
  -- Calculate window start time
  v_window_start := now() - (p_window_minutes || ' minutes')::interval;
  
  -- Count requests in current window
  SELECT COUNT(*), MIN(created_at)
  INTO v_count, v_first_request
  FROM rate_limit_log
  WHERE identifier = p_identifier
    AND endpoint = p_endpoint
    AND created_at >= v_window_start;
  
  -- Calculate reset time
  IF v_first_request IS NOT NULL THEN
    v_reset_at := v_first_request + (p_window_minutes || ' minutes')::interval;
  ELSE
    v_reset_at := now() + (p_window_minutes || ' minutes')::interval;
  END IF;
  
  -- Check if over limit
  IF v_count >= p_max_requests THEN
    -- Clean up old entries for this identifier/endpoint
    DELETE FROM rate_limit_log
    WHERE identifier = p_identifier
      AND endpoint = p_endpoint
      AND created_at < v_window_start;
    
    RETURN jsonb_build_object(
      'allowed', false,
      'count', v_count,
      'remaining', 0,
      'reset_at', v_reset_at
    );
  END IF;
  
  -- Log this request
  INSERT INTO rate_limit_log (identifier, endpoint, created_at)
  VALUES (p_identifier, p_endpoint, now());
  
  -- Clean up old entries periodically (every 10th request approx)
  IF v_count % 10 = 0 THEN
    DELETE FROM rate_limit_log
    WHERE identifier = p_identifier
      AND endpoint = p_endpoint
      AND created_at < v_window_start;
  END IF;
  
  RETURN jsonb_build_object(
    'allowed', true,
    'count', v_count + 1,
    'remaining', p_max_requests - v_count - 1,
    'reset_at', v_reset_at
  );
END;
$func$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION check_rate_limit(text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION check_rate_limit(text, text, integer, integer) TO service_role;
