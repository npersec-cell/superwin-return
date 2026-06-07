-- =============================================
-- สคริปต์ตรวจสอบ User จาก Email (แนะนำ)
-- รันแล้วดูผลที่แท็บ Notices
-- =============================================

DO $$
DECLARE
    v_user_id uuid;
    v_user_email text := 'npersxox@example.com';  -- <<< แก้เป็นอีเมลจริงตรงนี้
    v_display_name text;
    v_coin_balance integer;
    v_lifetime_profit integer;
    v_profit_score integer;
    v_total_win integer := 0;
    v_total_loss integer := 0;
    v_total_refund integer := 0;
    v_total_pending integer := 0;
    v_ledger_bet integer := 0;
    v_ledger_win integer := 0;
    v_ledger_refund integer := 0;
    v_ledger_insurance integer := 0;
    v_calc_profit integer := 0;
    v_rec RECORD;
BEGIN
    -- =============================================
    -- 1. หา User จาก email
    -- =============================================
    SELECT id, email, display_name, coin_balance, lifetime_profit, profit_score
    INTO v_user_id, v_user_email, v_display_name, v_coin_balance, v_lifetime_profit, v_profit_score
    FROM users
    WHERE email = v_user_email;

    IF v_user_id IS NULL THEN
        RAISE NOTICE '❌ ไม่พบ user ที่มีอีเมล: %', v_user_email;
        RAISE NOTICE '💡 ทำอย่างใดอย่างหนึ่ง:';
        RAISE NOTICE '   1. แก้ v_user_email ให้ถูกต้อง';
        RAISE NOTICE '   2. หรือดูรายชื่อ user ทั้งหมดด้านล่าง:';
        RAISE NOTICE '----------------------------------------';
        RAISE NOTICE 'Email | Display Name | Coin Balance';
        RAISE NOTICE '----------------------------------------';
        FOR v_rec IN (SELECT email, display_name, coin_balance FROM users WHERE role != 'admin' ORDER BY created_at DESC LIMIT 20) LOOP
            RAISE NOTICE '% | % | %', v_rec.email, COALESCE(v_rec.display_name, '(ไม่มีชื่อ)'), COALESCE(v_rec.coin_balance, 0);
        END LOOP;
        RETURN;
    END IF;

    RAISE NOTICE '========================================';
    RAISE NOTICE '👤 ตรวจสอบ User: % (%)', COALESCE(v_display_name, '(ไม่มีชื่อ)'), v_user_email;
    RAISE NOTICE '   ID: %', v_user_id;
    RAISE NOTICE '========================================';

    -- =============================================
    -- 2. ข้อมูลพื้นฐานจากตาราง users
    -- =============================================
    RAISE NOTICE '';
    RAISE NOTICE '📊 ข้อมูลจากตาราง users:';
    RAISE NOTICE '   Coin Balance:    %', COALESCE(v_coin_balance, 0);
    RAISE NOTICE '   Lifetime Profit: %', COALESCE(v_lifetime_profit, 0);
    RAISE NOTICE '   Profit Score:    %', COALESCE(v_profit_score, 0);

    -- =============================================
    -- 3. สถิติจาก prediction_entries
    -- =============================================
    SELECT 
        COUNT(*) FILTER (WHERE status = 'won'),
        COUNT(*) FILTER (WHERE status = 'lost'),
        COUNT(*) FILTER (WHERE status = 'refunded'),
        COUNT(*) FILTER (WHERE status IN ('running', 'pending')),
        COALESCE(SUM(amount) FILTER (WHERE status = 'won'), 0),
        COALESCE(SUM(amount) FILTER (WHERE status = 'lost'), 0)
    INTO v_total_win, v_total_loss, v_total_refund, v_total_pending, v_ledger_win, v_ledger_bet
    FROM prediction_entries 
    WHERE user_id = v_user_id;

    RAISE NOTICE '';
    RAISE NOTICE '📈 สถิติจาก prediction_entries:';
    RAISE NOTICE '   ชนะ (won):        % รายการ', v_total_win;
    RAISE NOTICE '   แพ้ (lost):        % รายการ', v_total_loss;
    RAISE NOTICE '   คืนเงิน (refunded): % รายการ', v_total_refund;
    RAISE NOTICE '   รอผล (running):   % รายการ', v_total_pending;

    IF (v_total_win + v_total_loss) > 0 THEN
        RAISE NOTICE '   Win Rate:          %%%', ROUND((v_total_win::numeric / (v_total_win + v_total_loss)::numeric) * 100, 1);
    END IF;

    -- =============================================
    -- 4. รายการ Coin Ledger ล่าสุด
    -- =============================================
    RAISE NOTICE '';
    RAISE NOTICE '💰 รายการ Coin Ledger ล่าสุด (15 รายการ):';
    RAISE NOTICE '----------------------------------------';
    RAISE NOTICE '    เวลา       | ประเภท          | จำนวน  | ยอดหลัง';
    RAISE NOTICE '----------------------------------------';

    FOR v_rec IN (
        SELECT created_at, type, amount, balance_after
        FROM coin_ledger
        WHERE user_id = v_user_id
        ORDER BY created_at DESC
        LIMIT 15
    ) LOOP
        RAISE NOTICE '   % | % | % | %',
            to_char(v_rec.created_at, 'DD/MM HH24:MI'),
            RPAD(v_rec.type, 16, ' '),
            LPAD(v_rec.amount::text, 6, ' '),
            LPAD(COALESCE(v_rec.balance_after::text, 'N/A'), 8, ' ');
    END LOOP;

    -- =============================================
    -- 5. สรุปยอดรวมจาก Ledger
    -- =============================================
    SELECT 
        COALESCE(SUM(amount) FILTER (WHERE type = 'bet'), 0),
        COALESCE(SUM(amount) FILTER (WHERE type = 'win'), 0),
        COALESCE(SUM(amount) FILTER (WHERE type = 'refund'), 0),
        COALESCE(SUM(amount) FILTER (WHERE type = 'insurance_payout'), 0)
    INTO v_ledger_bet, v_ledger_win, v_ledger_refund, v_ledger_insurance
    FROM coin_ledger
    WHERE user_id = v_user_id;

    v_calc_profit := v_ledger_win + v_ledger_refund + v_ledger_insurance + v_ledger_bet; -- bet เป็นลบ

    RAISE NOTICE '';
    RAISE NOTICE '💰 สรุปจาก Coin Ledger:';
    RAISE NOTICE '   ยอดแทงรวม:    %', v_ledger_bet;
    RAISE NOTICE '   ยอดถูกรางวัล:  %', v_ledger_win;
    RAISE NOTICE '   ยอดคืนเงิน:     %', v_ledger_refund;
    RAISE NOTICE '   ยอดประกัน:      %', v_ledger_insurance;
    RAISE NOTICE '   กำไรสุทธิ (Ledger): %', v_calc_profit;

    -- =============================================
    -- 6. ตรวจสอบความถูกต้อง
    -- =============================================
    RAISE NOTICE '';
    RAISE NOTICE '✅ การตรวจสอบความถูกต้อง:';
    
    IF v_calc_profit = COALESCE(v_lifetime_profit, 0) THEN
        RAISE NOTICE '   ✅ Lifetime Profit ถูกต้อง! (%)', v_calc_profit;
    ELSE
        RAISE NOTICE '   ❌ Lifetime Profit ไม่ตรง!';
        RAISE NOTICE '      จาก Ledger: %', v_calc_profit;
        RAISE NOTICE '      จาก Users:  %', COALESCE(v_lifetime_profit, 0);
    END IF;

    IF COALESCE(v_profit_score, 0) = COALESCE(v_lifetime_profit, 0) THEN
        RAISE NOTICE '   ✅ Profit Score ตรงกับ Lifetime Profit!';
    ELSE
        RAISE NOTICE '   ⚠️  Profit Score (%) ไม่ตรงกับ Lifetime Profit (%)', COALESCE(v_profit_score, 0), COALESCE(v_lifetime_profit, 0);
    END IF;

    -- =============================================
    -- 7. Prediction Entries ล่าสุด
    -- =============================================
    RAISE NOTICE '';
    RAISE NOTICE '📋 Prediction Entries ล่าสุด (10 รายการ):';
    RAISE NOTICE '----------------------------------------';
    RAISE NOTICE '   สถานะ   | แทง  | ประกัน | Option';
    RAISE NOTICE '----------------------------------------';

    FOR v_rec IN (
        SELECT 
            pe.status,
            pe.amount,
            COALESCE(pe.insurance_cost, 0) as ins,
            po.label as opt
        FROM prediction_entries pe
        JOIN prediction_options po ON pe.option_id = po.id
        WHERE pe.user_id = v_user_id
        ORDER BY pe.created_at DESC
        LIMIT 10
    ) LOOP
        RAISE NOTICE '   % | % | % | %',
            RPAD(v_rec.status, 9, ' '),
            LPAD(v_rec.amount::text, 4, ' '),
            LPAD(v_rec.ins::text, 6, ' '),
            COALESCE(v_rec.opt, 'N/A');
    END LOOP;

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ เสร็จสิ้นการตรวจสอบ';
    RAISE NOTICE '========================================';

END $$;
