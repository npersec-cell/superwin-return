-- ============================================
-- แก้ไขประวัติยอดเงินผิดพลาดทั้งหมด
-- รันที่ Supabase SQL Editor
-- สร้างเมื่อ: 2026-06-07
-- ============================================

-- ============================================
-- ขั้นตอนที่ 1: สร้างตารางสำรองข้อมูล (ความปลอดภัยก่อน!)
-- ============================================

CREATE TABLE IF NOT EXISTS coin_ledger_backup_20250607 AS 
SELECT * FROM coin_ledger;

CREATE TABLE IF NOT EXISTS users_backup_20250607 AS 
SELECT id, coin_balance, profit_score, lifetime_profit, updated_at 
FROM users;

SELECT '✅ สำรองข้อมูลเรียบร้อย: coin_ledger_backup_20250607, users_backup_20250607' AS สถานะ;

-- ============================================
-- ขั้นตอนที่ 2: แก้ไข coin_ledger.balance_after สำหรับทุก user
-- ให้บัญชีสมุดรายการ (ledger) สอดคล้องกันภายใน
-- ============================================

DO $$
DECLARE
  user_rec RECORD;
  ledger_rec RECORD;
  expected_balance NUMERIC;
  first_entry BOOLEAN;
  rows_fixed INTEGER := 0;
  total_rows_fixed INTEGER := 0;
BEGIN
  RAISE NOTICE 'เริ่มแก้ไขยอดเงินใน coin_ledger...';
  
  FOR user_rec IN 
    SELECT DISTINCT user_id FROM coin_ledger ORDER BY user_id 
  LOOP
    first_entry := TRUE;
    rows_fixed := 0;
    
    FOR ledger_rec IN 
      SELECT id, amount, balance_after, created_at
      FROM coin_ledger
      WHERE user_id = user_rec.user_id
      ORDER BY created_at ASC, id ASC
    LOOP
      IF first_entry THEN
        -- รักษา balance_after ของรายการแรกไว้ตามเดิม (ไม่สามารถตรวจสอบยอดเริ่มต้นได้)
        expected_balance := ledger_rec.balance_after;
        first_entry := FALSE;
      ELSE
        -- ยอดเงินที่ถูกต้อง = ยอดเงินก่อนหน้า + จำนวนเงินของรายการปัจจุบัน
        expected_balance := expected_balance + ledger_rec.amount;
      END IF;
      
      -- อัพเดทหากพบความไม่ตรงกัน
      IF ABS(expected_balance - ledger_rec.balance_after) > 0.01 THEN
        UPDATE coin_ledger
        SET balance_after = expected_balance
        WHERE id = ledger_rec.id;
        
        rows_fixed := rows_fixed + 1;
      END IF;
    END LOOP;
    
    IF rows_fixed > 0 THEN
      RAISE NOTICE 'User %: แก้ไข % รายการ', user_rec.user_id, rows_fixed;
    END IF;
    
    total_rows_fixed := total_rows_fixed + rows_fixed;
  END LOOP;
  
  RAISE NOTICE '✅ แก้ไข % รายการ ledger สำหรับทุก user', total_rows_fixed;
END $$;

SELECT '✅ ขั้นตอนที่ 2 เสร็จสิ้น: coin_ledger.balance_after แก้ไขเรียบร้อย' AS สถานะ;

-- ============================================
-- ขั้นตอนที่ 3: ซิงค์ users.coin_balance กับรายการ ledger ล่าสุด
-- ============================================

UPDATE users u
SET coin_balance = (
  SELECT balance_after 
  FROM coin_ledger cl
  WHERE cl.user_id = u.id
  ORDER BY cl.created_at DESC, cl.id DESC
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM coin_ledger cl WHERE cl.user_id = u.id
);

SELECT '✅ ขั้นตอนที่ 3 เสร็จสิ้น: users.coin_balance ซิงค์กับ ledger แล้ว' AS สถานะ;
SELECT COUNT(*) AS จำนวน_user_ที่อัพเดท FROM users WHERE role != 'admin';

-- ============================================
-- ขั้นตอนที่ 4: คำนวณ users.lifetime_profit ใหม่สำหรับทุก user
-- สูตร: ผลรวม amount ของ predict + payout + refund + insurance_refund
-- ============================================

UPDATE users
SET lifetime_profit = (
  SELECT COALESCE(SUM(amount), 0)
  FROM coin_ledger
  WHERE coin_ledger.user_id = users.id
    AND type IN ('predict', 'payout', 'refund', 'insurance_refund')
)
WHERE role != 'admin';

SELECT '✅ ขั้นตอนที่ 4 เสร็จสิ้น: users.lifetime_profit คำนวณใหม่เรียบร้อย' AS สถานะ;

-- ============================================
-- ขั้นตอนที่ 5: ตรวจสอบ - เช็คว่ายังมีความไม่ตรงกันเหลืออยู่หรือไม่
-- ============================================

SELECT '=== ผลการตรวจสอบ ===' AS สถานะ;

-- ตรวจสอบที่ 1: coin_balance กับ ledger ล่าสุด
SELECT 
  u.id AS user_id,
  u.coin_balance AS ยอดเงินใน_users,
  (SELECT balance_after FROM coin_ledger cl WHERE cl.user_id = u.id ORDER BY cl.created_at DESC, cl.id DESC LIMIT 1) AS ยอดเงิน_ledger_ล่าสุด,
  'coin_balance ไม่ตรงกัน' AS ปัญหา
FROM users u
WHERE u.role != 'admin'
  AND u.coin_balance != (
    SELECT balance_after FROM coin_ledger cl 
    WHERE cl.user_id = u.id 
    ORDER BY cl.created_at DESC, cl.id DESC 
    LIMIT 1
  );

-- ตรวจสอบที่ 2: lifetime_profit กับที่คำนวณได้
SELECT 
  u.id AS user_id,
  u.lifetime_profit AS ยอดเก็บไว้,
  (SELECT COALESCE(SUM(amount), 0) FROM coin_ledger cl2 WHERE cl2.user_id = u.id AND cl2.type IN ('predict', 'payout', 'refund', 'insurance_refund')) AS ยอดที่คำนวณ,
  'lifetime_profit ไม่ตรงกัน' AS ปัญหา
FROM users u
WHERE u.role != 'admin'
  AND ABS(
    u.lifetime_profit - 
    (SELECT COALESCE(SUM(amount), 0) FROM coin_ledger cl2 WHERE cl2.user_id = u.id AND cl2.type IN ('predict', 'payout', 'refund', 'insurance_refund'))
  ) > 0.01;

SELECT 'หากไม่มีแถวขึ้นมา แสดงว่าแก้ไขสำเร็จทั้งหมด!' AS สถานะ;

-- ============================================
-- ขั้นตอนที่ 6: สรุปผล
-- ============================================

SELECT '=== สรุปผล ===' AS สถานะ;

SELECT 
  COUNT(*) AS จำนวน_user_ไม่รวม_admin,
  COUNT(CASE WHEN coin_balance >= 0 THEN 1 END) AS user_ที่มียอดเงินถูกต้อง,
  MIN(coin_balance) AS ยอดเงินต่ำสุด,
  MAX(coin_balance) AS ยอดเงินสูงสุด,
  SUM(coin_balance) AS ยอดเงินรวมในระบบ,
  SUM(lifetime_profit) AS กำไรสะสมรวมทั้งหมด
FROM users
WHERE role != 'admin';

-- ============================================
-- ข้อความสุดท้าย
-- ============================================

SELECT '🎉 แก้ไขทั้งหมดเสร็จสิ้น!' AS สถานะ;
SELECT 'ตารางสำรองข้อมูล: coin_ledger_backup_20250607, users_backup_20250607' AS ข้อมูลสำรอง;
SELECT 'วิธี rollback: INSERT INTO coin_ledger SELECT * FROM coin_ledger_backup_20250607;' AS วิธีย้อนกลับ;
