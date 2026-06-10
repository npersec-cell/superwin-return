-- เคลียร์ display_name ทั้งหมดในตาราง users
-- ให้ทุกคนแสดงชื่อแบบเซ็นเซอร์ (xx 2 ตัวท้าย) ก่อนตั้งชื่อใน Profile
-- วันที่สร้าง: 2026-06-10

UPDATE users
SET display_name = NULL
WHERE display_name IS NOT NULL;

-- ตรวจสอบผลลัพธ์
SELECT id, email, display_name
FROM users
LIMIT 10;
