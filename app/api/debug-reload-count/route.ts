import { createSupabaseAdminClient } from '@/lib/db';

export async function GET() {
  const supabase = createSupabaseAdminClient();
  
  // Get users with reload_count
  const { data: users, error } = await supabase
    .from('users')
    .select('id, display_name, email, reload_count, created_at, last_seen_at, role')
    .neq('role', 'admin')
    .not('email', 'like', '%test%')
    .not('email', 'like', '%automated%')
    .order('reload_count', { ascending: false });
  
  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  // Calculate days and avgReloadPerDay for each user
  const usersWithStats = users?.map(user => {
    const createdAt = new Date(user.created_at);
    const now = new Date();
    const days = Math.max(1, Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)));
    const avgReloadPerDay = Math.round((user.reload_count || 0) / days * 100) / 100;
    
    return {
      id: user.id,
      displayName: user.display_name,
      email: user.email,
      reloadCount: user.reload_count || 0,
      daysActive: days,
      avgReloadPerDay: avgReloadPerDay,
      createdAt: user.created_at,
      lastSeenAt: user.last_seen_at
    };
  }) || [];
  
  return new Response(
    JSON.stringify({ ok: true, users: usersWithStats.slice(0, 20) }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
