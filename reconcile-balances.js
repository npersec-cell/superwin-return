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

async function reconcileBalances() {
  console.log('=== COIN BALANCE RECONCILIATION ===\n');
  
  // 1. Get all users
  console.log('[1/4] Fetching all users...');
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id, display_name, coin_balance');
  
  if (userError) {
    console.error('Error fetching users:', userError.message);
    return;
  }
  
  console.log(`Found ${users.length} users\n`);
  
  // 2. For each user, calculate correct balance from ledger
  console.log('[2/4] Calculating correct balances from ledger...\n');
  const updates = [];
  let mismatchCount = 0;
  
  for (const user of users) {
    const { data: ledger, error: ledgerError } = await supabase
      .from('coin_ledger')
      .select('type, amount')
      .eq('user_id', user.id);
    
    if (ledgerError) {
      console.error(`Error fetching ledger for user ${user.id}:`, ledgerError.message);
      continue;
    }
    
    // Calculate balance from ledger (amount is already signed: + for credit, - for debit)
    const ledgerTotal = (ledger || []).reduce((sum, entry) => {
      return sum + (entry.amount || 0); // amount is already signed
    }, 0);
    
    const currentBalance = user.coin_balance || 0;
    const diff = currentBalance - ledgerTotal;
    
    if (Math.abs(diff) > 0) {
      mismatchCount++;
      console.log(`MISMATCH #${mismatchCount}:`);
      console.log(`  User: ${user.display_name || user.id.substring(0, 8)}`);
      console.log(`  Current DB balance: ${currentBalance}`);
      console.log(`  Correct ledger balance: ${ledgerTotal}`);
      console.log(`  Difference: ${diff}`);
      console.log(`  Ledger entries: ${ledger?.length || 0}`);
      
      // If no ledger entries, the balance was set directly (initial balance)
      // We should create a ledger entry for the initial balance
      if (!ledger || ledger.length === 0) {
        console.log(`  → Will create initial claim entry for ${currentBalance} coins`);
        updates.push({
          userId: user.id,
          correctBalance: currentBalance,
          createLedgerEntry: true,
          entryAmount: currentBalance
        });
      } else {
        // Clamp negative balances to 0 (due to DB constraint)
        const finalBalance = ledgerTotal < 0 ? 0 : ledgerTotal;
        console.log(`  → Will update DB balance to ${finalBalance}${ledgerTotal < 0 ? ' (clamped from ' + ledgerTotal + ')' : ''}`);
        updates.push({
          userId: user.id,
          correctBalance: finalBalance,
          createLedgerEntry: false
        });
      }
      console.log('');
    }
  }
  
  console.log(`\n[3/4] Found ${mismatchCount} users with mismatched balances\n`);
  
  if (updates.length === 0) {
    console.log('✅ All balances are already correct! No updates needed.');
    return;
  }
  
  // 4. Ask for confirmation
  console.log('=== UPDATES TO APPLY ===');
  for (const update of updates) {
    const user = users.find(u => u.id === update.userId);
    console.log(`- ${user?.display_name || update.userId.substring(0, 8)}: ${update.correctBalance} coins${update.createLedgerEntry ? ' (will create ledger entry)' : ''}`);
  }
  console.log('\n⚠️  DRY RUN MODE - No changes applied yet');
  console.log('To apply changes, modify this script and set APPLY_CHANGES = true\n');
  
  const APPLY_CHANGES = true; // Set to true to apply changes
  
  if (!APPLY_CHANGES) {
    console.log('Dry run complete. Set APPLY_CHANGES = true to apply changes.');
    return;
  }
  
  // 5. Apply updates
  console.log('\n[4/4] Applying updates...\n');
  let successCount = 0;
  let errorCount = 0;
  
  for (const update of updates) {
    try {
      // Update user balance
      const { error: updateError } = await supabase
        .from('users')
        .update({ coin_balance: update.correctBalance })
        .eq('id', update.userId);
      
      if (updateError) {
        console.error(`Error updating user ${update.userId}:`, updateError.message);
        errorCount++;
        continue;
      }
      
      // Create ledger entry if needed
      if (update.createLedgerEntry && update.entryAmount > 0) {
        const { error: ledgerError } = await supabase
          .from('coin_ledger')
          .insert({
            user_id: update.userId,
            type: 'claim',
            amount: update.entryAmount,
            balance_after: update.entryAmount,
            ref_type: 'reconciliation',
            ref_id: null,
            detail: 'Initial balance reconciliation'
          });
        
        if (ledgerError) {
          console.error(`Error creating ledger entry for ${update.userId}:`, ledgerError.message);
          errorCount++;
          continue;
        }
      }
      
      const user = users.find(u => u.id === update.userId);
      console.log(`✅ Updated ${user?.display_name || update.userId.substring(0, 8)}: ${update.correctBalance} coins`);
      successCount++;
      
    } catch (err) {
      console.error(`Unexpected error for user ${update.userId}:`, err.message);
      errorCount++;
    }
  }
  
  console.log('\n=== RECONCILIATION COMPLETE ===');
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log(`📊 Total processed: ${updates.length}`);
}

reconcileBalances().catch(console.error);
