import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";
import { createSafeErrorResponse } from "@/lib/safe-error-handler";

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

    // ดึง coin_ledger สำหรับคำนวณประวัติการทาย
    const [userRes, ledgerRes] = await Promise.all([
      supabase
        .from("users")
        .select("display_name, email, lifetime_profit")
        .eq("id", userId)
        .single(),
      supabase
        .from("coin_ledger")
        .select("id, type, amount, detail, created_at")
        .eq("user_id", userId)
        .in("type", ["predict", "payout"])
        .order("created_at", { ascending: false })
        .returns<LedgerRow[]>(),
    ]);

    if (userRes.error || !userRes.data) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    if (ledgerRes.error) {
      return NextResponse.json({ ok: false, error: ledgerRes.error.message }, { status: 500 });
    }

    const user = userRes.data;

    // Calculate real-time profit_score
    const { data: calculatedProfitScore, error: profitError } = await supabase
      .rpc('calculate_user_profit_score', { p_user_id: userId });
    
    if (profitError) {
      console.error('[Profile] Error calculating profit_score:', profitError);
    }
    
    const profitScore = calculatedProfitScore ?? 0;

    const allLedgerRows = ledgerRes.data || [];

    // ใช้ ledger ทั้งหมด — ไม่กรองตาม predictions table อีกต่อไป
    const ledgerRows = allLedgerRows;

    const predictRows = ledgerRows.filter((r) => r.type === "predict");
    const payoutRows = ledgerRows.filter((r) => r.type === "payout");

    // ── Match predict↔payout คู่กันด้วย question text + time window ──
    interface SettledPrediction {
      predict: LedgerRow;
      payout: LedgerRow | null;
      isWon: boolean;
    }
    const settledPredictions: SettledPrediction[] = [];

    const usedPayoutIds = new Set<string>();

    // Strategy 1: ลอง match ด้วย question text + time proximity (predict ต้องมาก่อน payout)
    for (const predict of predictRows) {
      const qText = extractQuestion(predict.detail, "Question: ");

      // หา payout ที่ match question เดียวกัน และเกิดหลัง predict และยังไม่ถูกใช้
      const match = payoutRows.find((p) => {
        if (usedPayoutIds.has(p.id)) return false;
        const pq = extractQuestion(p.detail, "Question: ");
        // match ถ้า question ตรงกัน หรือ ถ้าทั้งคู่ไม่มี question text (fallback)
        const textMatch = qText && pq ? qText === pq : (!qText && !pq);
        return textMatch && new Date(p.created_at) >= new Date(predict.created_at);
      });

      if (match) {
        usedPayoutIds.add(match.id);
        settledPredictions.push({
          predict,
          payout: match,
          isWon: match.amount > 0,
        });
      }
      // ถ้าไม่ match payout → ยัง open อยู่ ไม่นับเป็น settled
    }

    const totalSettled = settledPredictions.length;

    // นับ win/loss จาก settled set เดียวกัน — ไม่ cross-set!
    let wonCount = 0;
    let lostCount = 0;
    for (const sp of settledPredictions) {
      if (sp.isWon) wonCount++;
      else lostCount++;
    }

    const winRate = totalSettled > 0 ? Math.round((wonCount / totalSettled) * 100) : 0;

    const totalCoinsBet = settledPredictions.reduce((acc, sp) => acc + Math.abs(sp.predict.amount), 0);
    const totalCoinsWon = settledPredictions
      .filter((sp) => sp.isWon)
      .reduce((acc, sp) => acc + (sp.payout?.amount || 0), 0);
    const avgBetSize = totalSettled > 0 ? Math.round(totalCoinsBet / totalSettled) : 0;

    // สร้างประวัติจาก settled predictions (เรียงใหม่ตาม payout date desc)
    const sortedByDate = [...settledPredictions].sort((a, b) => {
      const dateA = new Date(a.payout?.created_at || a.predict.created_at).getTime();
      const dateB = new Date(b.payout?.created_at || b.predict.created_at).getTime();
      return dateB - dateA; // newest first
    });

    const history = sortedByDate.slice(0, 5).map(({ predict, payout, isWon }) => {
      const tournament = extractQuestion(predict.detail, "Tournament: ");
      const question = extractQuestion(predict.detail, "Question: ");

      const pickSegment = predict.detail?.split(" · ").find((part) => part.startsWith("Pick: "));
      const pickText = pickSegment ? pickSegment.replace("Pick: ", "").trim() : "Unknown";

      return {
        id: predict.id,
        tournament: tournament || "Prediction",
        question,
        pick: pickText,
        amount: Math.abs(predict.amount),
        payout: payout?.amount || 0,
        status: isWon ? "won" : ("lost" as "won" | "lost"),
        date: new Date(payout?.created_at || predict.created_at).toLocaleDateString("en-GB", {
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
        name: user.display_name || user.email.split("@")[0],
        displayName: user.display_name || null,
        profitScore: profitScore,
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
