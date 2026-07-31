import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ogegsffjbngpfqvrzkdb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nZWdzZmZqYm5ncGZxdnJ6a2RiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTc4Njc2MywiZXhwIjoyMDk1MzYyNzYzfQ.lbE3zntPOdwMM-EXgq8UcKXVsxiMMP4sE72pFgnL12w';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // Earliest prediction entry
  const { data: earliestEntry } = await supabase
    .from('prediction_entries')
    .select('id, prediction_id, amount, created_at')
    .order('created_at', { ascending: true })
    .limit(1);

  // Earliest prediction (question)
  const { data: earliestPred } = await supabase
    .from('predictions')
    .select('id, title, opens_at, closes_at, created_at')
    .order('created_at', { ascending: true })
    .limit(1);

  // Total stats
  const { count: totalEntries } = await supabase
    .from('prediction_entries')
    .select('*', { count: 'exact', head: true });

  const { count: totalPreds } = await supabase
    .from('predictions')
    .select('*', { count: 'exact', head: true });

  const { data: users } = await supabase
    .from('users')
    .select('id, created_at')
    .order('created_at', { ascending: true })
    .limit(1);

  console.log('=== ข้อมูลในระบบ ===');
  console.log(`จำนวนคำถามทั้งหมด: ${totalPreds}`);
  console.log(`จำนวนการเดิมพันทั้งหมด: ${totalEntries}`);
  console.log('');
  
  if (earliestEntry && earliestEntry.length > 0) {
    const e = earliestEntry[0];
    console.log('=== การเดิมพันครั้งแรก ===');
    console.log(`  Entry ID: ${e.id}`);
    console.log(`  Prediction ID: ${e.prediction_id}`);
    console.log(`  จำนวน: ${e.amount}`);
    console.log(`  วันที่: ${e.created_at}`);
  }
  
  console.log('');
  
  if (earliestPred && earliestPred.length > 0) {
    const p = earliestPred[0];
    console.log('=== คำถามแรกในระบบ ===');
    console.log(`  Title: ${p.title}`);
    console.log(`  เปิด: ${p.opens_at}`);
    console.log(`  ปิด: ${p.closes_at}`);
    console.log(`  สร้าง: ${p.created_at}`);
  }

  console.log('');
  
  if (users && users.length > 0) {
    console.log('=== User แรก ===');
    console.log(`  ID: ${users[0].id}`);
    console.log(`  สร้าง: ${users[0].created_at}`);
  }
}

main();
