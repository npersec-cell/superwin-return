import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";

export const dynamic = "force-dynamic";

type LedgerRow = {
  id: string;
  type: string;
  amount: number;
  detail: string | null;
  created_at: string;
};

function extractQuestion(detail: string | null, prefix: string): string {
  if (!detail) return "";
  const start = detail.indexOf(prefix);
  if (start === -1) return "";
  const afterPrefix = detail.slice(start + prefix.length);
  const end = afterPrefix.indexOf(" · ");
  return end === -1 ? afterPrefix.trim() : afterPrefix.slice(0, end).trim();
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ ok: false, error: "userId is required" }, { status: 400 });
    }

    // ดึง coin_ledger แทน prediction_entries (เพราะ entries ถูกลบไปแล้ว)
    const [userRes, ledgerRes] = await Promise.all([
      supabase
        .from("users")
        .select("display_name, email, profit_score")
        .eq("id", userId)
        .single(),
      supabase
        .from("coin_ledger")
        .select("id, type, amount, detail, created_at")
        .eq("user_id", userId)
        .in("type", ["predict", "payout"])
        .order("created_at", { ascending: false })
        .returns<LedgerRow[]>()
    ]);

    if (userRes.error || !userRes.data) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    if (ledgerRes.error) {
      return NextResponse.json({ ok: false, error: ledgerRes.error.message }, { status: 500 });
    }

    const user = userRes.data;
    const ledgerRows = ledgerRes.data || [];

    const predictRows = ledgerRows.filter((r) => r.type === "predict");
    const payoutRows = ledgerRows.filter((r) => r.type === "payout");

    // นับเฉพาะ prediction ที่ถูกสรุปผลแล้ว (มี payout ตรงกัน)
    const settledPredictRows = predictRows.filter((predict) => {
      const question = extractQuestion(predict.detail, "Question: ");
      return payoutRows.some((p) => {
        const payoutQuestion = extractQuestion(p.detail, "Question: ");
        return payoutQuestion === question && new Date(p.created_at) >= new Date(predict.created_at);
      });
    });

    // นับเฉพาะ payout ที่ amount > 0 (ชนะจริงๆ) — ผู้แพ้ก็ได้ payout row แต่ amount = 0
    const totalSettled = settledPredictRows.length;
    const wonCount = payoutRows.filter((r) => r.amount > 0).length;
    const lostCount = totalSettled - wonCount;
    const winRate = totalSettled > 0 ? Math.round((wonCount / totalSettled) * 100) : 0;

    const totalCoinsBet = settledPredictRows.reduce((acc, r) => acc + Math.abs(r.amount), 0);
    const totalCoinsWon = payoutRows.filter((r) => r.amount > 0).reduce((acc, r) => acc + r.amount, 0);
    const avgBetSize = totalSettled > 0 ? Math.round(totalCoinsBet / totalSettled) : 0;

    // สร้างประวัติจาก predict rows โดยหา payout ที่ match ตาม question
    const history = predictRows.slice(0, 5).map((predict) => {
      const tournament = extractQuestion(predict.detail, "Tournament: ");
      const question = extractQuestion(predict.detail, "Question: ");

      // หา payout ที่ question ตรงกัน และเกิดขึ้นหลัง predict
      const payout = payoutRows.find((p) => {
        const payoutQuestion = extractQuestion(p.detail, "Question: ");
        return payoutQuestion === question && new Date(p.created_at) >= new Date(predict.created_at);
      });

      const pickSegment = predict.detail?.split(" · ").find((part) => part.startsWith("Pick: "));
      const pickText = pickSegment ? pickSegment.replace("Pick: ", "").trim() : "Unknown";

      // ชนะจริงๆ ต้องมี payout และ amount > 0
      const isWon = payout && payout.amount > 0;

      return {
        id: predict.id,
        tournament: tournament || "Prediction",
        question,
        pick: pickText,
        amount: Math.abs(predict.amount),
        payout: payout ? payout.amount : 0,
        status: isWon ? "won" : ("lost" as "won" | "lost"),
        date: new Date(payout ? payout.created_at : predict.created_at).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short"
        })
      };
    });

    // คำนวณเหรียญตรา (Badge)
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
        profitScore: user.profit_score || 0,
        allTimeProfit: ledgerRows.reduce((acc, r) => acc + r.amount, 0),
        winRate,
        wonCount,
        lostCount,
        totalSettled,
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
