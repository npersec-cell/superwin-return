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

async function fixNegativeLedgers() {
  console.log('=== Checking for users with negative ledger totals ===\n');
  
  const { data: users, error: uErr } = await supabase
    .from('users')
    .select('id, display_name, coin_balance');
  
  if (uErr) { console.error('Error:', uErr.message); return; }
  
  let fixed = 0;
  
  for (const user of users || []) {
    const { data: ledger, error: lErr } = await supabase
      .from('coin_ledger')
      .select('amount')
      .eq('user_id', user.id);
    
    if (lErr) { console.error('Ledger error:', lErr.message); continue; }
    
    const ledgerTotal = (ledger || []).reduce((sum, entry) => sum + (entry.amount || 0), 0);
    
    // If ledger is negative, create an adjustment entry to bring it to 0
    if (ledgerTotal < 0) {
      const adjustmentAmount = Math.abs(ledgerTotal);
      console.log(`Fixing ${user.id.substring(0,8)} (${user.display_name || '-'}): Ledger=${ledgerTotal}, creating claim +${adjustmentAmount}`);
      
      // Create ledger entry to offset the negative balance
      const { error: insertErr } = await supabase
        .from('coin_ledger')
        .insert({
          user_id: user.id,
          amount: adjustmentAmount,
          type: 'claim',
          balance_after: 0
        });
      
      if (insertErr) {
        console.error(`  FAILED: ${insertErr.message}`);
      } else {
        console.log(`  SUCCESS: Created claim entry +${adjustmentAmount}`);
        fixed++;
      }
      
      // Ensure DB balance is 0
      if ((user.coin_balance || 0) !== 0) {
        const { error: updateErr } = await supabase
          .from('users')
          .update({ coin_balance: 0 })
          .eq('id', user.id);
        
        if (updateErr) {
          console.error(`  DB update failed: ${updateErr.message}`);
        } else {
          console.log(`  DB balance set to 0`);
        }
      }
    }
  }
  
  console.log(`\n=== Fixed ${fixed} users ===`);
}

fixNegativeLedgers().catch(console.error);
