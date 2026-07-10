import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";
import { createSafeErrorResponse } from "@/lib/safe-error-handler";

export const dynamic = "force-dynamic";

// Logarithmic score calculation (same as v2 leaderboard API)
function calcLogScore(value: number): number {
  return Math.log2(value + 1);
}

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
      .select("display_name, email, lifetime_profit, profit_score, reload_count, created_at")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    // ── ดึง entries ของ user ที่ won ──
    const { data: userEntries, error: userEntriesError } = await supabase
      .from("prediction_entries")
      .select("amount, payout_amount, status")
      .eq("user_id", userId)
      .eq("status", "won");

    let predictionCount = (userEntries || []).length; // จำนวนครั้งที่猜
    let highestSingleWin = 0; // สูงสุดที่ได้

    // Calculate highest single win from won entries
    for (const entry of (userEntries || [])) {
      const profit = entry.payout_amount - entry.amount;
      if (profit > highestSingleWin) {
        highestSingleWin = profit;
      }
    }

    // Calculate average reload per day (simplified)
    const daysSinceCreated = Math.max(1, Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)));
    const avgReloadPerDay = (user.reload_count || 0) / daysSinceCreated;

    // ── Calculate Overall score using the same formula as v2 API ──
    const profitScoreLog = calcLogScore(user.profit_score || 0);
    const predictionScoreLog = calcLogScore(predictionCount);
    const winScoreLog = calcLogScore(highestSingleWin);
    const activeScoreLog = calcLogScore(avgReloadPerDay);
    const overallScore = Math.round(profitScoreLog + predictionScoreLog + winScoreLog + activeScoreLog);

    // ── คำนวณ Rank (จำนวนคนที่มี Overall score สูงกว่า + 1) ──
    const { data: allUsers, error: usersError } = await supabase
      .from('users')
      .select('id, profit_score, reload_count, created_at')
      .neq('role', 'admin')
      .not('email', 'like', '%test%')
      .not('email', 'like', '%automated%');

    let rank = 1; // Default rank
    if (!usersError && allUsers) {
      // Get all users' entries count and highest win
      const allUserIds = allUsers.map(u => u.id);
      const { data: allEntries, error: allEntriesError } = await supabase
        .from('prediction_entries')
        .select('user_id, amount, payout_amount, status')
        .in('user_id', allUserIds)
        .eq('status', 'won');

      if (!allEntriesError && allEntries) {
        // Calculate each user's overall score
        const userScores = new Map<string, number>();
        for (const u of allUsers) {
          const entries = allEntries.filter(e => e.user_id === u.id);
          const count = entries.length;
          let highestWin = 0;
          for (const e of entries) {
            const profit = e.payout_amount - e.amount;
            if (profit > highestWin) highestWin = profit;
          }
          const daysSince = Math.max(1, Math.floor((Date.now() - new Date(u.created_at).getTime()) / (1000 * 60 * 60 * 24)));
          const avgReload = (u.reload_count || 0) / daysSince;
          
          const score = Math.round(
            calcLogScore(u.profit_score || 0) +
            calcLogScore(count) +
            calcLogScore(highestWin) +
            calcLogScore(avgReload)
          );
          userScores.set(u.id, score);
        }

        // Count how many users have higher score
        let usersWithHigherScore = 0;
        for (const [uid, score] of userScores) {
          if (score > overallScore) usersWithHigherScore++;
        }
        rank = usersWithHigherScore + 1;
      }
    }

    // ════════════════════════════════════════════════
    // SOURCE OF TRUTH: prediction_entries table
    // (ไม่ match text จาก ledger อีก — ใช้ DB relation โดยตรง)
    // ════════════════════════════════════════════════

    // ดึงทุก entries ของ user ที่ settle แล้ว (won / lost / refunded)
    const { data: historyEntries, error: historyEntriesError } = await supabase
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

    if (historyEntriesError) {
      console.error("[Profile] Error fetching prediction_entries:", historyEntriesError);
      return NextResponse.json({
        ok: true,
        data: {
          name: user.display_name || user.email.split("@")[0],
          displayName: user.display_name || null,
          overallScore: 0,
          rank: 1,
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
    for (const e of historyEntries || []) {
      if (e.status === "won") wonCount++;
      else lostCount++; // lost OR refunded นับเป็น lost
    }
    const totalSettled = (historyEntries || []).length;
    const winRate = totalSettled > 0 ? Math.round((wonCount / totalSettled) * 100) : 0;

    // ── Batch fetch option labels ──
    const optionIds = [...new Set(
      (historyEntries || []).map((e: any) => e.option_id).filter(Boolean)
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
    const sortedEntries = [...(historyEntries || [])].sort((a: any, b: any) => {
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
    const totalCoinsBet = (historyEntries || []).reduce((acc: number, e: any) => acc + Math.abs(e.amount), 0);
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
        overallScore, // คะแนน Overall (ใช้คำนวณ rank)
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
