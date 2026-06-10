-- ดูทุก predictions ในตาราง ไม่ว่า status อะไร
SELECT 
  id, 
  question, 
  status, 
  opens_at, 
  closes_at, 
  created_at,
  updated_at
FROM predictions
ORDER BY created_at DESC
LIMIT 20;
