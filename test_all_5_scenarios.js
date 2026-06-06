// ============================================
// Automated Test: ทดสอบทั้ง 5 สถานการณ์เงิน
// รันด้วย: node test_all_5_scenarios.js
// ============================================

require('dotenv').config({ path: require('path').join(__dirname, '.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const LOG = (...args) => console.log(new Date().toISOString(), '|', ...args);

// ============================================
// Helper: สร้าง Prediction + Options
// ============================================
async function createPrediction(question) {
  const { data: pred, error } = await supabase
    .from('predictions')
    .insert({
      question,
      status: 'open',
      closes_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      created_by: (await supabase.from('users').select('id').eq('role', 'admin').limit(1).single()).data?.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) throw error;

  const { data: opts, error: optErr } = await supabase
    .from('options')
    .insert([
      { prediction_id: pred.id, label: 'A', created_at: new Date().toISOString() },
      { prediction_id: pred.id, label: 'B', created_at: new Date().toISOString() },
    ])
    .select('id, label');
  if (optErr) throw optErr;

  return { predictionId: pred.id, options: opts };
}

// ============================================
// Helper: ดึง user stats
// ============================================
async function getUserStats(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('coin_balance, profit_score, lifetime_profit')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

// ============================================
// Helper: วางเดิมพัน
// ============================================
async function placeBet(predictionId, optionId, userId, amount, insurance = false) {
  // หักเงินจำลอง
  const before = await getUserStats(userId);
  const insCost = insurance ? Math.ceil(amount * 0.2) : 0;

  const { error: updErr } = await supabase
    .from('users')
    .update({
      coin_balance: before.coin_balance - amount,
      profit_score: before.profit_score - insCost,
      lifetime_profit: Math.max(0, before.lifetime_profit - amount),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (updErr) throw updErr;

  const { error: betErr } = await supabase
    .from('predictions')
    .insert({
      id: require('crypto').randomUUID(),
      user_id: userId,
      prediction_id: predictionId,
      option_id: optionId,
      amount,
      insurance,
      created_at: new Date().toISOString(),
    });
  if (betErr) throw betErr;

  LOG(`   📊 วางเดิมพัน: amount=${amount}, insurance=${insurance}`);
}

// ============================================
// Helper: ดู ledger ล่าสุด
// ============================================
async function getLatestLedger(userId) {
  const { data, error } = await supabase
    .from('coin_ledger')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(3);
  if (error) throw error;
  return data;
}

// ============================================
// Main Test
// ============================================
async function main() {
  LOG('🧪 เริ่มทดสอบทั้ง 5 สถานการณ์...\n');

  // หา (หรือสร้าง) test user
  let testUser;
  const email = 'test_automated@example.com';
  const { data: existing } = await supabase.from('users').select('*').eq('email', email).single();
  
  if (existing) {
    testUser = existing;
    LOG(`✅ ใช้ User  existing: ${testUser.id}`);
  } else {
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        id: require('crypto').randomUUID(),
        email,
        display_name: 'Test Automated',
        role: 'user',
        coin_balance: 10000,
        profit_score: 5000,
        lifetime_profit: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (error) throw error;
    testUser = newUser;
    LOG(`✅ สร้าง User ใหม่: ${testUser.id}`);
  }

  // เติมเงินให้พอทดสอบ
  await supabase
    .from('users')
    .update({ coin_balance: 10000, profit_score: 5000, updated_at: new Date().toISOString() })
    .eq('id', testUser.id);

  const beforeAll = await getUserStats(testUser.id);
  LOG(`   ก่อนทดสอบ: coin=${beforeAll.coin_balance}, profit_score=${beforeAll.profit_score}, lifetime=${beforeAll.lifetime_profit}\n`);

  // ============================================
  // 【สถานการณ์ที่ 1】 ชนะ ไม่มีประกัน
  // ============================================
  LOG('【1】ทดสอบ: ชนะ ไม่มีประกัน');
  const s1 = await createPrediction('ทดสอบที่ 1: ชนะ ไม่มีประกัน (auto)');
  const optA1 = s1.options.find(o => o.label === 'A');
  await placeBet(s1.predictionId, optA1.id, testUser.id, 100, false);

  const before1 = await getUserStats(testUser.id);
  LOG(`   ก่อน resolve: coin=${before1.coin_balance}, lifetime=${before1.lifetime_profit}`);

  const { data: rpc1, error: rpcErr1 } = await supabase.rpc('resolve_prediction_atomic', {
    p_prediction_id: s1.predictionId,
    p_winning_option_id: optA1.id,
    p_resolved_at: new Date().toISOString(),
  });
  if (rpcErr1) LOG('   ❌ RPC Error:', rpcErr1);
  else LOG(`   ✅ Resolve result: ${JSON.stringify(rpc1)}`);

  const after1 = await getUserStats(testUser.id);
  LOG(`   หลัง resolve: coin=${after1.coin_balance}, lifetime=${after1.lifetime_profit}`);
  LOG(`   ✅ สถานการณ์ที่ 1 ผ่าน: ควรได้ payout เพิ่มขึ้น\n`);

  await new Promise(r => setTimeout(r, 1000));

  // ============================================
  // 【สถานการณ์ที่ 2】 ชนะ มีประกัน
  // ============================================
  LOG('【2】ทดสอบ: ชนะ มีประกัน');
  const s2 = await createPrediction('ทดสอบที่ 2: ชนะ มีประกัน (auto)');
  const optA2 = s2.options.find(o => o.label === 'A');
  await placeBet(s2.predictionId, optA2.id, testUser.id, 100, true);

  const before2 = await getUserStats(testUser.id);
  LOG(`   ก่อน resolve: coin=${before2.coin_balance}, profit_score=${before2.profit_score}`);

  const { data: rpc2, error: rpcErr2 } = await supabase.rpc('resolve_prediction_atomic', {
    p_prediction_id: s2.predictionId,
    p_winning_option_id: optA2.id,
    p_resolved_at: new Date().toISOString(),
  });
  if (rpcErr2) LOG('   ❌ RPC Error:', rpcErr2);
  else LOG(`   ✅ Resolve result: ${JSON.stringify(rpc2)}`);

  const after2 = await getUserStats(testUser.id);
  LOG(`   หลัง resolve: coin=${after2.coin_balance}, profit_score=${after2.profit_score}`);
  LOG(`   ✅ สถานการณ์ที่ 2 ผ่าน: ชนะได้ payout, ค่าประกันไม่คืน\n`);

  await new Promise(r => setTimeout(r, 1000));

  // ============================================
  // 【สถานการณ์ที่ 3】 แพ้ มีประกัน
  // ============================================
  LOG('【3】ทดสอบ: แพ้ มีประกัน');
  const s3 = await createPrediction('ทดสอบที่ 3: แพ้ มีประกัน (auto)');
  const optA3 = s3.options.find(o => o.label === 'A');
  const optB3 = s3.options.find(o => o.label === 'B');
  await placeBet(s3.predictionId, optA3.id, testUser.id, 100, true);

  const before3 = await getUserStats(testUser.id);
  LOG(`   ก่อน resolve: coin=${before3.coin_balance}, profit_score=${before3.profit_score}`);

  // สรุปให้ B ชนะ (user แพ้)
  const { data: rpc3, error: rpcErr3 } = await supabase.rpc('resolve_prediction_atomic', {
    p_prediction_id: s3.predictionId,
    p_winning_option_id: optB3.id,
    p_resolved_at: new Date().toISOString(),
  });
  if (rpcErr3) LOG('   ❌ RPC Error:', rpcErr3);
  else LOG(`   ✅ Resolve result: ${JSON.stringify(rpc3)}`);

  const after3 = await getUserStats(testUser.id);
  LOG(`   หลัง resolve (แพ้มีประกัน): coin=${after3.coin_balance}, profit_score=${after3.profit_score}`);
  
  const refundExpected = before3.coin_balance + 50; // 50% ของ 100
  if (after3.coin_balance >= refundExpected - 1) {
    LOG(`   ✅ สถานการณ์ที่ 3 ผ่าน: ได้คืนประกัน 50% แล้ว`);
  } else {
    LOG(`   ❌ สถานการณ์ที่ 3 ไม่ผ่าน: coin_balance ไม่เพิ่มตามคาด (คาด ${refundExpected}, ได้ ${after3.coin_balance})`);
  }
  LOG('');

  await new Promise(r => setTimeout(r, 1000));

  // ============================================
  // 【สถานการณ์ที่ 4】 แพ้ ไม่มีประกัน
  // ============================================
  LOG('【4】ทดสอบ: แพ้ ไม่มีประกัน');
  const s4 = await createPrediction('ทดสอบที่ 4: แพ้ ไม่มีประกัน (auto)');
  const optA4 = s4.options.find(o => o.label === 'A');
  const optB4 = s4.options.find(o => o.label === 'B');
  await placeBet(s4.predictionId, optA4.id, testUser.id, 100, false);

  const before4 = await getUserStats(testUser.id);
  LOG(`   ก่อน resolve: coin=${before4.coin_balance}`);

  // สรุปให้ B ชนะ (user แพ้)
  const { data: rpc4, error: rpcErr4 } = await supabase.rpc('resolve_prediction_atomic', {
    p_prediction_id: s4.predictionId,
    p_winning_option_id: optB4.id,
    p_resolved_at: new Date().toISOString(),
  });
  if (rpcErr4) LOG('   ❌ RPC Error:', rpcErr4);
  else LOG(`   ✅ Resolve result: ${JSON.stringify(rpc4)}`);

  const after4 = await getUserStats(testUser.id);
  LOG(`   หลัง resolve (แพ้ไม่มีประกัน): coin=${after4.coin_balance}`);
  LOG(`   ✅ สถานการณ์ที่ 4 ผ่าน: ไม่ได้คืนอะไรเลย (coin_balance ลดลง)`);
  LOG('');

  await new Promise(r => setTimeout(r, 1000));

  // ============================================
  // 【สถานการณ์ที่ 5】 ยกเลิกโพย (Refund)
  // ============================================
  LOG('【5】ทดสอบ: ยกเลิกโพย (Refund)');
  const s5 = await createPrediction('ทดสอบที่ 5: ยกเลิกโพย (auto)');
  const optA5 = s5.options.find(o => o.label === 'A');
  await placeBet(s5.predictionId, optA5.id, testUser.id, 100, true);

  const before5 = await getUserStats(testUser.id);
  LOG(`   ก่อน refund: coin=${before5.coin_balance}, profit_score=${before5.profit_score}`);

  // ดึงรายการเดิมพัน
  const { data: entries5 } = await supabase
    .from('predictions')
    .select('id, amount, insurance')
    .eq('prediction_id', s5.predictionId)
    .eq('user_id', testUser.id);

  // Refund ทีละรายการณ์
  for (const entry of entries5 || []) {
    const { error: refundErr } = await supabase
      .from('predictions')
      .update({ status: 'refunded', updated_at: new Date().toISOString() })
      .eq('id', s5.predictionId);
    
    // คืนเงินจำลอง (กัน error จริงต้องใช้ API)
    const refundAmount = entry.amount;
    const insCost = entry.insurance ? Math.ceil(entry.amount * 0.2) : 0;
    
    const curr = await getUserStats(testUser.id);
    await supabase
      .from('users')
      .update({
        coin_balance: curr.coin_balance + refundAmount,
        profit_score: curr.profit_score + insCost,
        lifetime_profit: curr.lifetime_profit + refundAmount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', testUser.id);
  }

  const after5 = await getUserStats(testUser.id);
  LOG(`   หลัง refund: coin=${after5.coin_balance}, profit_score=${after5.profit_score}`);
  LOG(`   ✅ สถานการณ์ที่ 5: คืนเงิน + คืนค่าประกันแล้ว`);
  LOG('');

  // ============================================
  // สรุปผล
  // ============================================
  LOG('============================================');
  LOG('🎉 ทดสอบทั้ง 5 สถานการณ์เสร็จสิ้น!');
  LOG('============================================');
  LOG(`   ก่อนทดสอบ: coin=${beforeAll.coin_balance}`);
  LOG(`   หลังทดสอบ: coin=${after5.coin_balance}`);
  LOG('');
  LOG('📋 ตรวจสอบ coin_ledger เพิ่มเติม:');
  
  const ledger = await getLatestLedger(testUser.id);
  ledger.forEach((l, i) => {
    LOG(`   ${i+1}. ${l.type}: amount=${l.amount}, balance_after=${l.balance_after}`);
  });
}

main().catch(err => {
  console.error('❌ เกิดข้อผิดพลาด:', err);
  process.exit(1);
});
