import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";

export const dynamic = "force-dynamic";

type PredictionRow = {
  id: string;
  tournament_name: string;
  question: string;
};

type OptionRow = {
  id: string;
  label: string;
};

type EntryRow = {
  id: string;
  prediction_id: string;
  option_id: string;
  amount: number;
  payout_amount: number;
  status: "won" | "lost";
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ ok: false, error: "userId is required" }, { status: 400 });
    }

    // 1. ดึงข้อมูลส่วนตัวผู้เล่น
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("display_name, email, monthly_profit")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    // 2. ดึงข้อมูลรายการทายผลที่สรุปผลแล้ว (won หรือ lost)
    const { data: entries, error: entriesError } = await supabase
      .from("prediction_entries")
      .select("id, prediction_id, option_id, amount, payout_amount, status, created_at")
      .eq("user_id", userId)
      .in("status", ["won", "lost"])
      .order("created_at", { ascending: false })
      .returns<EntryRow[]>();

    if (entriesError) {
      return NextResponse.json({ ok: false, error: entriesError.message }, { status: 500 });
    }

    const settledEntries = entries || [];
    const totalSettled = settledEntries.length;
    const wonCount = settledEntries.filter((e) => e.status === "won").length;
    const winRate = totalSettled > 0 ? Math.round((wonCount / totalSettled) * 100) : 0;

    const totalCoinsWon = settledEntries.reduce((acc, e) => acc + (e.payout_amount || 0), 0);
    const totalCoinsBet = settledEntries.reduce((acc, e) => acc + (e.amount || 0), 0);
    const avgBetSize = totalSettled > 0 ? Math.round(totalCoinsBet / totalSettled) : 0;

    // 3. ดึงชื่อคำถามและตัวเลือกสำหรับ 5 แมตช์ล่าสุด
    const last5 = settledEntries.slice(0, 5);
    const predictionIds = last5.map((e) => e.prediction_id);
    const optionIds = last5.map((e) => e.option_id);

    // ดึงข้อมูลคำถาม
    const { data: predictions } = predictionIds.length
      ? await supabase
          .from("predictions")
          .select("id, tournament_name, question")
          .in("id", predictionIds)
          .returns<PredictionRow[]>()
      : { data: [] };

    // ดึงข้อมูลคำตอบ
    const { data: options } = optionIds.length
      ? await supabase
          .from("prediction_options")
          .select("id, label")
          .in("id", optionIds)
          .returns<OptionRow[]>()
      : { data: [] };

    const predictionsMap = (predictions || []).reduce<Record<string, PredictionRow>>((acc, p) => {
      acc[p.id] = p;
      return acc;
    }, {});

    const optionsMap = (options || []).reduce<Record<string, OptionRow>>((acc, o) => {
      acc[o.id] = o;
      return acc;
    }, {});

    const history = last5.map((e) => {
      const pred = predictionsMap[e.prediction_id];
      const opt = optionsMap[e.option_id];
      return {
        id: e.id,
        tournament: pred?.tournament_name || "Unknown Tournament",
        question: pred?.question || "Unknown Question",
        pick: opt?.label || "Unknown Pick",
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
        seasonProfit: user.monthly_profit || 0,
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
