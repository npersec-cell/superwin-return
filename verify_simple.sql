-- =============================================
-- สคริปต์ตรวจสอบ User แบบง่าย (ไม่ใช้ DO block)
-- รันแล้วดูผลที่แท็บ Results เลย
-- =============================================

-- ใส่อีเมลที่ต้องการตรวจสอบ (แก้ตรงนี้)
WITH target_user AS (
    SELECT id, email, display_name, coin_balance, lifetime_profit, profit_score
    FROM users
    WHERE email = 'npersec@gmail.com'  -- <<< แก้เป็นอีเมลจริง
)

-- ข้อมูลพื้นฐาน
SELECT 
    '👤 ข้อมูลพื้นฐาน' as section,
    display_name as ชื่อเล่น,
    email as อีเมล,
    coin_balance as กระสุนส้มคงเหลือ,
    lifetime_profit as กำไรสะสม,
    profit_score as คะแนนกำไร
FROM target_user

UNION ALL

-- สถิติ Win/Loss
SELECT 
    '📈 สถิติ',
    'ชนะ: ' || COUNT(*) FILTER (WHERE status = 'won')::text || ' ครั้ง',
    'แพ้: ' || COUNT(*) FILTER (WHERE status = 'lost')::text || ' ครั้ง',
    COALESCE(SUM(amount) FILTER (WHERE status = 'won'), 0),
    COALESCE(SUM(amount) FILTER (WHERE status = 'lost'), 0),
    COUNT(*) FILTER (WHERE status = 'refunded')
FROM prediction_entries
WHERE user_id = (SELECT id FROM target_user)

UNION ALL

-- สรุป Ledger
SELECT 
    '💰 Ledger รวม',
    'แทง: ' || COALESCE(SUM(amount) FILTER (WHERE type = 'bet'), 0)::text,
    'ถูก: ' || COALESCE(SUM(amount) FILTER (WHERE type = 'win'), 0)::text,
    COALESCE(SUM(amount) FILTER (WHERE type = 'refund'), 0),
    COALESCE(SUM(amount) FILTER (WHERE type = 'insurance_payout'), 0),
    COALESCE(SUM(amount) FILTER (WHERE type IN ('win', 'refund', 'insurance_payout')), 0) + COALESCE(SUM(amount) FILTER (WHERE type = 'bet'), 0)
FROM coin_ledger
WHERE user_id = (SELECT id FROM target_user);

-- =============================================
-- รายการ Ledger ล่าสุด (รันพร้อมกันได้)
-- =============================================
SELECT 
    '💰 Ledger' as section,
    to_char(created_at, 'DD/MM HH24:MI') as เวลา,
    type as ประเภท,
    amount as จำนวน,
    balance_after as ยอดหลัง
FROM coin_ledger
WHERE user_id = (SELECT id FROM users WHERE email = 'npersec@gmail.com')  -- <<< แก้เป็นอีเมลเดียวกัน
ORDER BY created_at DESC
LIMIT 20;

-- =============================================
-- Prediction Entries ล่าสุด (รันพร้อมกันได้)
-- =============================================
SELECT 
    '📋 Entries' as section,
    pe.status as สถานะ,
    pe.amount as แทง,
    COALESCE(pe.insurance_cost, 0) as ประกัน,
    po.label as option_ที่เลือก,
    to_char(pe.created_at, 'DD/MM') as วันที่
FROM prediction_entries pe
JOIN prediction_options po ON pe.option_id = po.id
WHERE pe.user_id = (SELECT id FROM users WHERE email = 'npersec@gmail.com')  -- <<< แก้เป็นอีเมลเดียวกัน
ORDER BY pe.created_at DESC
LIMIT 15;
