import { createSupabaseAdminClient } from '@/lib/db';

export async function GET() {
  const supabase = createSupabaseAdminClient();
  
  const { data: predictions, error } = await supabase
    .from('predictions')
    .select('*')
    .limit(3);
  
  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  return new Response(
    JSON.stringify({ ok: true, data: predictions }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
