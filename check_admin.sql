-- ตรวจสอบว่าใครเป็น admin ในฐานข้อมูล
SELECT 
    id,
    email,
    display_name,
    role,
    profit_score,
    lifetime_profit,
    created_at
FROM users
WHERE role = 'admin'
   OR email LIKE '%admin%'
   OR display_name ILIKE '%admin%'
ORDER BY profit_score DESC;

-- ดูโครงสร้างตาราง users (มีคอลัมน์อะไรบ้าง)
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
ORDER BY ordinal_position;
