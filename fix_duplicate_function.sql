-- แก้ไข: ลบ function ที่ซ้ำซ้อน (version ที่รับ parameter เป็น text)
-- และคงไว้แค่ version ที่รับ timestamptz

-- 1. ลบ version ที่รับ text (ถ้ามี)
DROP FUNCTION IF EXISTS resolve_prediction_atomic(uuid, uuid, text);

-- 2. ตรวจสอบว่าเหลือแค่ version timestamptz
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'resolve_prediction_atomic';
