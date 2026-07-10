import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/db';

export async function GET() {
  const supabase = createSupabaseAdminClient();
  
  // Get prediction entries that are running (not yet resolved)
  // Show all entries regardless of amount
  // Note: status can be 'running' or 'pending'
  const { data: entries, error: entriesError } = await supabase
    .from('prediction_entries')
    .select('id, user_id, prediction_id, amount, option_id, created_at, status')
    .in('status', ['running', 'pending'])
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (entriesError) {
    return NextResponse.json({ error: 'Failed to fetch live bets', detail: entriesError.message }, { status: 500 });
  }
  
  // If no entries found, return empty
  if (!entries || entries.length === 0) {
    return NextResponse.json({ ok: true, data: [], message: "No live bets found" });
  }
  
  // Get user display names
  const userIds = [...new Set(entries.map(e => e.user_id))];
  const { data: users } = await supabase
    .from('users')
    .select('id, display_name, email')
    .in('id', userIds);
  
  // Get prediction names
  const predictionIds = [...new Set(entries.map(e => e.prediction_id))];
  const { data: predictions } = await supabase
    .from('predictions')
    .select('id, question, tournament_name')
    .in('id', predictionIds);
  
  // Get option labels from prediction_options table
  const optionIds = [...new Set(entries.map(e => e.option_id))];
  const { data: optionRows } = await supabase
    .from('prediction_options')
    .select('id, label')
    .in('id', optionIds);
  
  // Build option labels map
  const optionLabels: Record<string, string> = {};
  for (const opt of optionRows || []) {
    if (opt.id && opt.label) {
      optionLabels[opt.id] = opt.label;
    }
  }
  
  // Map users and predictions
  const userMap = new Map(users?.map(u => [u.id, u]) as [string, any][]);
  const predictionMap = new Map(predictions?.map(p => [p.id, p]) as [string, any][]);
  
  // Format live bets
  const liveBets = entries.map(entry => {
    const user = userMap.get(entry.user_id);
    const prediction = predictionMap.get(entry.prediction_id);
    const optionLabel = entry.option_id ? optionLabels[entry.option_id] : 'Option';
    
    return {
      userId: entry.user_id,
      displayName: user?.display_name || user?.email?.split('@')[0] || 'User',
      predictionId: entry.prediction_id,
      predictionTitle: prediction?.question || 'Prediction',
      tournamentName: prediction?.tournament_name || 'PUBG Mobile Esports',
      optionLabel: optionLabel,
      amount: entry.amount,
      createdAt: entry.created_at
    };
  });
  
  return NextResponse.json({ ok: true, data: liveBets });
}
