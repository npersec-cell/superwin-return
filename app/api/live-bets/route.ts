import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/db';

export async function GET() {
  const supabase = createSupabaseAdminClient();
  
  console.log('[live-bets] Starting fetch...');
  
  // ── Get BOTH regular and BTC predictions ──
  const [regularResult, btcResult] = await Promise.all([
    supabase
      .from('prediction_entries')
      .select('id, user_id, prediction_id, amount, option_id, created_at, status')
      .order('created_at', { ascending: false })
      .limit(10),
    
    supabase
      .from('btc_quick_predictions')
      .select('id, user_id, direction, stake_amount as amount, entry_price, status, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  if (regularResult.error) {
    console.error('[live-bets] Failed to fetch regular entries:', regularResult.error.message);
    return NextResponse.json({ error: 'Failed to fetch live bets', detail: regularResult.error.message }, { status: 500 });
  }

  if (btcResult.error) {
    console.error('[live-bets] Failed to fetch BTC entries:', btcResult.error.message);
  }

  const entries = regularResult.data || [];
  let btcEntries = btcResult.data || null;

  console.log(`[live-bets] Initial fetch - Regular: ${entries.length}, BTC: ${btcEntries?.length || 0}`);
  if (btcEntries && btcEntries.length > 0) {
    console.log('[live-bets] BTC entries found:', btcEntries.map(e => ({ id: e.id, createdAt: e.created_at, direction: e.direction })));
  }

  // Retry BTC query if empty (replication lag)
  if (!btcEntries || btcEntries.length === 0) {
    console.log('[live-bets] BTC entries empty, starting retry with delays...');
    for (let attempt = 0; attempt < 3; attempt++) {
      const delayMs = (attempt + 1) * 800;
      console.log(`[live-bets] Retry attempt ${attempt + 1}, waiting ${delayMs}ms...`);
      await new Promise(r => setTimeout(r, delayMs));
      
      const retry = await supabase
        .from('btc_quick_predictions')
        .select('id, user_id, direction, stake_amount as amount, entry_price, status, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
      
      console.log(`[live-bets] Retry ${attempt + 1} result: count=${retry.data?.length || 0}, error=${retry.error?.message || 'none'}`);
      
      if (retry.data && retry.data.length > 0) {
        btcEntries = retry.data;
        console.log('[live-bets] SUCCESS! BTC entries found on retry:', btcEntries.length);
        break;
      }
    }
  }

  // ── Process regular predictions ──
  let allBets: any[] = [];
  
  if (entries.length > 0) {
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
  
  // ── Add BTC quick predictions ──
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
  
  // ── Sort ALL combined bets by recency and take top 5 ──
  allBets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const liveBets = allBets.slice(0, 5);
  
  console.log(`[live-bets] Final - Regular: ${entries.length}, BTC: ${btcEntries?.length || 0}, Combined: ${allBets.length}, Returning: ${liveBets.length}`);
  console.log('[live-bets] Returning bets:', liveBets.map(b => ({ type: b.type, id: b.id?.slice(0,8), amount: b.amount, createdAt: b.createdAt })));
  
  return NextResponse.json({ ok: true, data: liveBets });
}
