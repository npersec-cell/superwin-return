-- Data Integrity Check: coin_ledger vs users.coin_balance
-- Date: 2026-06-08
-- Purpose: Verify that users.coin_balance matches the ledger

-- ============================================
-- CHECK 1: Users with mismatched balance
-- ============================================
SELECT 
  u.id as user_id,
  u.email,
  u.coin_balance as user_table_balance,
  COALESCE(latest_ledger.balance_after, 0) as ledger_balance,
  u.coin_balance - COALESCE(latest_ledger.balance_after, 0) as difference
FROM public.users u
LEFT JOIN (
  SELECT DISTINCT ON (user_id) 
    user_id, 
    balance_after
  FROM public.coin_ledger
  ORDER BY user_id, created_at DESC
) latest_ledger ON u.id = latest_ledger.user_id
WHERE u.coin_balance != COALESCE(latest_ledger.balance_after, 0)
ORDER BY ABS(u.coin_balance - COALESCE(latest_ledger.balance_after, 0)) DESC;

-- ============================================
-- CHECK 2: Orphaned ledger entries (user deleted)
-- ============================================
SELECT 
  cl.id,
  cl.user_id,
  cl.amount,
  cl.balance_after,
  cl.created_at
FROM public.coin_ledger cl
LEFT JOIN public.users u ON cl.user_id = u.id
WHERE u.id IS NULL
ORDER BY cl.created_at DESC
LIMIT 50;

-- ============================================
-- CHECK 3: Negative balance_after in ledger
-- ============================================
SELECT 
  cl.id,
  cl.user_id,
  u.email,
  cl.type,
  cl.amount,
  cl.balance_after,
  cl.created_at
FROM public.coin_ledger cl
JOIN public.users u ON cl.user_id = u.id
WHERE cl.balance_after < 0
ORDER BY cl.created_at DESC
LIMIT 50;

-- ============================================
-- CHECK 4: Balance consistency verification
-- (Recalculate balance from ledger and compare)
-- ============================================
WITH calculated_balances AS (
  SELECT 
    user_id,
    SUM(CASE 
      WHEN type = 'claim' THEN amount
      WHEN type = 'payout' THEN amount
      WHEN type = 'refund' THEN amount
      WHEN type = 'insurance_refund' THEN amount
      WHEN type = 'predict' THEN -amount
      WHEN type = 'fee' THEN -amount
      WHEN type = 'insurance' THEN -amount
      WHEN type = 'adjustment' THEN amount
      ELSE 0
    END) as calculated_balance
  FROM public.coin_ledger
  GROUP BY user_id
)
SELECT 
  u.id as user_id,
  u.email,
  u.coin_balance as stored_balance,
  COALESCE(cb.calculated_balance, 0) as calculated_balance,
  u.coin_balance - COALESCE(cb.calculated_balance, 0) as diff
FROM public.users u
LEFT JOIN calculated_balances cb ON u.id = cb.user_id
WHERE u.coin_balance != COALESCE(cb.calculated_balance, 0)
ORDER BY ABS(u.coin_balance - COALESCE(cb.calculated_balance, 0)) DESC;

-- ============================================
-- CHECK 5: Ledger balance_after sequence integrity
-- (Check if balance_after is consistent with running sum)
-- ============================================
WITH ledger_with_prev AS (
  SELECT 
    id,
    user_id,
    type,
    amount,
    balance_after,
    LAG(balance_after) OVER (PARTITION BY user_id ORDER BY created_at, id) as prev_balance_after,
    created_at
  FROM public.coin_ledger
  ORDER BY user_id, created_at, id
)
SELECT 
  user_id,
  id as ledger_id,
  type,
  amount,
  prev_balance_after,
  balance_after,
  CASE 
    WHEN type = 'predict' AND prev_balance_after IS NOT NULL 
    THEN prev_balance_after - amount
    WHEN type = 'claim' AND prev_balance_after IS NOT NULL 
    THEN prev_balance_after + amount
    WHEN type = 'payout' AND prev_balance_after IS NOT NULL 
    THEN prev_balance_after + amount
    ELSE NULL
  END as expected_balance_after,
  created_at
FROM ledger_with_prev
WHERE 
  prev_balance_after IS NOT NULL
  AND (
    (type = 'predict' AND balance_after != prev_balance_after - amount)
    OR (type = 'claim' AND balance_after != prev_balance_after + amount)
    OR (type = 'payout' AND balance_after != prev_balance_after + amount)
  )
ORDER BY user_id, created_at
LIMIT 50;

-- ============================================
-- FIX SCRIPT (Run only after verifying the issues)
-- ============================================
-- This is a COMMENTED fix script - review and uncomment if needed
/*
-- Fix users.coin_balance to match latest ledger balance_after
UPDATE public.users u
SET coin_balance = (
  SELECT balance_after 
  FROM public.coin_ledger 
  WHERE user_id = u.id 
  ORDER BY created_at DESC, id DESC 
  LIMIT 1
)
WHERE u.id IN (
  SELECT u2.id
  FROM public.users u2
  LEFT JOIN (
    SELECT DISTINCT ON (user_id) user_id, balance_after
    FROM public.coin_ledger
    ORDER BY user_id, created_at DESC
  ) latest ON u2.id = latest.user_id
  WHERE u2.coin_balance != COALESCE(latest.balance_after, 0)
);
*/
