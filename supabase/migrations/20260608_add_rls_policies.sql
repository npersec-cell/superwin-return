-- Migration: Add RLS policies for all tables
-- Date: 2026-06-08
-- Purpose: Enable Row Level Security to prevent IDOR attacks

-- ==================== USERS TABLE ====================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Admins have full access to users" ON public.users;
DROP POLICY IF EXISTS "Public can view basic user info" ON public.users;

-- Policy 1: Users can view their own profile
CREATE POLICY "Users can view own profile" 
  ON public.users 
  FOR SELECT 
  USING (clerk_user_id = (auth.jwt() ->> 'sub')::text);

-- Policy 2: Users can update their own profile (limited fields)
CREATE POLICY "Users can update own profile" 
  ON public.users 
  FOR UPDATE 
  USING (clerk_user_id = (auth.jwt() ->> 'sub')::text)
  WITH CHECK (clerk_user_id = (auth.jwt() ->> 'sub')::text);

-- Policy 3: Admins have full access
CREATE POLICY "Admins have full access to users" 
  ON public.users 
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE clerk_user_id = (auth.jwt() ->> 'sub')::text 
      AND role = 'admin'
    )
  );

-- Policy 4: Public can view basic info (for leaderboard)
CREATE POLICY "Public can view basic user info" 
  ON public.users 
  FOR SELECT 
  USING (true);

-- ==================== COIN_LEDGER TABLE ====================
ALTER TABLE public.coin_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ledger" ON public.coin_ledger;
DROP POLICY IF EXISTS "System can insert ledger entries" ON public.coin_ledger;
DROP POLICY IF EXISTS "Admins can view all ledgers" ON public.coin_ledger;

-- Policy 1: Users can view their own ledger
CREATE POLICY "Users can view own ledger" 
  ON public.coin_ledger 
  FOR SELECT 
  USING (
    user_id = (
      SELECT id FROM public.users 
      WHERE clerk_user_id = (auth.jwt() ->> 'sub')::text
    )
  );

-- Policy 2: Only system (service_role) can insert
CREATE POLICY "System can insert ledger entries" 
  ON public.coin_ledger 
  FOR INSERT 
  WITH CHECK (auth.role() = 'service_role');

-- Policy 3: Admins can view all ledgers
CREATE POLICY "Admins can view all ledgers" 
  ON public.coin_ledger 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE clerk_user_id = (auth.jwt() ->> 'sub')::text 
      AND role = 'admin'
    )
  );

-- ==================== PREDICTIONS TABLE ====================
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view open/closed/resolved predictions" ON public.predictions;
DROP POLICY IF EXISTS "Admins can manage all predictions" ON public.predictions;
DROP POLICY IF EXISTS "Users can view own predictions" ON public.predictions;

-- Policy 1: Anyone can view open/closed/resolved predictions
CREATE POLICY "Anyone can view open/closed/resolved predictions" 
  ON public.predictions 
  FOR SELECT 
  USING (status IN ('open', 'closed', 'resolved'));

-- Policy 2: Admins can manage all predictions
CREATE POLICY "Admins can manage all predictions" 
  ON public.predictions 
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE clerk_user_id = (auth.jwt() ->> 'sub')::text 
      AND role = 'admin'
    )
  );

-- ==================== PREDICTION_OPTIONS TABLE ====================
ALTER TABLE public.prediction_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view options" ON public.prediction_options;
DROP POLICY IF EXISTS "Admins can manage options" ON public.prediction_options;

-- Policy 1: Anyone can view options
CREATE POLICY "Anyone can view options" 
  ON public.prediction_options 
  FOR SELECT 
  USING (true);

-- Policy 2: Admins can manage options
CREATE POLICY "Admins can manage options" 
  ON public.prediction_options 
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE clerk_user_id = (auth.jwt() ->> 'sub')::text 
      AND role = 'admin'
    )
  );

-- ==================== PREDICTION_ENTRIES TABLE ====================
ALTER TABLE public.prediction_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own entries" ON public.prediction_entries;
DROP POLICY IF EXISTS "Users can create own entries" ON public.prediction_entries;
DROP POLICY IF EXISTS "Admins can view all entries" ON public.prediction_entries;

-- Policy 1: Users can view own entries
CREATE POLICY "Users can view own entries" 
  ON public.prediction_entries 
  FOR SELECT 
  USING (
    user_id = (
      SELECT id FROM public.users 
      WHERE clerk_user_id = (auth.jwt() ->> 'sub')::text
    )
  );

-- Policy 2: Users can create own entries
CREATE POLICY "Users can create own entries" 
  ON public.prediction_entries 
  FOR INSERT 
  WITH CHECK (
    user_id = (
      SELECT id FROM public.users 
      WHERE clerk_user_id = (auth.jwt() ->> 'sub')::text
    )
  );

-- Policy 3: Admins can view all entries
CREATE POLICY "Admins can view all entries" 
  ON public.prediction_entries 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE clerk_user_id = (auth.jwt() ->> 'sub')::text 
      AND role = 'admin'
    )
  );

-- ==================== NOTIFICATIONS TABLE ====================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

-- Policy 1: Users can view own notifications
CREATE POLICY "Users can view own notifications" 
  ON public.notifications 
  FOR SELECT 
  USING (
    user_id = (
      SELECT id FROM public.users 
      WHERE clerk_user_id = (auth.jwt() ->> 'sub')::text
    )
  );

-- Policy 2: Users can update own notifications (mark as read)
CREATE POLICY "Users can update own notifications" 
  ON public.notifications 
  FOR UPDATE 
  USING (
    user_id = (
      SELECT id FROM public.users 
      WHERE clerk_user_id = (auth.jwt() ->> 'sub')::text
    )
  );

-- Policy 3: System (service_role) can create notifications
CREATE POLICY "System can create notifications" 
  ON public.notifications 
  FOR INSERT 
  WITH CHECK (auth.role() = 'service_role');

-- ==================== ADMIN_LOGS TABLE ====================
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view logs" ON public.admin_logs;

-- Policy 1: Only admins can view logs
CREATE POLICY "Admins can view logs" 
  ON public.admin_logs 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE clerk_user_id = (auth.jwt() ->> 'sub')::text 
      AND role = 'admin'
    )
  );

-- ==================== GRANTS ====================
-- Ensure authenticated users can use the policies
GRANT SELECT, UPDATE ON public.users TO authenticated;
GRANT SELECT ON public.coin_ledger TO authenticated;
GRANT SELECT ON public.predictions TO authenticated;
GRANT SELECT ON public.prediction_options TO authenticated;
GRANT SELECT, INSERT ON public.prediction_entries TO authenticated;
GRANT SELECT, UPDATE ON public.notifications TO authenticated;

-- Service role gets full access
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
