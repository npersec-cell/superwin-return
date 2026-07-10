import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";
import { createSafeErrorResponse } from "@/lib/safe-error-handler";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ ok: false, error: "userId is required" }, { status: 400 });
    }

    // ── ดึง user info ──
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("display_name, email, lifetime_profit")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    // ── คำนวณ profit_score แบบ real-time ──
    const { data: calculatedProfitScore, error: profitError } = await supabase
      .rpc('calculate_user_profit_score', { p_user_id: userId });

    const profitScore = calculatedProfitScore ?? 0;
    if (profitError) {
      console.error('[Profile] Error calculating profit_score:', profitError);
    }

    // ── คำนวณ Rank (จำนวนคนที่มีคะแนนสูงกว่า + 1) ──
    const { data: usersAbove, error: usersError } = await supabase
      .from('users')
      .select('id')
      .neq('role', 'admin')
      .not('email', 'like', '%test%')
      .not('email', 'like', '%automated%');

    let rank = 1; // Default rank
    if (!usersError && usersAbove) {
      // Count how many users have higher profit_score
      const rankPromises = usersAbove.map(u => 
        supabase.rpc('calculate_user_profit_score', { p_user_id: u.id })
      );
      
      const rankResults = await Promise.all(rankPromises);
      const usersWithHigherScore = rankResults.filter((score: any) => score && score > profitScore).length;
      rank = usersWithHigherScore + 1;
    }

    // ════════════════════════════════════════════════
    // SOURCE OF TRUTH: prediction_entries table
    // (ไม่ match text จาก ledger อีก — ใช้ DB relation โดยตรง)
    // ════════════════════════════════════════════════

    // ดึงทุก entries ของ user ที่ settle แล้ว (won / lost / refunded)
    const { data: entries, error: entriesError } = await supabase
      .from("prediction_entries")
      .select(`
        id,
        prediction_id,
        option_id,
        amount,
        payout_amount,
        status,
        created_at,
        predictions (
          id,
          question,
          tournament_name,
          resolved_at
        )
      `)
      .eq("user_id", userId)
      .in("status", ["won", "lost", "refunded"])
      .order("created_at", { ascending: false });

    if (entriesError) {
      console.error("[Profile] Error fetching prediction_entries:", entriesError);
      return NextResponse.json({
        ok: true,
        data: {
          name: user.display_name || user.email.split("@")[0],
          displayName: user.display_name || null,
          profitScore,
          allTimeProfit: user.lifetime_profit || 0,
          winRate: 0,
          wonCount: 0,
          lostCount: 0,
          totalSettled: 0,
          badge: "Rookie",
          badgeDesc: "New predictor in the arena.",
          history: []
        }
      });
    }

    // ── นับ win/loss จาก entries โดยตรง (authoritative) ──
    let wonCount = 0;
    let lostCount = 0;
    for (const e of entries || []) {
      if (e.status === "won") wonCount++;
      else lostCount++; // lost OR refunded นับเป็น lost
    }
    const totalSettled = (entries || []).length;
    const winRate = totalSettled > 0 ? Math.round((wonCount / totalSettled) * 100) : 0;

    // ── Batch fetch option labels ──
    const optionIds = [...new Set(
      (entries || []).map((e: any) => e.option_id).filter(Boolean)
    )] as string[];

    const optionsMap = new Map<string, string>();
    if (optionIds.length > 0) {
      const { data: opts } = await supabase
        .from("prediction_options")
        .select("id, label")
        .in("id", optionIds);
      if (opts) {
        for (const o of opts) {
          optionsMap.set(o.id, o.label);
        }
      }
    }

    // ── สร้าง history (เรียงตาม resolved_at desc → created_at desc) ──
    const sortedEntries = [...(entries || [])].sort((a: any, b: any) => {
      const dateA = new Date(a.predictions?.resolved_at || a.created_at).getTime();
      const dateB = new Date(b.predictions?.resolved_at || b.created_at).getTime();
      return dateB - dateA; // newest first
    });

    const history = sortedEntries.slice(0, 5).map((e: any) => {
      const pred = e.predictions || {};
      const pickText = e.option_id ? (optionsMap.get(e.option_id) || "") : "";

      // net profit: สำหรับ won = payout - bet | สำหรับ lost/refunded = -bet
      const isWon = e.status === "won";
      const net = isWon
        ? (e.payout_amount || 0) - e.amount
        : -e.amount;

      return {
        id: e.id,
        tournament: pred.tournament_name || "Prediction",
        question: pred.question || "Unknown Question",
        pick: pickText,
        amount: e.amount,
        payout: e.payout_amount || 0,
        status: isWon ? "won" : ("lost" as "won" | "lost"),
        net, // เพิ่ม net ให้ frontend ไม่ต้องคำนวณซ้ำ
        date: new Date(pred.resolved_at || e.created_at).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short"
        })
      };
    });

    // ── Stats เพิ่มเติม ──
    const totalCoinsBet = (entries || []).reduce((acc: number, e: any) => acc + Math.abs(e.amount), 0);
    const avgBetSize = totalSettled > 0 ? Math.round(totalCoinsBet / totalSettled) : 0;

    // ── Badge ──
    let badge = "Rookie";
    let badgeDesc = "New predictor in the arena.";
    if (totalSettled >= 10 && winRate >= 60) {
      badge = "Elite Sharpshooter";
      badgeDesc = "Extreme precision over multiple bets.";
    } else if (avgBetSize >= 500 && totalSettled >= 5) {
      badge = "High Roller";
      badgeDesc = "Wages massive coin stacks on predictions.";
    } else if (totalSettled >= 8) {
      badge = "Active Predictor";
      badgeDesc = "Experienced and consistent prediction rate.";
    }

    return NextResponse.json({
      ok: true,
      data: {
        name: user.display_name || user.email.split("@")[0],
        displayName: user.display_name || null,
        profitScore,
        overallScore: profitScore, // คะแนน Overall (ใช้คำนวณ rank)
        rank, // ตำแหน่งของผู้ใช้
        allTimeProfit: user.lifetime_profit || 0,
        winRate,
        wonCount,
        lostCount,
        totalSettled,
        badge,
        badgeDesc,
        history
      }
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0"
      }
    });
  } catch (error) {
    return createSafeErrorResponse(error);
  }
}
