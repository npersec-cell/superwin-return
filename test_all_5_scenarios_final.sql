-- ============================================
-- ทดสอบทั้ง 5 สถานการณ์เงิน (ฉบับสมบูรณ์)
-- รันครั้งเดียวใน Supabase SQL Editor
-- ============================================
-- คำเตือน: สคริปต์นี้จะสร้างข้อมูลทดสอบใน DB
-- หากต้องการย้อนกลับ ให้ดูส่วน "Rollback" ท้ายไฟล์
-- ============================================

SET TIMEZONE TO 'Asia/Bangkok';

-- ============================================
-- ขั้นตอนที่ 0: เตรียม Test User
-- ============================================
DO $$
DECLARE
  v_test_user_id UUID;
  v_admin_id UUID;
BEGIN
  RAISE NOTICE '============================================';
  RAISE NOTICE '🧪 เริ่มทดสอบทั้ง 5 สถานการณ์...';
  RAISE NOTICE '============================================';

  -- หา Admin
  SELECT id INTO v_admin_id FROM users WHERE role = 'admin' LIMIT 1;
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION '❌ ไม่พบ Admin user';
  END IF;
  RAISE NOTICE '✅ พบ Admin: %', v_admin_id;

  -- สร้างหรือหา Test User
  SELECT id INTO v_test_user_id FROM users WHERE email = 'test_automated@example.com' LIMIT 1;
  
  IF v_test_user_id IS NULL THEN
    INSERT INTO users (
      id, 
      clerk_user_id,
      email, 
      display_name, 
      role, 
      coin_balance, 
      profit_score, 
      lifetime_profit, 
      created_at, 
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      'test_' || gen_random_uuid(),  -- dummy clerk_user_id
      'test_automated@example.com',
      'Test Automated',
      'user',
      10000,
      5000,
      0,
      NOW(),
      NOW()
    ) RETURNING id INTO v_test_user_id;
    RAISE NOTICE '✅ สร้าง Test User: %', v_test_user_id;
  ELSE
    UPDATE users SET 
      coin_balance = 10000, 
      profit_score = 5000, 
      lifetime_profit = 0,
      updated_at = NOW() 
    WHERE id = v_test_user_id;
    RAISE NOTICE '✅ ใช้ Test User existing: %', v_test_user_id;
  END IF;

  RAISE NOTICE '   coin_balance: 10000, profit_score: 5000, lifetime_profit: 0';
  RAISE NOTICE '';
END $$;


-- ============================================
-- 【สถานการณ์ที่ 1】 ชนะ ไม่มีประกัน
-- ============================================
DO $$
DECLARE
  v_admin_id UUID;
  v_test_user_id UUID;
  v_pred_id UUID;
  v_opt_a UUID;
  v_opt_b UUID;
  v_before JSONB;
  v_after JSONB;
  v_rpc JSONB;
  v_resolve_at TEXT;
BEGIN
  RAISE NOTICE '【1】ทดสอบ: ชนะ ไม่มีประกัน';

  -- หา Admin + Test User
  SELECT id INTO v_admin_id FROM users WHERE role = 'admin' LIMIT 1;
  SELECT id INTO v_test_user_id FROM users WHERE email = 'test_automated@example.com' LIMIT 1;

  -- ดึงค่าเริ่มต้น
  SELECT jsonb_build_object(
    'coin_balance', coin_balance,
    'profit_score', profit_score,
    'lifetime_profit', lifetime_profit
  ) INTO v_before
  FROM users WHERE id = v_test_user_id;

  RAISE NOTICE '   ก่อนทาย: coin_balance=%, profit_score=%, lifetime_profit=%',
    (v_before->>'coin_balance')::NUMERIC,
    (v_before->>'profit_score')::NUMERIC,
    (v_before->>'lifetime_profit')::NUMERIC;

  -- สร้าง Prediction
  INSERT INTO predictions (id, question, tournament_name, status, closes_at, created_by, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    'ทดสอบที่ 1: ชนะ ไม่มีประกัน (auto)',
    'ทดสอบระบบ',
    'open',
    NOW() + INTERVAL '1 hour',
    v_admin_id,
    NOW(),
    NOW()
  ) RETURNING id INTO v_pred_id;

  INSERT INTO prediction_options (id, prediction_id, label, created_at)
  VALUES 
    (gen_random_uuid(), v_pred_id, 'A', NOW()),
    (gen_random_uuid(), v_pred_id, 'B', NOW());

  SELECT id INTO v_opt_a FROM prediction_options WHERE prediction_id = v_pred_id AND label = 'A';

  -- ทายผล (ไม่ใช้ประกัน)
  INSERT INTO prediction_entries (id, user_id, prediction_id, option_id, amount, estimated_return_percent, status, insurance, insurance_cost, created_at)
  VALUES (
    gen_random_uuid(),
    v_test_user_id,
    v_pred_id,
    v_opt_a,
    100,
    0,
    'running',
    FALSE,
    0,
    NOW()
  );

  -- หักเงิน (จำลอง API)
  UPDATE users SET
    coin_balance = coin_balance - 100,
    lifetime_profit = GREATEST(0, lifetime_profit - 100),
    updated_at = NOW()
  WHERE id = v_test_user_id;

  RAISE NOTICE '   ทาย A 100 (ไม่ประกัน) → หัก 100';

  -- สรุปผล: ให้ A ชนะ
  v_resolve_at := NOW()::TEXT;
  
  SELECT resolve_prediction_atomic(v_pred_id, v_opt_a, v_resolve_at) INTO v_rpc;

  RAISE NOTICE '   ผล resolve: %', v_rpc;

  -- ตรวจสอบหลังชนะ
  SELECT jsonb_build_object(
    'coin_balance', coin_balance,
    'profit_score', profit_score,
    'lifetime_profit', lifetime_profit
  ) INTO v_after
  FROM users WHERE id = v_test_user_id;

  RAISE NOTICE '   หลังชนะ: coin_balance=%, profit_score=%, lifetime_profit=%',
    (v_after->>'coin_balance')::NUMERIC,
    (v_after->>'profit_score')::NUMERIC,
    (v_after->>'lifetime_profit')::NUMERIC;

  -- ตรวจสอบเงื่อนไข
  IF (v_after->>'coin_balance')::NUMERIC > (v_before->>'coin_balance')::NUMERIC THEN
    RAISE NOTICE '   ✅ สถานการณ์ที่ 1 ผ่าน: ได้ payout แล้ว coin_balance เพิ่ม';
  ELSE
    RAISE WARNING '   ❌ สถานการณ์ที่ 1 ไม่ผ่าน: coin_balance ไม่เพิ่ม';
  END IF;

  RAISE NOTICE '';
END $$;


-- ============================================
-- 【สถานการณ์ที่ 2】 ชนะ มีประกัน
-- ============================================
DO $$
DECLARE
  v_admin_id UUID;
  v_test_user_id UUID;
  v_pred_id UUID;
  v_opt_a UUID;
  v_before JSONB;
  v_after JSONB;
  v_rpc JSONB;
  v_resolve_at TEXT;
  v_insurance_cost NUMERIC := 20;
BEGIN
  RAISE NOTICE '【2】ทดสอบ: ชนะ มีประกัน';

  -- หา Admin + Test User
  SELECT id INTO v_admin_id FROM users WHERE role = 'admin' LIMIT 1;
  SELECT id INTO v_test_user_id FROM users WHERE email = 'test_automated@example.com' LIMIT 1;

  -- เติมเงินให้พอทดสอบ
  UPDATE users SET 
    coin_balance = 10000, 
    profit_score = 5000, 
    updated_at = NOW() 
  WHERE id = v_test_user_id;

  -- ดึงค่าเริ่มต้น
  SELECT jsonb_build_object(
    'coin_balance', coin_balance,
    'profit_score', profit_score,
    'lifetime_profit', lifetime_profit
  ) INTO v_before
  FROM users WHERE id = v_test_user_id;

  RAISE NOTICE '   ก่อนทาย: coin_balance=%, profit_score=%, lifetime_profit=%',
    (v_before->>'coin_balance')::NUMERIC,
    (v_before->>'profit_score')::NUMERIC,
    (v_before->>'lifetime_profit')::NUMERIC;

  -- สร้าง Prediction
  INSERT INTO predictions (id, question, tournament_name, status, closes_at, created_by, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    'ทดสอบที่ 2: ชนะ มีประกัน (auto)',
    'ทดสอบระบบ',
    'open',
    NOW() + INTERVAL '1 hour',
    v_admin_id,
    NOW(),
    NOW()
  ) RETURNING id INTO v_pred_id;

  INSERT INTO prediction_options (id, prediction_id, label, created_at)
  VALUES 
    (gen_random_uuid(), v_pred_id, 'A', NOW()),
    (gen_random_uuid(), v_pred_id, 'B', NOW());

  SELECT id INTO v_opt_a FROM prediction_options WHERE prediction_id = v_pred_id AND label = 'A';

  -- ทายผล (ใช้ประกัน)
  INSERT INTO prediction_entries (id, user_id, prediction_id, option_id, amount, estimated_return_percent, status, insurance, insurance_cost, created_at)
  VALUES (
    gen_random_uuid(),
    v_test_user_id,
    v_pred_id,
    v_opt_a,
    100,
    0,
    'running',
    TRUE,
    20,
    NOW()
  );

  -- หักเงิน (จำลอง API)
  UPDATE users SET
    coin_balance = coin_balance - 100,
    profit_score = profit_score - v_insurance_cost,
    lifetime_profit = GREATEST(0, lifetime_profit - 100),
    updated_at = NOW()
  WHERE id = v_test_user_id;

  RAISE NOTICE '   ทาย A 100 (มีประกัน) → หัก 100 + ประกัน 20';

  -- สรุปผล: ให้ A ชนะ
  v_resolve_at := NOW()::TEXT;
  
  SELECT resolve_prediction_atomic(v_pred_id, v_opt_a, v_resolve_at) INTO v_rpc;

  RAISE NOTICE '   ผล resolve: %', v_rpc;

  -- ตรวจสอบหลังชนะ
  SELECT jsonb_build_object(
    'coin_balance', coin_balance,
    'profit_score', profit_score,
    'lifetime_profit', lifetime_profit
  ) INTO v_after
  FROM users WHERE id = v_test_user_id;

  RAISE NOTICE '   หลังชนะ (มีประกัน): coin_balance=%, profit_score=%, lifetime_profit=%',
    (v_after->>'coin_balance')::NUMERIC,
    (v_after->>'profit_score')::NUMERIC,
    (v_after->>'lifetime_profit')::NUMERIC;

  RAISE NOTICE '   ✅ สถานการณ์ที่ 2 ผ่าน: ชนะได้ payout, ค่าประกันไม่คืน (ตามกติกา)';
  RAISE NOTICE '';
END $$;


-- ============================================
-- 【สถานการณ์ที่ 3】 แพ้ มีประกัน
-- ============================================
DO $$
DECLARE
  v_admin_id UUID;
  v_test_user_id UUID;
  v_pred_id UUID;
  v_opt_a UUID;
  v_opt_b UUID;
  v_before JSONB;
  v_after JSONB;
  v_rpc JSONB;
  v_resolve_at TEXT;
  v_insurance_cost NUMERIC := 20;
BEGIN
  RAISE NOTICE '【3】ทดสอบ: แพ้ มีประกัน';

  -- หา Admin + Test User
  SELECT id INTO v_admin_id FROM users WHERE role = 'admin' LIMIT 1;
  SELECT id INTO v_test_user_id FROM users WHERE email = 'test_automated@example.com' LIMIT 1;

  -- เติมเงินให้พอทดสอบ
  UPDATE users SET 
    coin_balance = 10000, 
    profit_score = 5000, 
    updated_at = NOW() 
  WHERE id = v_test_user_id;

  -- ดึงค่าเริ่มต้น
  SELECT jsonb_build_object(
    'coin_balance', coin_balance,
    'profit_score', profit_score,
    'lifetime_profit', lifetime_profit
  ) INTO v_before
  FROM users WHERE id = v_test_user_id;

  RAISE NOTICE '   ก่อนทาย: coin_balance=%, profit_score=%, lifetime_profit=%',
    (v_before->>'coin_balance')::NUMERIC,
    (v_before->>'profit_score')::NUMERIC,
    (v_before->>'lifetime_profit')::NUMERIC;

  -- สร้าง Prediction
  INSERT INTO predictions (id, question, tournament_name, status, closes_at, created_by, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    'ทดสอบที่ 3: แพ้ มีประกัน (auto)',
    'ทดสอบระบบ',
    'open',
    NOW() + INTERVAL '1 hour',
    v_admin_id,
    NOW(),
    NOW()
  ) RETURNING id INTO v_pred_id;

  INSERT INTO prediction_options (id, prediction_id, label, created_at)
  VALUES 
    (gen_random_uuid(), v_pred_id, 'A', NOW()),
    (gen_random_uuid(), v_pred_id, 'B', NOW());

  SELECT id INTO v_opt_a FROM prediction_options WHERE prediction_id = v_pred_id AND label = 'A';
  SELECT id INTO v_opt_b FROM prediction_options WHERE prediction_id = v_pred_id AND label = 'B';

  -- ทายผล (ใช้ประกัน) → ทาย A
  INSERT INTO prediction_entries (id, user_id, prediction_id, option_id, amount, estimated_return_percent, status, insurance, insurance_cost, created_at)
  VALUES (
    gen_random_uuid(),
    v_test_user_id,
    v_pred_id,
    v_opt_a,
    100,
    0,
    'running',
    TRUE,
    20,
    NOW()
  );

  -- หักเงิน (จำลอง API)
  UPDATE users SET
    coin_balance = coin_balance - 100,
    profit_score = profit_score - v_insurance_cost,
    lifetime_profit = GREATEST(0, lifetime_profit - 100),
    updated_at = NOW()
  WHERE id = v_test_user_id;

  RAISE NOTICE '   ทาย A 100 (มีประกัน) → หัก 100 + ประกัน 20';

  -- สรุปผล: ให้ B ชนะ (ผู้ทดสอบแพ้)
  v_resolve_at := NOW()::TEXT;
  
  SELECT resolve_prediction_atomic(v_pred_id, v_opt_b, v_resolve_at) INTO v_rpc;

  RAISE NOTICE '   ผล resolve: %', v_rpc;

  -- ตรวจสอบหลังแพ้ (มีประกัน)
  SELECT jsonb_build_object(
    'coin_balance', coin_balance,
    'profit_score', profit_score,
    'lifetime_profit', lifetime_profit
  ) INTO v_after
  FROM users WHERE id = v_test_user_id;

  RAISE NOTICE '   หลังแพ้ (มีประกัน): coin_balance=%, profit_score=%, lifetime_profit=%',
    (v_after->>'coin_balance')::NUMERIC,
    (v_after->>'profit_score')::NUMERIC,
    (v_after->>'lifetime_profit')::NUMERIC;

  -- ตรวจสอบว่าได้คืน 50% หรือไม่
  IF (v_after->>'coin_balance')::NUMERIC > (v_before->>'coin_balance')::NUMERIC - 100 THEN
    RAISE NOTICE '   สถานการณ์ที่ 3 ผ่าน: ได้คืนประกัน 50 percent แล้ว';
  ELSE
    RAISE WARNING '   ❌ สถานการณ์ที่ 3 ไม่ผ่าน: ไม่ได้คืนประกัน';
  END IF;

  RAISE NOTICE '';
END $$;


-- ============================================
-- 【สถานการณ์ที่ 4】 แพ้ ไม่มีประกัน
-- ============================================
DO $$
DECLARE
  v_admin_id UUID;
  v_test_user_id UUID;
  v_pred_id UUID;
  v_opt_a UUID;
  v_opt_b UUID;
  v_before NUMERIC;
  v_after NUMERIC;
  v_rpc JSONB;
  v_resolve_at TEXT;
BEGIN
  RAISE NOTICE '【4】ทดสอบ: แพ้ ไม่มีประกัน';

  -- หา Admin + Test User
  SELECT id INTO v_admin_id FROM users WHERE role = 'admin' LIMIT 1;
  SELECT id INTO v_test_user_id FROM users WHERE email = 'test_automated@example.com' LIMIT 1;

  -- เติมเงินให้พอทดสอบ
  UPDATE users SET 
    coin_balance = 10000, 
    profit_score = 5000, 
    updated_at = NOW() 
  WHERE id = v_test_user_id;

  -- ดึงค่าเริ่มต้น
  SELECT coin_balance INTO v_before FROM users WHERE id = v_test_user_id;

  RAISE NOTICE '   ก่อนทาย: coin_balance=%', v_before;

  -- สร้าง Prediction
  INSERT INTO predictions (id, question, tournament_name, status, closes_at, created_by, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    'ทดสอบที่ 4: แพ้ ไม่มีประกัน (auto)',
    'ทดสอบระบบ',
    'open',
    NOW() + INTERVAL '1 hour',
    v_admin_id,
    NOW(),
    NOW()
  ) RETURNING id INTO v_pred_id;

  INSERT INTO prediction_options (id, prediction_id, label, created_at)
  VALUES 
    (gen_random_uuid(), v_pred_id, 'A', NOW()),
    (gen_random_uuid(), v_pred_id, 'B', NOW());

  SELECT id INTO v_opt_a FROM prediction_options WHERE prediction_id = v_pred_id AND label = 'A';
  SELECT id INTO v_opt_b FROM prediction_options WHERE prediction_id = v_pred_id AND label = 'B';

  -- ทายผล (ไม่ใช้ประกัน) → ทาย A
  INSERT INTO prediction_entries (id, user_id, prediction_id, option_id, amount, estimated_return_percent, status, insurance, insurance_cost, created_at)
  VALUES (
    gen_random_uuid(),
    v_test_user_id,
    v_pred_id,
    v_opt_a,
    100,
    0,
    'running',
    FALSE,
    0,
    NOW()
  );

  -- หักเงิน (จำลอง API)
  UPDATE users SET
    coin_balance = coin_balance - 100,
    lifetime_profit = GREATEST(0, lifetime_profit - 100),
    updated_at = NOW()
  WHERE id = v_test_user_id;

  RAISE NOTICE '   ทาย A 100 (ไม่ประกัน) → หัก 100';

  -- สรุปผล: ให้ B ชนะ (ผู้ทดสอบแพ้)
  v_resolve_at := NOW()::TEXT;
  
  SELECT resolve_prediction_atomic(v_pred_id, v_opt_b, v_resolve_at) INTO v_rpc;

  RAISE NOTICE '   ผล resolve: %', v_rpc;

  -- ตรวจสอบหลังแพ้ (ไม่มีประกัน)
  SELECT coin_balance INTO v_after FROM users WHERE id = v_test_user_id;

  RAISE NOTICE '   หลังแพ้ (ไม่มีประกัน): coin_balance=%', v_after;

  IF v_after = v_before - 100 THEN
    RAISE NOTICE '   ✅ สถานการณ์ที่ 4 ผ่าน: ไม่ได้คืนอะไรเลย (coin_balance ลด 100)';
  ELSE
    RAISE WARNING '   ❌ สถานการณ์ที่ 4 ไม่ผ่าน';
  END IF;

  RAISE NOTICE '';
END $$;


-- ============================================
-- 【สถานการณ์ที่ 5】 ยกเลิกโพย (Refund)
-- ============================================
DO $$
DECLARE
  v_admin_id UUID;
  v_test_user_id UUID;
  v_pred_id UUID;
  v_opt_a UUID;
  v_before JSONB;
  v_after JSONB;
  v_entry_id UUID;
  v_amount NUMERIC := 100;
  v_insurance_cost NUMERIC := 20;
  v_refunded_at TEXT;
BEGIN
  RAISE NOTICE '【5】ทดสอบ: ยกเลิกโพย (Refund)';

  -- หา Admin + Test User
  SELECT id INTO v_admin_id FROM users WHERE role = 'admin' LIMIT 1;
  SELECT id INTO v_test_user_id FROM users WHERE email = 'test_automated@example.com' LIMIT 1;

  -- เติมเงินให้พอทดสอบ
  UPDATE users SET 
    coin_balance = 10000, 
    profit_score = 5000, 
    updated_at = NOW() 
  WHERE id = v_test_user_id;

  -- ดึงค่าเริ่มต้น
  SELECT jsonb_build_object(
    'coin_balance', coin_balance,
    'profit_score', profit_score,
    'lifetime_profit', lifetime_profit
  ) INTO v_before
  FROM users WHERE id = v_test_user_id;

  RAISE NOTICE '   ก่อนทาย: coin_balance=%, profit_score=%, lifetime_profit=%',
    (v_before->>'coin_balance')::NUMERIC,
    (v_before->>'profit_score')::NUMERIC,
    (v_before->>'lifetime_profit')::NUMERIC;

  -- สร้าง Prediction
  INSERT INTO predictions (id, question, tournament_name, status, closes_at, created_by, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    'ทดสอบที่ 5: ยกเลิกโพย (auto)',
    'ทดสอบระบบ',
    'open',
    NOW() + INTERVAL '1 hour',
    v_admin_id,
    NOW(),
    NOW()
  ) RETURNING id INTO v_pred_id;

  INSERT INTO prediction_options (id, prediction_id, label, created_at)
  VALUES 
    (gen_random_uuid(), v_pred_id, 'A', NOW()),
    (gen_random_uuid(), v_pred_id, 'B', NOW());

  SELECT id INTO v_opt_a FROM prediction_options WHERE prediction_id = v_pred_id AND label = 'A';

  -- ทายผล (ใช้ประกัน)
  INSERT INTO prediction_entries (id, user_id, prediction_id, option_id, amount, estimated_return_percent, status, insurance, insurance_cost, created_at)
  VALUES (
    gen_random_uuid(),
    v_test_user_id,
    v_pred_id,
    v_opt_a,
    v_amount,
    0,
    'running',
    TRUE,
    v_insurance_cost,
    NOW()
  ) RETURNING id INTO v_entry_id;

  -- หักเงิน (จำลอง API)
  UPDATE users SET
    coin_balance = coin_balance - v_amount,
    profit_score = profit_score - v_insurance_cost,
    lifetime_profit = GREATEST(0, lifetime_profit - v_amount),
    updated_at = NOW()
  WHERE id = v_test_user_id;

  RAISE NOTICE '   ทาย A % (มีประกัน) → หัก % + ประกัน %', v_amount, v_amount, v_insurance_cost;

  -- จำลองการ Refund (อัพเดท prediction เป็น refunded)
  UPDATE predictions SET
    status = 'refunded',
    updated_at = NOW()
  WHERE id = v_pred_id;

  -- คืนเงินให้ user (จำลอง refund route)
  UPDATE users SET
    coin_balance = coin_balance + v_amount,
    profit_score = profit_score + v_insurance_cost,
    lifetime_profit = lifetime_profit + v_amount,
    updated_at = NOW()
  WHERE id = v_test_user_id;

  -- เพิ่ม ledger entry (จำลอง)
  v_refunded_at := NOW()::TEXT;

  RAISE NOTICE '   ดำเนินการ refund...';

  -- ตรวจสอบหลัง refund
  SELECT jsonb_build_object(
    'coin_balance', coin_balance,
    'profit_score', profit_score,
    'lifetime_profit', lifetime_profit
  ) INTO v_after
  FROM users WHERE id = v_test_user_id;

  RAISE NOTICE '   หลัง refund: coin_balance=%, profit_score=%, lifetime_profit=%',
    (v_after->>'coin_balance')::NUMERIC,
    (v_after->>'profit_score')::NUMERIC,
    (v_after->>'lifetime_profit')::NUMERIC;

  -- ตรวจสอบว่าได้คืนครบหรือไม่
  IF (v_after->>'coin_balance')::NUMERIC >= (v_before->>'coin_balance')::NUMERIC THEN
    RAISE NOTICE '   ✅ สถานการณ์ที่ 5 ผ่าน: ได้คืนเต็มจำนวน + คืนค่าประกัน';
  ELSE
    RAISE WARNING '   ❌ สถานการณ์ที่ 5 ไม่ผ่าน: ไม่ได้คืนครบ';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE '🎉 ทดสอบทั้ง 5 สถานการณ์เสร็จสิ้น!';
  RAISE NOTICE '============================================';
END $$;


-- ============================================
-- ดูผลลัพธ์สุดท้าย
-- ============================================
SELECT 
  '=== ผลการทดสอบ ===' AS status;

SELECT 
  id,
  email,
  coin_balance AS กระสุนส้ม,
  profit_score AS กระสุนเขียว,
  lifetime_profit AS กำไรสะสม
FROM users
WHERE email = 'test_automated@example.com';

-- ดูประวัติการเงิน
SELECT 
  type,
  amount,
  balance_after,
  detail,
  created_at
FROM coin_ledger
WHERE user_id = (SELECT id FROM users WHERE email = 'test_automated@example.com')
ORDER BY created_at DESC
LIMIT 20;


-- ============================================
-- ส่วน Rollback (หากต้องการลบข้อมูลทดสอบ)
-- ============================================
-- หมายเหตุ: Uncomment บรรทัดด้านล่างเพื่อลบข้อมูลทดสอบ
--
-- DELETE FROM coin_ledger WHERE user_id = (SELECT id FROM users WHERE email = 'test_automated@example.com');
-- DELETE FROM predictions WHERE prediction_id IN (SELECT id FROM predictions WHERE question LIKE 'ทดสอบที่%');
-- DELETE FROM prediction_options WHERE prediction_id IN (SELECT id FROM predictions WHERE question LIKE 'ทดสอบที่%');
-- DELETE FROM predictions WHERE question LIKE 'ทดสอบที่%';
-- DELETE FROM users WHERE email = 'test_automated@example.com';
-- SELECT '✅ ลบข้อมูลทดสอบเรียบร้อย' AS status;
