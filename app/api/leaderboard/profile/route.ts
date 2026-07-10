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
      .select("display_name, email, lifetime_profit, profit_score, reload_count, created_at")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    // ── ดึงทุก entries ของ user ที่ settle แล้ว (won / lost / refunded) ──
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
          profitScore: user.profit_score || 0,
          allTimeProfit: user.lifetime_profit || 0,
          winRate: 0,
          wonCount: 0,
          lostCount: 0,
          totalSettled: 0,
          history: []
        }
      });
    }

    // ── นับ stats ──
    let wonCount = 0;
    let lostCount = 0;
    let highestSingleWin = 0;
    let predictionCount = (historyEntries || []).length;

    for (const e of historyEntries || []) {
      if (e.status === "won") {
        wonCount++;
        const profit = (e.payout_amount || 0) - e.amount;
        if (profit > highestSingleWin) highestSingleWin = profit;
      } else {
        lostCount++;
      }
    }

    const totalSettled = historyEntries?.length || 0;
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
      return dateB - dateA;
    });

    const history = sortedEntries.slice(0, 5).map((e: any) => {
      const pred = e.predictions || {};
      const pickText = e.option_id ? (optionsMap.get(e.option_id) || "") : "";

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
        net,
        date: new Date(pred.resolved_at || e.created_at).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short"
        })
      };
    });

    return NextResponse.json({
      ok: true,
      data: {
        name: user.display_name || user.email.split("@")[0],
        displayName: user.display_name || null,
        // Basic stats
        profitScore: user.profit_score || 0,
        allTimeProfit: user.lifetime_profit || 0,
        predictionCount,
        highestSingleWin,
        winRate,
        wonCount,
        lostCount,
        totalSettled,
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
