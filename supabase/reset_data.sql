-- ============================================================
-- RESET ALL PREDICTION DATA
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

-- 5. รีเซ็ต coin ของ users กลับเป็น 1000 (หรือค่าเริ่มต้นที่ต้องการ)
--    และรีเซ็ต lifetime_profit เป็น 0
UPDATE public.users
SET
  coin = 1000,
  lifetime_profit = 0;

-- 6. เช็คผลลัพธ์
SELECT 'users' as tbl, count(*) as cnt FROM public.users
UNION ALL
SELECT 'predictions', count(*) FROM public.predictions
UNION ALL
SELECT 'prediction_options', count(*) FROM public.prediction_options
UNION ALL
SELECT 'prediction_entries', count(*) FROM public.prediction_entries
UNION ALL
SELECT 'coin_ledger', count(*) FROM public.coin_ledger;
