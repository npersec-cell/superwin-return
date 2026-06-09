const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Load .env.local manually
const envPath = '.env.local';
let envContent = '';
try {
  envContent = fs.readFileSync(envPath, 'utf8');
} catch (e) {
  console.error('Cannot read .env.local:', e.message);
  process.exit(1);
}

const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (match) {
    envVars[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
});

const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: users, error: uErr } = await supabase
    .from('users')
    .select('id, display_name, coin_balance')
    .order('coin_balance', { ascending: false });
  
  if (uErr) { console.error('Error:', uErr.message); return; }
  
  let mismatches = [];
  
  for (const user of users || []) {
    const { data: ledger, error: lErr } = await supabase
      .from('coin_ledger')
      .select('type, amount')
      .eq('user_id', user.id);
    
    if (lErr) { console.error('Ledger error:', lErr.message); continue; }
    
    const ledgerTotal = (ledger || []).reduce((sum, entry) => sum + (entry.amount || 0), 0);
    const diff = (user.coin_balance || 0) - ledgerTotal;
    
    if (diff !== 0) {
      mismatches.push({
        id: user.id.substring(0, 8),
        name: user.display_name || '-',
        dbBalance: user.coin_balance || 0,
        ledgerTotal: ledgerTotal,
        diff: diff,
        ledgerCount: ledger?.length || 0
      });
    }
  }
  
  console.log('=== Mismatched Users: ' + mismatches.length + ' ===');
  mismatches.forEach(m => {
    console.log(m.id + ' | ' + m.name + ' | DB:' + m.dbBalance + ' | Ledger:' + m.ledgerTotal + ' | Diff:' + m.diff + ' | Entries:' + m.ledgerCount);
  });
}

check().catch(console.error);
