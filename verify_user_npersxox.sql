-- =============================================
-- สคริปต์ตรวจสอบความถูกต้องของระบบ (Verify System Integrity)
-- รันเพื่อตรวจสอบว่า profit, win rate, ledger ถูกต้องหรือไม่
-- =============================================

DO $$
DECLARE
    v_user_id uuid;
    v_user_email text;
    v_total_bet integer;
    v_total_win integer;
    v_total_loss integer;
    v_total_refund integer;
    v_profit_score integer;
    v_coin_balance integer;
    v_lifetime_profit integer;
    v_ledger_count integer;
    v_entry RECORD;
    v_ledger RECORD;
    v_calc_profit integer;
BEGIN
    -- =============================================
    -- หา User จากอีเมล (แก้ตรงนี้ถ้าต้องการเช็คคนอื่น)
    -- =============================================
    v_user_email := 'npersxox@example.com';  -- แก้เป็น email ของ user ที่ต้องการเช็ค
    
    SELECT id INTO v_user_id 
    FROM users 
    WHERE email = v_user_email;
    
    IF v_user_id IS NULL THEN
        -- ถ้าไม่เจอจาก email ลองหาจาก display_name
        SELECT id, email INTO v_user_id, v_user_email
        FROM users 
        WHERE display_name ILIKE '%npersxox%'
        LIMIT 1;
    END IF;
    
    IF v_user_id IS NULL THEN
        RAISE NOTICE '❌ ไม่พบ user นี้ในระบบ';
        RETURN;
    END IF;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE '👤 ตรวจสอบ User: % (%)', v_user_email, v_user_id;
    RAISE NOTICE '========================================';
    
    -- =============================================
    -- 1. ข้อมูลพื้นฐานจากตาราง users
    -- =============================================
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
    -- 2. นับจำนวน Win / Loss / อื่นๆ จาก prediction_entries
    -- =============================================
    SELECT 
        COUNT(*) FILTER (WHERE status = 'won') as wins,
        COUNT(*) FILTER (WHERE status = 'lost') as losses,
        COUNT(*) FILTER (WHERE status = 'refunded') as refunds,
        COUNT(*) FILTER (WHERE status IN ('running', 'pending')) as pending
    INTO v_total_win, v_total_loss, v_total_refund, v_ledger_count
    FROM prediction_entries 
    WHERE user_id = v_user_id;
    
    RAISE NOTICE '';
    RAISE NOTICE '📈 สถิติจาก prediction_entries:';
    RAISE NOTICE '   ชนะ (won): %', COALESCE(v_total_win, 0);
    RAISE NOTICE '   แพ้ (lost): %', COALESCE(v_total_loss, 0);
    RAISE NOTICE '   คืนเงิน (refunded): %', COALESCE(v_total_refund, 0);
    RAISE NOTICE '   รอผล (running/pending): %', COALESCE(v_ledger_count, 0);
    RAISE NOTICE '   รวมทั้งหมด: %', COALESCE(v_total_win, 0) + COALESCE(v_total_loss, 0) + COALESCE(v_total_refund, 0);
    
    -- =============================================
    -- 3. คำนวณ Win Rate
    -- =============================================
    IF (v_total_win + v_total_loss) > 0 THEN
        RAISE NOTICE '';
        RAISE NOTICE '🎯 Win Rate:';
        RAISE NOTICE '   % ชนะ / % แพ้', v_total_win, v_total_loss;
        RAISE NOTICE '   Win Rate: %', ROUND((v_total_win::numeric / (v_total_win + v_total_loss)::numeric) * 100, 1);
    END IF;
    
    -- =============================================
    -- 4. ตรวจสอบ Coin Ledger (ทุกรายการ)
    -- =============================================
    RAISE NOTICE '';
    RAISE NOTICE '💰 รายการ Coin Ledger ล่าสุด (20 รายการ):';
    RAISE NOTICE '----------------------------------------';
    RAISE NOTICE 'เวลา          | ประเภท      | จำนวน  | ยอดหลัง';
    RAISE NOTICE '----------------------------------------';
    
    FOR v_ledger IN (
        SELECT 
            created_at,
            type,
            amount,
            balance_after
        FROM coin_ledger
        WHERE user_id = v_user_id
        ORDER BY created_at DESC
        LIMIT 20
    ) LOOP
        RAISE NOTICE '% | % | % | %',
            to_char(v_ledger.created_at, 'DD/MM HH24:MI'),
            RPAD(v_ledger.type, 12, ' '),
            LPAD(v_ledger.amount::text, 6, ' '),
            LPAD(COALESCE(v_ledger.balance_after::text, 'N/A'), 8, ' ');
    END LOOP;
    
    -- =============================================
    -- 5. สรุปยอดรวมจาก Ledger
    -- =============================================
    SELECT 
        COALESCE(SUM(amount) FILTER (WHERE type = 'bet'), 0) as total_bet,
        COALESCE(SUM(amount) FILTER (WHERE type = 'win'), 0) as total_win_amount,
        COALESCE(SUM(amount) FILTER (WHERE type = 'refund'), 0) as total_refund_amount,
        COALESCE(SUM(amount) FILTER (WHERE type = 'insurance_payout'), 0) as total_insurance
    INTO v_total_bet, v_total_win, v_total_refund, v_calc_profit
    FROM coin_ledger
    WHERE user_id = v_user_id;
    
    RAISE NOTICE '';
    RAISE NOTICE '💰 สรุปจาก Coin Ledger:';
    RAISE NOTICE '   ยอดแทงรวม: %', v_total_bet;
    RAISE NOTICE '   ยอดถูกรางวัล: %', v_total_win;
    RAISE NOTICE '   ยอดคืนเงิน: %', v_total_refund;
    RAISE NOTICE '   ยอดประกัน: %', v_calc_profit;
    RAISE NOTICE '   กำไรสุทธิ (win + refund + insurance - |bet|): %', 
        v_total_win + v_total_refund + v_calc_profit + v_total_bet; -- bet เป็นลบอยู่แล้ว
    
    -- =============================================
    -- 6. ตรวจสอบ Prediction Entries ล่าสุด (พร้อมผล)
    -- =============================================
    RAISE NOTICE '';
    RAISE NOTICE '📋 Prediction Entries ล่าสุด (10 รายการ):';
    RAISE NOTICE '----------------------------------------';
    RAISE NOTICE 'สถานะ | แทง | ประกัน | Option | Prediction';
    RAISE NOTICE '----------------------------------------';
    
    FOR v_entry IN (
        SELECT 
            pe.status,
            pe.amount,
            COALESCE(pe.insurance_cost, 0) as insurance,
            po.label as option_label,
            p.id as pred_id
        FROM prediction_entries pe
        JOIN prediction_options po ON pe.option_id = po.id
        JOIN predictions p ON pe.prediction_id = p.id
        WHERE pe.user_id = v_user_id
        ORDER BY pe.created_at DESC
        LIMIT 10
    ) LOOP
        RAISE NOTICE '% | % | % | % | %',
            RPAD(v_entry.status, 7, ' '),
            LPAD(v_entry.amount::text, 4, ' '),
            LPAD(v_entry.insurance::text, 6, ' '),
            COALESCE(v_entry.option_label, 'N/A'),
            LEFT(v_entry.pred_id::text, 8);
    END LOOP;
    
    -- =============================================
    -- 7. ตรวจสอบว่า Profit Score ตรงกับ Ledger ไหม
    -- =============================================
    RAISE NOTICE '';
    RAISE NOTICE '✅ การตรวจสอบความถูกต้อง:';
    
    -- คำนวณ profit จาก ledger
    SELECT COALESCE(SUM(amount), 0) INTO v_calc_profit
    FROM coin_ledger
    WHERE user_id = v_user_id
      AND type IN ('win', 'refund', 'insurance_payout');
    
    RAISE NOTICE '   Profit จาก Ledger (win+refund): %', v_calc_profit;
    RAISE NOTICE '   Profit Score ในฐานข้อมูล: %', COALESCE(v_profit_score, 0);
    
    IF v_calc_profit = COALESCE(v_profit_score, 0) THEN
        RAISE NOTICE '   ✅ Profit Score ถูกต้อง!';
    ELSE
        RAISE NOTICE '   ❌ Profit Score ไม่ตรง! (ควรเป็น % แต่เป็น %)', v_calc_profit, COALESCE(v_profit_score, 0);
    END IF;
    
    -- ตรวจสอบ lifetime_profit
    IF v_lifetime_profit = v_calc_profit THEN
        RAISE NOTICE '   ✅ Lifetime Profit ถูกต้อง!';
    ELSE
        RAISE NOTICE '   ❌ Lifetime Profit ไม่ตรง! (ledger=% แต่ users=%)', v_calc_profit, COALESCE(v_lifetime_profit, 0);
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'เสร็จสิ้นการตรวจสอบ';
    RAISE NOTICE '========================================';
    
END $$;
