import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/db';

export async function GET() {
  const supabase = createSupabaseAdminClient();
  
  // Get prediction entries that are pending (not yet resolved)
  // Only show entries with amount >= 1000
  const { data: entries, error: entriesError } = await supabase
    .from('prediction_entries')
    .select('id, user_id, prediction_id, amount, option_name, created_at')
    .eq('status', 'pending')
    .gte('amount', 1000)
    .order('amount', { ascending: false })
    .limit(5);
  
  if (entriesError) {
    return NextResponse.json({ error: 'Failed to fetch live bets' }, { status: 500 });
  }
  
  // Get user display names
  const userIds = [...new Set(entries?.map(e => e.user_id) || [])];
  const { data: users } = await supabase
    .from('users')
    .select('id, display_name, email')
    .in('id', userIds);
  
  // Get prediction names
  const predictionIds = [...new Set(entries?.map(e => e.prediction_id) || [])];
  const { data: predictions } = await supabase
    .from('predictions')
    .select('id, title')
    .in('id', predictionIds);
  
  // Map users and predictions
  const userMap = new Map(users?.map(u => [u.id, u]) as [string, any][]);
  const predictionMap = new Map(predictions?.map(p => [p.id, p]) as [string, any][]);
  
  // Format live bets
  const liveBets = (entries || []).map(entry => {
    const user = userMap.get(entry.user_id);
    const prediction = predictionMap.get(entry.prediction_id);
    
    return {
      userId: entry.user_id,
      displayName: user?.display_name || user?.email?.split('@')[0] || 'User',
      predictionId: entry.prediction_id,
      predictionTitle: prediction?.title || 'Prediction',
      optionName: entry.option_name,
      amount: entry.amount,
      createdAt: entry.created_at
    };
  });
  
  return NextResponse.json({ ok: true, data: liveBets });
}
