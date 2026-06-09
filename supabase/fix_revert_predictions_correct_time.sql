-- ============================================================
-- แก้ไขคำถามที่ Health Check ปิดผิด (ไม่มี title → ใช้ question)
-- ============================================================

-- ตรวจสอบก่อนรัน
SELECT id, question, status, opens_at, closes_at, created_at
FROM predictions
WHERE id IN (
  'fff24cf8-a69a-48bf-a565-496c2d04aae5',
  'd253a3ed-9695-4943-9490-27d1dde3927d',
  'dbd93d9b-8e28-421f-99fe-7b118dfe495c'
);

-- แก้ไขรอบที่ 1: fff24cf8 → ปิด 20 มิ.ย. 2026 15:00 ICT
UPDATE predictions
SET
  status = 'open',
  closes_at = '2026-06-20T08:00:00Z'
WHERE id = 'fff24cf8-a69a-48bf-a565-496c2d04aae5';

-- แก้ไขรอบที่ 2: d253a3ed → ปิด 20 มิ.ย. 2026 15:00 ICT
UPDATE predictions
SET
  status = 'open',
  closes_at = '2026-06-20T08:00:00Z'
WHERE id = 'd253a3ed-9695-4943-9490-27d1dde3927d';

-- แก้ไขรอบที่ 3: dbd93d9b → ปิด 21 มิ.ย. 2026 15:00 ICT
UPDATE predictions
SET
  status = 'open',
  closes_at = '2026-06-21T08:00:00Z'
WHERE id = 'dbd93d9b-8e28-421f-99fe-7b118dfe495c';

-- ตรวจสอบหลังแก้ไข
SELECT id, question, status, opens_at, closes_at
FROM predictions
WHERE id IN (
  'fff24cf8-a69a-48bf-a565-496c2d04aae5',
  'd253a3ed-9695-4943-9490-27d1dde3927d',
  'dbd93d9b-8e28-421f-99fe-7b118dfe495c'
);
