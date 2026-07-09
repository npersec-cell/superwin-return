import { createSupabaseAdminClient } from '@/lib/db';

// ทดสอบดูข้อมูลใน数据库
export async function GET() {
  const supabase = createSupabaseAdminClient();
  
  // ดูจำนวนผู้ใช้ทั้งหมด
  const { count, error: countError } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true });
  
  // ดู users ที่มี reload_count > 0 ทั้งหมด
  const { data: usersWithReload, error } = await supabase
    .from('users')
    .select('id, email, display_name, reload_count, created_at, last_seen_at')
    .gte('reload_count', 1)
    .order('reload_count', { ascending: false });
  
  // หา pubgmth
  const { data: pubgmthUser, error: pubgmthError } = await supabase
    .from('users')
    .select('id, email, display_name, reload_count, created_at, last_seen_at')
    .ilike('email', '%pubgmth%');
  
  if (error || countError) {
    return new Response(
      JSON.stringify({ error: error?.message || countError?.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  const result = {
    timestamp: new Date().toISOString(),
    totalUsers: count,
    usersWithReload: usersWithReload,
    usersWithReloadCount: usersWithReload.length,
    pubgmth: pubgmthUser,
    hasPubgmth: pubgmthUser && pubgmthUser.length > 0
  };
  
  return new Response(
    JSON.stringify(result, null, 2),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
