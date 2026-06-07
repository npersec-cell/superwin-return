-- ============================================
-- ตรวจสอบการคำนวณผลทั้งหมดที่ผ่านมา
-- ============================================

-- 1. ตรวจสอบ prediction ที่ resolve แล้วทั้งหมด
SELECT 
    '📊 Resolved Predictions' as info,
    COUNT(*) as total_count
FROM predictions
WHERE status = 'resolved';

-- 2. ตรวจสอบรายละเอียดทีละ prediction (limit 5 ตัวแรก)
SELECT 
    p.id,
    LEFT(p.tournament_name, 30) as name,
    p.winning_option_id,
    p.resolved_at,
    (SELECT COUNT(*) FROM prediction_entries WHERE prediction_id = p.id) as total_entries,
    (SELECT SUM(amount) FROM prediction_entries WHERE prediction_id = p.id) as total_pool,
    (SELECT SUM(amount) FROM prediction_entries WHERE prediction_id = p.id AND option_id = p.winning_option_id) as winning_pool
FROM predictions p
WHERE p.status = 'resolved'
ORDER BY p.resolved_at DESC
LIMIT 5;

-- 3. ตรวจสอบ winning entries ของ prediction แรก (ที่ resolved แล้ว)
-- ใช้ ref_id ใน coin_ledger ซึ่งชี้ไปที่ prediction_entries.id
WITH first_pred AS (
    SELECT id, winning_option_id, fee_rate
    FROM predictions
    WHERE status = 'resolved'
    ORDER BY resolved_at DESC
    LIMIT 1
)
SELECT 
    '🏆 Winning Entries' as info,
    pe.id as entry_id,
    u.email,
    pe.amount as bet_amount,
    -- คำนวณ payout ที่ควรจะเป็น
    FLOOR((pe.amount::NUMERIC / wp.winning_pool::NUMERIC) * wp.distributable::NUMERIC) as expected_payout,
    -- ดู payout จริงจาก coin_ledger
    (SELECT cl.amount FROM coin_ledger cl WHERE cl.ref_id = pe.id AND cl.type = 'payout') as actual_payout
FROM prediction_entries pe
JOIN users u ON pe.user_id = u.id
JOIN (
    SELECT 
        fp.id as pred_id,
        SUM(pe2.amount) as winning_pool,
        FLOOR(SUM(pe2.amount) * (1 - COALESCE(fp.fee_rate, 0.03)) as distributable
    FROM first_pred fp
    JOIN prediction_entries pe2 ON pe2.prediction_id = fp.id AND pe2.option_id = fp.winning_option_id
    GROUP BY fp.id, fp.fee_rate
) wp ON TRUE
WHERE pe.prediction_id = (SELECT pred_id FROM first_pred)
  AND pe.option_id = (SELECT winning_option_id FROM first_pred)
  AND pe.status = 'won';

-- 4. ตรวจสอบ insurance refund
SELECT 
    '🛡️ Insurance Refunds' as info,
    pe.id as entry_id,
    u.email,
    pe.amount as bet_amount,
    pe.insurance_cost,
    -- ควรจะได้คืน 50% ของต้นทุน
    FLOOR(pe.amount * 0.5) as expected_refund,
    (SELECT cl.amount FROM coin_ledger cl WHERE cl.ref_id = pe.id AND cl.type = 'insurance_refund') as actual_refund
FROM prediction_entries pe
JOIN users u ON pe.user_id = u.id
WHERE pe.prediction_id IN (
    SELECT id FROM predictions WHERE status = 'resolved' ORDER BY resolved_at DESC LIMIT 5
)
  AND pe.insurance_cost > 0
  AND pe.status = 'lost'
LIMIT 10;

-- 5. สรุปสถิติความแม่นยำ
SELECT 
    '📋 Summary' as info,
    (SELECT COUNT(*) FROM predictions WHERE status = 'resolved') as total_resolved,
    (SELECT COUNT(DISTINCT pe.user_id) 
     FROM prediction_entries pe 
     JOIN predictions p ON pe.prediction_id = p.id 
     WHERE p.status = 'resolved' AND pe.status = 'won'
    ) as users_won,
    (SELECT COUNT(*) 
     FROM prediction_entries pe 
     JOIN predictions p ON pe.prediction_id = p.id 
     WHERE p.status = 'resolved' AND pe.status = 'won'
    ) as total_wins,
    (SELECT COUNT(*) 
     FROM prediction_entries pe 
     JOIN predictions p ON pe.prediction_id = p.id 
     WHERE p.status = 'resolved' AND pe.status = 'lost'
    ) as total_losses;
