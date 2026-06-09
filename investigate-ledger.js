const fs = require('fs');
const path = require('path');

// Manual .env loader
function loadEnv() {
  const envPath = path.join(__dirname, '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('.env.local not found!');
    process.exit(1);
  }
  
  const content = fs.readFileSync(envPath, 'utf-8');
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) continue;
    
    const key = trimmed.substring(0, equalIndex).trim();
    let value = trimmed.substring(equalIndex + 1).trim();
    
    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.substring(1, value.length - 1);
    }
    
    process.env[key] = value;
  }
}

loadEnv();

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function investigate() {
  console.log('=== TRANSACTION TYPES ===');
  const { data: allLedger, error: tErr } = await supabase
    .from('coin_ledger')
    .select('type');
  
  if (tErr) { console.error('Error:', tErr.message); return; }
  
  const typeCounts = {};
  allLedger.forEach(t => { typeCounts[t.type] = (typeCounts[t.type] || 0) + 1; });
  console.log(JSON.stringify(typeCounts, null, 2));
  
  // Check claim transactions
  console.log('\n=== SAMPLE CLAIM TRANSACTIONS ===');
  const { data: claims, error: cErr } = await supabase
    .from('coin_ledger')
    .select('*')
    .eq('type', 'claim')
    .limit(3);
  
  if (cErr) {
    console.log('No claim type found or error:', cErr.message);
  } else if (claims && claims.length > 0) {
    console.log(JSON.stringify(claims, null, 2));
  } else {
    console.log('No claim transactions found');
  }
  
  // Check credit transactions  
  console.log('\n=== SAMPLE CREDIT TRANSACTIONS ===');
  const { data: credits, error: crErr } = await supabase
    .from('coin_ledger')
    .select('*')
    .eq('type', 'credit')
    .limit(3);
  
  if (crErr) {
    console.log('Error:', crErr.message);
  } else if (credits && credits.length > 0) {
    console.log(JSON.stringify(credits, null, 2));
  } else {
    console.log('No credit transactions found');
  }
  
  // Check users with mismatch
  console.log('\n=== CHECKING USERS FOR MISMATCH ===');
  const { data: users, error: uErr } = await supabase
    .from('users')
    .select('id, display_name, coin_balance')
    .limit(20);
  
  if (uErr) { console.error('User error:', uErr.message); return; }
  
  let mismatchCount = 0;
  for (const user of users || []) {
    const { data: ledger, error: lErr } = await supabase
      .from('coin_ledger')
      .select('type, amount, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    
    if (lErr) { console.error('Ledger error:', lErr.message); continue; }
    
    const ledgerTotal = (ledger || []).reduce((sum, entry) => {
      return sum + (entry.type === 'credit' ? entry.amount : -entry.amount);
    }, 0);
    
    const userBalance = user.coin_balance || 0;
    const diff = userBalance - ledgerTotal;
    
    if (Math.abs(diff) > 0) {
      mismatchCount++;
      console.log('\nMISMATCH #' + mismatchCount + ':');
      console.log('User:', user.display_name || user.id.substring(0,8));
      console.log('DB Balance:', userBalance);
      console.log('Ledger Total:', ledgerTotal);
      console.log('Difference:', diff);
      console.log('Ledger entries:', ledger?.length || 0);
      if (ledger && ledger.length > 0) {
        ledger.forEach(l => {
          console.log('  -', l.type, ':', l.amount, 'at', l.created_at);
        });
      } else {
        console.log('  (No ledger entries - balance was set directly!)');
      }
    }
  }
  
  console.log('\n=== SUMMARY ===');
  console.log('Total mismatches found in first 20 users:', mismatchCount);
  console.log('This suggests balances were set directly without ledger entries.');
}

investigate().catch(console.error);
