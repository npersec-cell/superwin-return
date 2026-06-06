-- ============================================
-- ตรวจสอบ coin_ledger เฉพาะ test user
-- ============================================

SELECT 'Ledger' as section, id, amount, type, balance_after, created_at
FROM coin_ledger
WHERE user_id = '371313c9-4cf5-43ea-83af-9c5035ad7dff'
ORDER BY created_at;
