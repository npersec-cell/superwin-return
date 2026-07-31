import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ogegsffjbngpfqvrzkdb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nZWdzZmZqYm5ncGZxdnJ6a2RiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTc4Njc2MywiZXhwIjoyMDk1MzYyNzYzfQ.lbE3zntPOdwMM-EXgq8UcKXVsxiMMP4sE72pFgnL12w';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, display_name, email, coin_balance, lifetime_profit')
    .eq('email', 'khunstang3310@gmail.com')
    .single();
  
  if (userErr || !user) {
    console.error('User not found:', userErr?.message);
    return;
  }
  
  console.log('=== User ===');
  console.log(JSON.stringify(user, null, 2));
  
  const { data: entries, error: entriesErr } = await supabase
    .from('prediction_entries')
    .select('id, prediction_id, option_id, amount, payout_amount, status, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  
  if (entriesErr) {
    console.error('Entries error:', entriesErr.message);
    return;
  }
  
  console.log('\n=== All Entries ===');
  entries.forEach((e, i) => {
    const profit = e.status === 'won' ? (e.payout_amount - e.amount) : -(e.amount);
    console.log(`[${i+1}] status=${e.status}, bet=${e.amount}, payout=${e.payout_amount}, profit=${profit}`);
  });
  
  const won = entries.filter(e => e.status === 'won');
  console.log(`\nWon entries: ${won.length}`);
  won.forEach((e, i) => {
    const profit = e.payout_amount - e.amount;
    console.log(`  [${i+1}] pred=${e.prediction_id}, bet=${e.amount}, payout=${e.payout_amount}, profit=${profit}`);
  });
  
  const maxWin = won.reduce((max, e) => {
    const profit = e.payout_amount - e.amount;
    return profit > max ? profit : max;
  }, 0);
  
  console.log(`\nHighest Single Win (calculated): ${maxWin}`);
}

main();
