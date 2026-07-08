import { createSupabaseAdminClient } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    
    const supabase = createSupabaseAdminClient();
    const userId = user.id;
    
    // Update reload_count and last_seen_at
    const { data, error } = await supabase
      .from('users')
      .update({
        reload_count: supabase.raw('COALESCE(reload_count, 0) + 1'),
        last_seen_at: new Date()
      })
      .eq('id', userId)
      .select('reload_count, last_seen_at')
      .single();
    
    if (error) {
      console.error('Error updating reload count:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to update reload count' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ 
        ok: true, 
        reloadCount: data?.reload_count || 0,
        lastSeenAt: data?.last_seen_at 
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
