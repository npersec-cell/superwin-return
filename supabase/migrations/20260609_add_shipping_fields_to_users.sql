-- Migration: Add shipping address fields to users table for Number War system
-- Created: 2026-06-09

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS shipping_name TEXT,
ADD COLUMN IF NOT EXISTS shipping_address TEXT,
ADD COLUMN IF NOT EXISTS shipping_zipcode TEXT,
ADD COLUMN IF NOT EXISTS shipping_phone TEXT,
ADD COLUMN IF NOT EXISTS address_completed BOOLEAN DEFAULT FALSE;

-- Create index for fast lookup
CREATE INDEX IF NOT EXISTS idx_users_address_completed ON public.users(address_completed);

COMMENT ON COLUMN public.users.shipping_name IS 'Full name for shipping prizes';
COMMENT ON COLUMN public.users.shipping_address IS 'Detailed shipping address';
COMMENT ON COLUMN public.users.shipping_zipcode IS 'Postal/ZIP code';
COMMENT ON COLUMN public.users.shipping_phone IS 'Contact phone number';
COMMENT ON COLUMN public.users.address_completed IS 'Whether user has completed shipping info';
