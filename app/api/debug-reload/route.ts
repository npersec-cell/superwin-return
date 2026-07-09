import { createSupabaseAdminClient } from '@/lib/db';

// ทดสอบดูข้อมูลใน数据库 และดูว่ามีใคร reload_count > 0 ไหม
export async function GET() {
  const supabase = createSupabaseAdminClient();
  
  // ดู users ที่มี reload_count > 0
  const { data: usersWithReload, error } = await supabase
    .from('users')
    .select('id, email, display_name, reload_count, created_at, last_seen_at')
    .order('reload_count', { ascending: false })
    .limit(50); // ดู 50 คนเพื่อหา pubgmth
  
  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  // หา pubgmth
  const pubgmthUser = usersWithReload.find(u => u.email?.includes('pubgmth'));
  
  // หาว่ามีใคร reload_count > 0 ไหม
  const hasNonZeroReload = usersWithReload.some(u => (u.reload_count || 0) > 0);
  
  // หาผู้ใช้ที่มี reload_count > 0 ทั้งหมด
  const usersWithReloadCount = usersWithReload.filter(u => (u.reload_count || 0) > 0);
  
  const result = {
    timestamp: new Date().toISOString(),
    totalUsersChecked: usersWithReload.length,
    usersWithNonZeroReload: usersWithReloadCount.length,
    usersWithReload: usersWithReload,
    pubgmth: pubgmthUser,
    hasNonZeroReload
  };
  
  return new Response(
    JSON.stringify(result, null, 2),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
