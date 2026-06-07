-- =============================================
-- สคริปต์ตรวจสอบ User จาก Email (แนะนำ)
-- =============================================

DO $$
DECLARE
    v_user_id uuid;
    v_user_email text;
    v_user_name text;
    v_total_bet integer;
    v_total_win integer;
    v_total_loss integer;
    v_total_refund integer;
    v_profit_score integer;
    v_coin_balance integer;
    v_lifetime_profit integer;
    v_calc_profit integer;
    v_user RECORD;
    v_ledger RECORD;
    v_entry RECORD;
BEGIN
    -- =============================================
    -- ใส่อีเมลที่ต้องการค้นหา (แก้ตรงนี้)
    -- =============================================
    v_user_email := 'npersxox@example.com';  -- แก้เป็นอีเมลจริง
    
    -- =============================================
    -- 1. ค้นหา User จาก email
    -- =============================================
    RAISE NOTICE '========================================';
    RAISE NOTICE '🔍 ค้นหา User จากอีเมล: %', v_user_email;
    RAISE NOTICE '========================================';
    
    -- หา user จาก email
    SELECT id, email, display_name, profit_score, coin_balance, lifetime_profit
    INTO v_user_id, v_user_email, v_user_name, v_profit_score, v_coin_balance, v_lifetime_profit
    FROM users
    WHERE email = v_user_email;
    
    -- ถ้าไม่เจอเลย
    IF v_user_id IS NULL THEN
        RAISE NOTICE '';
        RAISE NOTICE '❌ ไม่พบ user ที่มีอีเมล: %', v_user_email;
        RAISE NOTICE '';
        RAISE NOTICE '💡 ลองดูรายชื่อ user ทั้งหมด (20 คนแรก):';
        RAISE NOTICE '----------------------------------------';
        RAISE NOTICE 'Email | Display Name | Profit Score';
        RAISE NOTICE '----------------------------------------';
        
        FOR v_user IN (
            SELECT email, display_name, profit_score
            FROM users
            WHERE role != 'admin'
            ORDER BY created_at DESC
            LIMIT 20
        ) LOOP
            RAISE NOTICE '% | % | %',
                COALESCE(v_user.email, 'N/A'),
                COALESCE(v_user.display_name, 'N/A'),
                COALESCE(v_user.profit_score, 0);
        END LOOP;
        
        RETURN;
    END IF;
    
    -- =============================================
    -- 2. แสดงข้อมูลละเอียดของ User ที่เจอ
    -- =============================================
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '👤 ตรวจสอบละเอียด: % (%)', COALESCE(v_user_name, 'N/A'), v_user_email;
    RAISE NOTICE '========================================';
    
    SELECT 
        coin_balance, 
        lifetime_profit, 
        profit_score
    INTO 
        v_coin_balance, 
        v_lifetime_profit, 
        v_profit_score
    FROM users 
    WHERE id = v_user_id;
    
    RAISE NOTICE '';
    RAISE NOTICE '📊 ข้อมูลจากตาราง users:';
    RAISE NOTICE '   Coin Balance: %', COALESCE(v_coin_balance, 0);
    RAISE NOTICE '   Lifetime Profit: %', COALESCE(v_lifetime_profit, 0);
    RAISE NOTICE '   Profit Score: %', COALESCE(v_profit_score, 0);
    
    -- =============================================
    -- 3. สถิติ Win / Loss
    -- =============================================
    SELECT 
        COUNT(*) FILTER (WHERE status = 'won') as wins,
        COUNT(*) FILTER (WHERE status = 'lost') as losses,
        COUNT(*) FILTER (WHERE status = 'refunded') as refunds,
        COUNT(*) FILTER (WHERE status IN ('running', 'pending')) as pending,
        COALESCE(SUM(amount) FILTER (WHERE status = 'won'), 0) as win_amount,
        COALESCE(SUM(amount) FILTER (WHERE status = 'lost'), 0) as loss_amount
    INTO v_total_win, v_total_loss, v_total_refund, v_calc_profit, v_total_bet, v_profit_score
    FROM prediction_entries 
    WHERE user_id = v_user_id;
    
    RAISE NOTICE '';
    RAISE NOTICE '📈 สถิติจาก prediction_entries:';
    RAISE NOTICE '   ชนะ: % รายการ (ยอด %)', v_total_win, v_total_bet;
    RAISE NOTICE '   แพ้: % รายการ (ยอด %)', v_total_loss, v_profit_score;
    RAISE NOTICE '   คืนเงิน: % รายการ', v_total_refund;
    RAISE NOTICE '   รอผล: % รายการ', v_calc_profit;
    
    IF (v_total_win + v_total_loss) > 0 THEN
        RAISE NOTICE '   Win Rate: %', 
            ROUND((v_total_win::numeric / (v_total_win + v_total_loss)::numeric) * 100, 1) || '%';
    END IF;
    
    -- =============================================
    -- 4. รายการ Coin Ledger ล่าสุด
    -- =============================================
    RAISE NOTICE '';
    RAISE NOTICE '💰 Coin Ledger ล่าสุด (15 รายการ):';
    RAISE NOTICE 'เวลา        | ประเภท        | จำนวน   | ยอดหลัง';
    RAISE NOTICE '------------------------------------------';
    
    FOR v_ledger IN (
        SELECT 
            created_at,
            type,
            amount,
            balance_after
        FROM coin_ledger
        WHERE user_id = v_user_id
        ORDER BY created_at DESC
        LIMIT 15
    ) LOOP
        RAISE NOTICE '% | % | % | %',
            to_char(v_ledger.created_at, 'DD/MM HH24:MI'),
            RPAD(v_ledger.type, 14, ' '),
            LPAD(v_ledger.amount::text, 7, ' '),
            COALESCE(v_ledger.balance_after::text, 'N/A');
    END LOOP;
    
    -- =============================================
    -- 5. สรุปยอดจาก Ledger
    -- =============================================
    SELECT 
        COALESCE(SUM(amount) FILTER (WHERE type = 'bet'), 0) as total_bet,
        COALESCE(SUM(amount) FILTER (WHERE type = 'win'), 0) as total_win,
        COALESCE(SUM(amount) FILTER (WHERE type = 'refund'), 0) as total_refund,
        COALESCE(SUM(amount) FILTER (WHERE type = 'insurance_payout'), 0) as total_insurance
    INTO v_total_bet, v_total_win, v_total_refund, v_profit_score
    FROM coin_ledger
    WHERE user_id = v_user_id;
    
    v_calc_profit := v_total_win + v_total_refund + v_profit_score + v_total_bet; -- bet เป็นลบอยู่แล้ว
    
    RAISE NOTICE '';
    RAISE NOTICE '💰 สรุปจาก Coin Ledger:';
    RAISE NOTICE '   ยอดแทงรวม: %', v_total_bet;
    RAISE NOTICE '   ยอดถูกรางวัล: %', v_total_win;
    RAISE NOTICE '   ยอดคืนเงิน: %', v_total_refund;
    RAISE NOTICE '   ยอดประกัน: %', v_profit_score;
    RAISE NOTICE '   กำไรสุทธิ: %', v_calc_profit;
    
    -- =============================================
    -- 6. ตรวจสอบความถูกต้อง
    -- =============================================
    RAISE NOTICE '';
    RAISE NOTICE '✅ การตรวจสอบ:';
    
    IF v_calc_profit = COALESCE(v_lifetime_profit, 0) THEN
        RAISE NOTICE '   ✅ Lifetime Profit ถูกต้อง (%)', v_calc_profit;
    ELSE
        RAISE NOTICE '   ❌ Lifetime Profit ไม่ตรง!';
        RAISE NOTICE '      จาก Ledger: %', v_calc_profit;
        RAISE NOTICE '      จาก Users: %', COALESCE(v_lifetime_profit, 0);
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ เสร็จสิ้นการตรวจสอบ';
    RAISE NOTICE '========================================';
    
END $$;
