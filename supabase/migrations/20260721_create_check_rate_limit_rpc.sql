-- Migration: Create check_rate_limit RPC function
-- Date: 2026-07-21
-- PURPOSE: Enable rate limiting for API endpoints (was missing!)

-- Drop existing if any
DROP FUNCTION IF EXISTS check_rate_limit(text, text, integer, integer);

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_identifier text,      -- IP address or user ID
  p_endpoint text,        -- API endpoint name
  p_max_requests integer, -- Max requests allowed in window
  p_window_minutes integer DEFAULT 10 -- Window size in minutes
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_window_start timestamptz;
  v_count integer := 0;
  v_remaining integer;
  v_reset_at timestamptz;
  v_allowed boolean;
BEGIN
  -- Calculate window start time
  v_window_start := now() - (p_window_minutes || ' minutes')::interval;

  -- Try to find existing record within current window
  SELECT count
  INTO v_count
  FROM rate_limits
  WHERE identifier = p_identifier
    AND endpoint = p_endpoint
    AND window_start > v_window_start
  ORDER BY window_start DESC
  LIMIT 1;

  IF v_count IS NULL THEN
    -- No record found, create new window
    v_count := 0;
  END IF;

  -- Check if we're still in the same window
  IF v_count > 0 THEN
    -- Get the actual window_start from the existing record
    SELECT window_start, count
    INTO v_window_start, v_count
    FROM rate_limits
    WHERE identifier = p_identifier
      AND endpoint = p_endpoint
      AND window_start > v_window_start
    ORDER BY window_start DESC
    LIMIT 1;
  ELSE
    -- Start fresh window
    v_window_start := now();
    v_count := 0;
  END IF;

  -- Check if window has expired
  IF v_window_start < (now() - (p_window_minutes || ' minutes')::interval) THEN
    -- Window expired, reset
    v_window_start := now();
    v_count := 0;
  END IF;

  -- Increment count
  v_count := v_count + 1;

  -- Calculate remaining and reset time
  v_remaining := GREATEST(0, p_max_requests - v_count);
  v_reset_at := v_window_start + (p_window_minutes || ' minutes')::interval;
  v_allowed := v_count <= p_max_requests;

  -- Upsert rate limit record
  INSERT INTO rate_limits (identifier, endpoint, count, window_start)
  VALUES (p_identifier, p_endpoint, v_count, v_window_start)
  ON CONFLICT (identifier, endpoint, window_start)
  DO UPDATE SET 
    count = v_count,
    updated_at = now();

  -- Return result
  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'count', v_count,
    'remaining', v_remaining,
    'reset_at', v_reset_at
  );
END;
$func$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION check_rate_limit(text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION check_rate_limit(text, text, integer, integer) TO service_role;

COMMENT ON FUNCTION check_rate_limit IS 'Check and increment rate limit counter for a given identifier and endpoint';
