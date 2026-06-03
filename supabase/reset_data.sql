-- ============================================================
-- RESET ALL PREDICTION DATA (KEEP USERS)
-- รันใน Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. ลบ prediction_entries ทั้งหมด
DELETE FROM public.prediction_entries;

-- 2. ลบ prediction_options ทั้งหมด
DELETE FROM public.prediction_options;

-- 3. ลบ predictions ทั้งหมด
DELETE FROM public.predictions;

-- 4. ลบ coin_ledger ทั้งหมด
DELETE FROM public.coin_ledger;

-- 5. รีเซ็ต coin ของ users กลับเป็น 1,000 และ lifetime_profit = 0
UPDATE public.users
SET
  coin = 1000,
  lifetime_profit = 0;

-- 6. เช็คผลลัพธ์
SELECT 'users' as tbl, count(*) as cnt, 'kept' as note FROM public.users
UNION ALL
SELECT 'predictions', count(*), 'deleted' FROM public.predictions
UNION ALL
SELECT 'prediction_options', count(*), 'deleted' FROM public.prediction_options
UNION ALL
SELECT 'prediction_entries', count(*), 'deleted' FROM public.prediction_entries
UNION ALL
SELECT 'coin_ledger', count(*), 'deleted' FROM public.coin_ledger;

-- 7. เช็ค coin ของ users หลังรีเซ็ต
SELECT id, email, coin, lifetime_profit FROM public.users LIMIT 10;
