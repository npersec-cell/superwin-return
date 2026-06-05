-- 1. หา entry ซ้ำ (เก็บแค่ตัวล่าสุด ลบที่เก่ากว่า)
WITH duplicates AS (
  SELECT id, user_id, prediction_id, created_at,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, prediction_id
      ORDER BY created_at DESC
    ) AS rn
  FROM prediction_entries
  WHERE status = 'running'
)
UPDATE prediction_entries
SET status = 'cancelled'
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- 2. สร้าง unique index (ป้องกันซ้ำในอนาคต)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_running_entry
  ON prediction_entries (user_id, prediction_id)
  WHERE status = 'running';

-- 3. กัน profit_score เป็น NULL
ALTER TABLE users ALTER COLUMN profit_score SET DEFAULT 0;
UPDATE users SET profit_score = 0 WHERE profit_score IS NULL;
ALTER TABLE users ALTER COLUMN profit_score SET NOT NULL;

-- 4. เพิ่มคอลัมน์ insurance (ถ้ายังไม่มี)
ALTER TABLE prediction_entries ADD COLUMN IF NOT EXISTS insurance BOOLEAN DEFAULT FALSE;
