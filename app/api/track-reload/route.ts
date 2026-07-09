import { createSupabaseAdminClient } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export async function POST(request: Request) {
  console.log('[track-reload] API called at:', new Date().toISOString());
  try {
    const user = await requireUser(request);
    
    const supabase = createSupabaseAdminClient();
    const userId = user.id;
    
    // Get current reload_count first
    const { data: currentUser, error: fetchError } = await supabase
      .from('users')
      .select('reload_count, created_at')
      .eq('id', userId)
      .single();
    
    if (fetchError || !currentUser) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const newReloadCount = (currentUser.reload_count || 0) + 1;
    console.log('[track-reload] User:', user.id, 'Current reload_count:', currentUser.reload_count, 'New reload_count:', newReloadCount);
    
    // Update reload_count and last_seen_at
    const { error: updateError } = await supabase
      .from('users')
      .update({
        reload_count: newReloadCount,
        last_seen_at: new Date()
      })
      .eq('id', userId);
    
    if (updateError) {
      console.error('[track-reload] Error updating reload count:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update reload count' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('[track-reload] SUCCESS: User', user.id, 'reload_count updated to', newReloadCount);
    
    return new Response(
      JSON.stringify({ 
        ok: true, 
        reloadCount: newReloadCount,
        lastSeenAt: new Date().toISOString()
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
