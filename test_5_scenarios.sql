  -- ใช้ User ตัวแรกที่ไม่ใช่ Admin
  SELECT id INTO v_test_user_id FROM users WHERE role != 'admin' LIMIT 1;
  
  IF v_test_user_id IS NULL THEN
    RAISE EXCEPTION '❌ ไม่พบ User สำหรับทดสอบ';
  END IF;
  
  -- เติมเงินให้พอทดสอบ
  UPDATE users SET 
    coin_balance = 10000, 
    profit_score = 5000, 
    lifetime_profit = 0,
    updated_at = NOW() 
  WHERE id = v_test_user_id;
  
  RAISE NOTICE '✅ ใช้ User  existing: %', v_test_user_id;
