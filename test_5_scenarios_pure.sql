-- ============================================
-- ทดสอบ 5 สถานการณ์ (Pure SQL - รันได้ทุกบรรทัด)
-- รันใน Supabase SQL Editor
-- ============================================

-- ============================================
-- STEP 0: ดู User ที่มีอยู่ (เลือกคนทดสอบ)
-- ============================================
SELECT id, email, coin_balance, profit_score, lifetime_profit 
FROM users 
WHERE role != 'admin' 
ORDER BY coin_balance DESC 
LIMIT 10;

-- ^^^ จด UUID ของ user ที่ต้องการทดสอบ (คอลัมน์ id)
-- แก้ 'USER_UUID_HERE' ในขั้นตอนด้านล่างเป็นค่าจริง

-- ============================================
-- STEP 1: เตรียมข้อมูลเริ่มต้น
-- ============================================
-- แก้ 3 ค่านี้ตามที่ได้จากขั้นตอนข้างบน:
-- 1. USER_UUID_HERE = id ของ user ที่จะทดสอบ
-- 2. ADMIN_UUID_HERE = id ของ admin (หาได้จาก: SELECT id FROM users WHERE role='admin' LIMIT 1;)

SELECT 'STEP 1: ก่อนแก้ไขต้องแทนที่ USER_UUID_HERE และ ADMIN_UUID_HERE ในไฟล์นี้' AS instruction;

-- ============================================
-- ตัวอย่างคำสั่งหา Admin UUID (รันแยกก่อน):
-- SELECT id FROM users WHERE role='admin' LIMIT 1;
-- ============================================
