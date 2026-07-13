import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";

export const dynamic = "force-dynamic";

type JoinedEntry = {
  id: string;
  amount: number;
  payout_amount: number;
  status: "won" | "lost";
  created_at: string;
  prediction_id: string;
  option_id: string;
  predictions: {
    tournament_name: string;
    question: string;
  } | null;
  prediction_options: {
    label: string;
  } | null;
};

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ ok: false, error: "userId is required" }, { status: 400 });
    }

    // ทำงานแบบขนาน (Parallel) เพื่อลดละเวลาการโหลดเหลือเพียงรอบเดียว (300% Speed Up)
    const [userRes, entriesRes] = await Promise.all([
      supabase
        .from("users")
        .select("display_name, email, monthly_profit")
        .eq("id", userId)
        .single(),
      supabase
        .from("prediction_entries")
        .select(`
          id,
          amount,
          payout_amount,
          status,
          created_at,
          prediction_id,
          option_id,
          predictions (
            tournament_name,
            question
          ),
          prediction_options (
            label
          )
        `)
        .eq("user_id", userId)
        .in("status", ["won", "lost"])
        .order("created_at", { ascending: false })
        .returns<JoinedEntry[]>()
    ]);

    if (userRes.error || !userRes.data) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    if (entriesRes.error) {
      return NextResponse.json({ ok: false, error: entriesRes.error.message }, { status: 500 });
    }

    const user = userRes.data;
    const settledEntries = entriesRes.data || [];
    const totalSettled = settledEntries.length;
    const wonCount = settledEntries.filter((e) => e.status === "won").length;
    const winRate = totalSettled > 0 ? Math.round((wonCount / totalSettled) * 100) : 0;

    const totalCoinsWon = settledEntries.reduce((acc, e) => acc + (e.payout_amount || 0), 0);
    const totalCoinsBet = settledEntries.reduce((acc, e) => acc + (e.amount || 0), 0);
    const avgBetSize = totalSettled > 0 ? Math.round(totalCoinsBet / totalSettled) : 0;

    // ประมวลผลประวัติการทำนาย 5 รายการล่าสุดจากผลลัพธ์ของ SQL Join ทันที โดยไม่ต้อง Query ซ้ำซ้อน
    const last5 = settledEntries.slice(0, 5);
    const history = last5.map((e) => {
      return {
        id: e.id,
        tournament: e.predictions?.tournament_name || "Unknown Tournament",
        question: e.predictions?.question || "Unknown Question",
        pick: e.prediction_options?.label || "Unknown Pick",
        amount: e.amount,
        payout: e.payout_amount,
        status: e.status, // "won" | "lost"
        date: new Date(e.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
      };
    });

    // 4. คำนวณเหรียญตรา (Badge) พิเศษตามระดับความเทพ
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
        name: user.email.split("@")[0],
        monthlyProfit: user.monthly_profit || 0,
        winRate,
        wonCount,
        lostCount: totalSettled - wonCount,
        totalSettled,
        totalCoinsBet,
        totalCoinsWon,
        badge,
        badgeDesc,
        history
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Load profile failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
