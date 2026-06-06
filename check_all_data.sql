-- ============================================
-- ตรวจสอบละเอียด - ดูทุกอย่างในระบบ
-- ============================================

-- 1. ดู test user ที่เจอ
SELECT '1. Test User' as section, id, email, coin_balance, lifetime_profit, role, created_at
FROM users 
WHERE email LIKE '%test%' OR email LIKE '%ทดสอบ%'
ORDER BY created_at DESC;

-- 2. ดู predictions ทั้งหมดที่สร้างล่าสุด (20 รายการ)
SELECT '2. Predictions' as section, id, status, created_at
FROM predictions
ORDER BY created_at DESC
LIMIT 20;

-- 3. ดู prediction entries ทั้งหมด
SELECT '3. Entries' as section, pe.id, pe.user_id, pe.prediction_id, pe.amount, pe.insurance_cost, pe.status, pe.created_at
FROM prediction_entries pe
ORDER BY pe.created_at DESC
LIMIT 20;

-- 4. ดู coin ledger ทั้งหมด (20 รายการล่าสุด)
SELECT '4. Ledger' as section, id, user_id, amount, type, balance_after, created_at
FROM coin_ledger
ORDER BY created_at DESC
LIMIT 20;

-- 5. นับจำนวนรายการต่างๆ
SELECT '5. Counts' as section,
  (SELECT COUNT(*) FROM users WHERE email LIKE '%test%' OR email LIKE '%ทดสอบ%') as test_users,
  (SELECT COUNT(*) FROM predictions) as total_predictions,
  (SELECT COUNT(*) FROM prediction_entries) as total_entries,
  (SELECT COUNT(*) FROM coin_ledger) as total_ledger;
