import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ogegsffjbngpfqvrzkdb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nZWdzZmZqYm5ncGZxdnJ6a2RiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTc4Njc2MywiZXhwIjoyMDk1MzYyNzYzfQ.lbE3zntPOdwMM-EXgq8UcKXVsxiMMP4sE72pFgnL12w';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: users } = await supabase
    .from('users')
    .select('id, display_name, email, coin_balance, role')
    .neq('role', 'admin')
    .not('email', 'like', '%test%')
    .not('email', 'like', '%automated%');
  
  if (!users || users.length === 0) {
    console.error('No users found');
    return;
  }
  
  const userIds = users.map(u => u.id);
  
  const { data: entries } = await supabase
    .from('prediction_entries')
    .select('user_id, amount, payout_amount, status')
    .in('user_id', userIds)
    .eq('status', 'won');
  
  const userHighestWin = {};
  for (const u of users) {
    userHighestWin[u.id] = { 
      name: u.display_name || u.email.split('@')[0], 
      email: u.email,
      hsw: 0, 
      maxPayout: 0,
      maxBet: 0,
      anomalies: [] 
    };
  }
  
  let totalAnomalies = 0;
  for (const e of (entries || [])) {
    const profit = e.payout_amount - e.amount;
    const uh = userHighestWin[e.user_id];
    if (!uh) continue;
    
    if (e.payout_amount > uh.maxPayout) {
      uh.maxPayout = e.payout_amount;
      uh.maxBet = e.amount;
    }
    
    if (profit > uh.hsw) {
      uh.hsw = profit;
    }
    
    if (profit < 0) {
      uh.anomalies.push({ bet: e.amount, payout: e.payout_amount, loss: profit });
      totalAnomalies++;
    }
  }
  
  const sorted = Object.entries(userHighestWin)
    .map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => b.hsw - a.hsw);
  
  console.log('=== Top 15 Highest Single Win ===');
  console.log('Rank | Name          | HSW   | MaxPayout | MaxBet | Anomalies');
  console.log('-----|---------------|-------|-----------|--------|----------');
  sorted.slice(0, 15).forEach((u, i) => {
    const name = (u.name || '???').substring(0, 13);
    console.log(`${(i+1).toString().padStart(4)} | ${name.padEnd(13)} | ${u.hsw.toString().padStart(5)} | ${u.maxPayout.toString().padStart(9)} | ${u.maxBet.toString().padStart(6)} | ${u.anomalies.length}`);
  });
  
  console.log(`\n=== Users with "won" entries that lost money ===`);
  const usersWithAnomalies = sorted.filter(u => u.anomalies.length > 0);
  console.log(`Total users affected: ${usersWithAnomalies.length}`);
  console.log(`Total anomalous entries: ${totalAnomalies}`);
  
  if (usersWithAnomalies.length > 0) {
    console.log('\nDetails:');
    usersWithAnomalies.slice(0, 5).forEach(u => {
      console.log(`  ${u.name}: ${u.anomalies.length} entries lost money despite "won" status`);
      u.anomalies.slice(0, 3).forEach(a => {
        console.log(`    bet=${a.bet}, payout=${a.payout}, loss=${a.loss}`);
      });
    });
  }
  
  console.log('\n=== Verification: HSW >= 0 for all ===');
  const negativeHsw = sorted.filter(u => u.hsw < 0);
  if (negativeHsw.length === 0) {
    console.log('  All users have valid HSW >= 0 ✓');
  } else {
    negativeHsw.forEach(u => console.log(`  WARN: ${u.name} has HSW=${u.hsw}`));
  }
}

main();
