-- ============================================
-- ทดสอบทั้ง 5 สถานการณ์เงิน (SQL Version)
-- รันทีละข้อใน Supabase SQL Editor
-- ============================================

-- ============================================
-- STEP 0: เตรียม Test User
-- ============================================
-- ใช้ User แรกที่ไม่ใช่ Admin (แก้ไขตามต้องการ)
-- หรือระบุ UUID ของ user ที่ต้องการทดสอบ

-- ดู user ที่มีอยู่ (เลือกคนที่จะทดสอบ)
SELECT id, email, coin_balance, profit_score, lifetime_profit 
FROM users 
WHERE role != 'admin' 
ORDER BY coin_balance DESC 
LIMIT 5;

-- ============================================
-- STEP 0.5: ระบุ User ที่จะทดสอบ (แก้ค่านี้)
-- ============================================
-- แก้ UUID ด้านล่างตาม user ที่ต้องการทดสอบ
-- ตัวอย่าง: '23dc8902-7d60-4718-89c2-fee6c3fd9889'

-- ============================================
-- STEP 1: สร้าง Prediction ทดสอบ
-- ============================================

-- หา Admin ID
WITH admin_user AS (
  SELECT id FROM users WHERE role = 'admin' LIMIT 1
)
INSERT INTO predictions (
  id, question, status, closes_at, created_by, created_at, updated_at
)
SELECT 
  gen_random_uuid(),
  'ทดสอบที่ 1: ชนะ ไม่มีประกัน (auto)',
  'open',
  NOW() + INTERVAL '1 hour',
  id,
  NOW(),
  NOW()
FROM admin_user
RETURNING id AS prediction_id;

-- จด prediction_id ที่ได้ → ใส่ในตัวแปร @pred1_id ด้านล่าง
-- สร้าง Options A และ B (แก้ prediction_id ตามที่ได้)
INSERT INTO options (id, prediction_id, label, created_at)
VALUES 
  (gen_random_uuid(), 'PREDICTION_UUID_HERE', 'A', NOW()),
  (gen_random_uuid(), 'PREDICTION_UUID_HERE', 'B', NOW());

-- ============================================
-- STEP 2: ดู Options ที่สร้าง
-- ============================================
SELECT id, label FROM options WHERE prediction_id = 'PREDICTION_UUID_HERE' ORDER BY label;

-- ============================================
-- STEP 3: จดค่า User ก่อนทดสอบ
-- ============================================
-- แก้ USER_UUID_HERE เป็นค่าจริง
SELECT 
  'BEFORE TEST' AS stage,
  coin_balance, 
  profit_score, 
  lifetime_profit 
FROM users 
WHERE id = 'USER_UUID_HERE';

-- ============================================
-- STEP 4: วางเดิมพัน (ไม่มีประกัน)
-- ============================================
-- แก้ค่าตามที่เหมาะสม
INSERT INTO predictions (
  id, user_id, option_id, amount, insurance, created_at
)
VALUES (
  gen_random_uuid(),
  'USER_UUID_HERE',
  'OPTION_A_UUID_HERE',
  100,
  FALSE,
  NOW()
);

-- หักเงิน user (จำลอง API)
UPDATE users SET
  coin_balance = coin_balance - 100,
  lifetime_profit = GREATEST(0, lifetime_profit - 100),
  updated_at = NOW()
WHERE id = 'USER_UUID_HERE';

-- ============================================
-- STEP 5: สรุปผล (ชนะ)
-- ============================================
-- ให้ตัวเลือก A ชนะ
SELECT resolve_prediction_atomic(
  'PREDICTION_UUID_HERE',
  'OPTION_A_UUID_HERE',
  NOW()::TEXT
) AS resolve_result;

-- ============================================
-- STEP 6: ตรวจสอบผลหลังชนะ
-- ============================================
SELECT 
  'AFTER WIN' AS stage,
  coin_balance, 
  profit_score, 
  lifetime_profit 
FROM users 
WHERE id = 'USER_UUID_HERE';

-- ============================================
-- STEP 7: ดู coin_ledger
-- ============================================
SELECT type, amount, balance_after, detail, created_at
FROM coin_ledger
WHERE user_id = 'USER_UUID_HERE'
ORDER BY created_at DESC
LIMIT 10;

-- ============================================
-- ทดสอบสถานการณ์อื่น ๆ (ทำซ้ำ STEP 1-7)
-- ============================================
-- แก้ชื่อโพย และเลือก winning option ตามต้องการ:
--
-- สถานการณ์ 2: ชนะ + มีประกัน → insurance = TRUE, winningOption = ที่ทาย
-- สถานการณ์ 3: แพ้ + มีประกัน → insurance = TRUE, winningOption = ตัวอื่น
-- สถานการณ์ 4: แพ้ + ไม่มีประกัน → insurance = FALSE, winningOption = ตัวอื่น
-- สถานการณ์ 5: Refund → ใช้ Admin Panel กดยกเลิก
