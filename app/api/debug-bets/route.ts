import { createSupabaseAdminClient } from '@/lib/db';

// ดูข้อมูลใน prediction_entries
export async function GET() {
  const supabase = createSupabaseAdminClient();
  
  // ดูจำนวน entries ทั้งหมด
  const { count, error: countError } = await supabase
    .from('prediction_entries')
    .select('*', { count: 'exact', head: true });
  
  // ดู entries ที่ amount >= 1000
  const { data: bigBets, error: bigBetsError } = await supabase
    .from('prediction_entries')
    .select('id, user_id, prediction_id, amount, status, created_at')
    .gte('amount', 500) // ลองลดลงมาดู
    .order('amount', { ascending: false })
    .limit(10);
  
  // ดู entries ทั้งหมด (limit 10)
  const { data: allBets, error: allBetsError } = await supabase
    .from('prediction_entries')
    .select('id, user_id, prediction_id, amount, status, created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  
  return new Response(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      totalEntries: count,
      bigBets: bigBets,
      allBets: allBets
    }, null, 2),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
