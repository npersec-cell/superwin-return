-- Migration: Add reload tracking for users
-- This migration adds columns to track user reload activity

-- Add reload_count column to track number of page reloads
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS reload_count integer NOT NULL DEFAULT 0;

-- Add last_seen_at column to track last activity
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_users_reload_count ON public.users(reload_count DESC);

-- Create RLS policy for reload tracking
-- Users can only update their own reload count
CREATE POLICY "Users can update their own reload count"
ON public.users
FOR UPDATE USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

COMMENT ON COLUMN public.users.reload_count IS 'Number of times user reloaded the page';
COMMENT ON COLUMN public.users.last_seen_at IS 'Last time user was seen on the site';

-- Enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
