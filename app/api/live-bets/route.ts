import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/db';

export async function GET() {
  const supabase = createSupabaseAdminClient();
  
  // Get latest 5 regular prediction entries
  const { data: entries, error: entriesError } = await supabase
    .from('prediction_entries')
    .select('id, user_id, prediction_id, amount, option_id, created_at, status')
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (entriesError) {
    return NextResponse.json({ error: 'Failed to fetch live bets', detail: entriesError.message }, { status: 500 });
  }
  
  // Get latest 5 BTC quick predictions
  const { data: btcEntries, error: btcError } = await supabase
    .from('btc_quick_predictions')
    .select('id, user_id, direction, stake_amount as amount, entry_price, status, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  // Combine and sort by created_at
  let allBets: any[] = [];
  
  if (entries && entries.length > 0) {
    // Get user display names for regular predictions
    const userIds = [...new Set(entries.map(e => e.user_id))];
    const { data: users } = await supabase
      .from('users')
      .select('id, display_name, email')
      .in('id', userIds);
    
    const predictionIds = [...new Set(entries.map(e => e.prediction_id))];
    const { data: predictions } = await supabase
      .from('predictions')
      .select('id, question, tournament_name')
      .in('id', predictionIds);
    
    const optionIds = [...new Set(entries.map(e => e.option_id))];
    const { data: optionRows } = await supabase
      .from('prediction_options')
      .select('id, label')
      .in('id', optionIds);
    
    const optionLabels: Record<string, string> = {};
    for (const opt of optionRows || []) {
      if (opt.id && opt.label) optionLabels[opt.id] = opt.label;
    }
    
    const userMap = new Map(users?.map(u => [u.id, u]) as [string, any][]);
    const predictionMap = new Map(predictions?.map(p => [p.id, p]) as [string, any][]);
    
    allBets = entries.map(entry => {
      const user = userMap.get(entry.user_id);
      const prediction = predictionMap.get(entry.prediction_id);
      const optionLabel = entry.option_id ? optionLabels[entry.option_id] : 'Option';
      
      return {
        type: 'regular',
        id: entry.id,
        userId: entry.user_id,
        displayName: user?.display_name ? user.display_name : null,
        rawEmailPrefix: user?.email?.split('@')[0],
        predictionId: entry.prediction_id,
        predictionTitle: prediction?.question || 'Prediction',
        tournamentName: prediction?.tournament_name || 'PUBG Mobile Esports',
        optionLabel: optionLabel,
        amount: entry.amount,
        createdAt: entry.created_at,
      };
    });
  }
  
  // Add BTC quick predictions
  if (btcEntries && btcEntries.length > 0) {
    const btcUserIds = [...new Set(btcEntries.map(e => e.user_id))];
    const { data: btcUsers } = await supabase
      .from('users')
      .select('id, display_name, email')
      .in('id', btcUserIds);
    
    const btcUserMap = new Map(btcUsers?.map(u => [u.id, u]) as [string, any][]);
    
    const btcBets = btcEntries.map(entry => ({
      type: 'btc',
      id: entry.id,
      userId: entry.user_id,
      displayName: btcUserMap.get(entry.user_id)?.display_name || null,
      rawEmailPrefix: btcUserMap.get(entry.user_id)?.email?.split('@')[0],
      direction: entry.direction,
      entryPrice: entry.entry_price,
      amount: entry.amount,
      status: entry.status,
      createdAt: entry.created_at,
    }));
    
    allBets = [...allBets, ...btcBets];
  }
  
  // Sort all by created_at descending and take top 5
  allBets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const liveBets = allBets.slice(0, 5);
  
  return NextResponse.json({ ok: true, data: liveBets });
}
