import { createClient } from '@/lib/supabase';
import { auth } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const session = await auth.getSession();
    
    if (!session?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const supabase = createClient();
    const userId = session.user.id;
    
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
        success: true, 
        reloadCount: data?.reload_count || 1,
        lastSeenAt: data?.last_seen_at 
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Track reload error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
