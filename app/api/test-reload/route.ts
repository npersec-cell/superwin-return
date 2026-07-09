import { createSupabaseAdminClient } from '@/lib/db';

// API ทดสอบ - เพิ่ม reload_count ให้กับ pubgmth@gmail.com
export async function POST() {
  console.log('[test-reload] API called at:', new Date().toISOString());
  
  const supabase = createSupabaseAdminClient();
  
  // หา pubgmth
  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, reload_count, created_at')
    .ilike('email', '%pubgmth%')
    .single();
  
  if (error || !user) {
    return new Response(
      JSON.stringify({ error: 'pubgmth not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  console.log('[test-reload] Found pubgmth:', user.email, 'current reload_count:', user.reload_count);
  
  // จำลองการกด reload
  const newReloadCount = (user.reload_count || 0) + 1;
  
  const { error: updateError } = await supabase
    .from('users')
    .update({
      reload_count: newReloadCount,
      last_seen_at: new Date()
    })
    .eq('id', user.id);
  
  if (updateError) {
    console.error('[test-reload] Error updating:', updateError);
    return new Response(
      JSON.stringify({ error: 'Failed to update' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  console.log('[test-reload] SUCCESS: reload_count updated to', newReloadCount);
  
  return new Response(
    JSON.stringify({ 
      ok: true, 
      email: user.email,
      oldReloadCount: user.reload_count,
      newReloadCount,
      lastSeenAt: new Date().toISOString()
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
