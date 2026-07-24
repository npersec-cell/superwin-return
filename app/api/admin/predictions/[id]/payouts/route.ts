import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

type Params = {
  params: { id: string } | Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: Params) {
  try {
    const admin = await requireAdmin(request);
    const { id } = await Promise.resolve(context.params);
    const predictionId = id;

    const supabase = createSupabaseAdminClient();

    // 1. Get prediction info (pool, fee_rate, winning_option)
    const { data: pred, error: predErr } = await supabase
      .from("predictions")
      .select("id, question, tournament_name, status, fee_rate, winning_option_id, closes_at, resolved_at, sponsor_pool")
      .eq("id", predictionId)
      .single();

    if (predErr || !pred) {
      return NextResponse.json({ ok: false, error: "Prediction not found" }, { status: 404 });
    }

    // 2. Get all entries for this prediction with user + option data
    const [entriesRes, optionsRes] = await Promise.all([
      supabase
        .from("prediction_entries")
        .select("id, user_id, option_id, amount, status, payout_amount, insurance, insurance_cost, created_at")
        .eq("prediction_id", predictionId),
      supabase
        .from("prediction_options")
        .select("id, label")
        .eq("prediction_id", predictionId)
        .order("sort_order"),
    ]);

    if (entriesRes.error) {
      return NextResponse.json({ ok: false, error: entriesRes.error.message }, { status: 500 });
    }

    // Build option label map
    const optMap = new Map<string, string>();
    if (optionsRes.data) {
      for (const o of optionsRes.data) {
        optMap.set(o.id, o.label);
      }
    }

    // 3. Get all unique user_ids and fetch their names
    const userIds = [...new Set((entriesRes.data || []).map(e => e.user_id))];
    let userNames: Map<string, string> = new Map();

    if (userIds.length > 0) {
      const usersRes = await supabase
        .from("users")
        .select("id, display_name, email")
        .in("id", userIds);

      if (usersRes.data) {
        for (const u of usersRes.data) {
          userNames.set(u.id, u.display_name || u.email.split("@")[0]);
        }
      }
    }

    // 4. Calculate totals & build participant list
    const entries = entriesRes.data || [];
    const sponsorPool = Number(pred.sponsor_pool || 0);
    let userPool = 0;
    let totalDistributed = 0;
    let totalInsuranceRefunded = 0;
    let winnersCount = 0;
    let losersCount = 0;

    const participants = entries.map(e => {
      userPool += e.amount;
      const isWon = e.status === "won";
      const payout = e.payout_amount || 0;
      // Calculate insurance_refund dynamically (matches resolve function logic)
      const insuranceRefund = e.insurance ? Math.floor(e.amount * 0.5) : 0;
      const isLostWithInsurance = e.status === "lost" && e.insurance && insuranceRefund > 0;

      if (isWon) {
        totalDistributed += payout;
        winnersCount++;
      } else {
        losersCount++;
        if (isLostWithInsurance) {
          totalDistributed += insuranceRefund; // Use actual refund amount
          totalInsuranceRefunded += insuranceRefund;
        }
      }

      return {
        userId: e.user_id,
        userName: userNames.get(e.user_id) || "Unknown",
        optionId: e.option_id,
        optionLabel: optMap.get(e.option_id || "") || "-",
        betAmount: e.amount,
        status: e.status,
        payoutAmount: payout,
        insuranceCost: e.insurance_cost || 0,
        insuranceRefund: insuranceRefund,  // Add actual refund amount
        hasInsurance: !!e.insurance,
        createdAt: e.created_at,
      };
    });

    // Fee calculation — รวมกระสุมส้มในพูลทัง้หมด
    const totalPool = userPool + sponsorPool;
    const feeRate = pred.fee_rate ?? 0.03;
    const distributablePool = Math.floor(totalPool * (1 - feeRate));
    const feeTaken = totalPool - distributablePool;
    // Note: actual distributed may differ slightly due to FLOOR rounding per-entry

    // Verification check
    const verificationOk = Math.abs(totalDistributed - distributablePool) <= entries.length; 
    // Allow small rounding difference (max 1 coin per entry due to FLOOR)

    return NextResponse.json(
      {
        ok: true,
        data: {
          prediction: {
            id: pred.id,
            question: pred.question,
            tournamentName: pred.tournament_name,
            status: pred.status,
            feeRate: feeRate,
            winningOptionId: pred.winning_option_id,
            winningOptionLabel: pred.winning_option_id ? optMap.get(pred.winning_option_id) : null,
            closedAt: pred.closes_at,
            resolvedAt: pred.resolved_at,
            sponsorPool,
          },
          summary: {
            totalPool,
            userPool,
            sponsorPool,
            feeRate,
            feeTaken,
            distributablePool,
            totalDistributed,
            totalInsuranceRefunded,
            winnersCount,
            losersCount,
            entryCount: entries.length,
            verificationOk,
            roundingDifference: totalDistributed - distributablePool,
          },
          participants,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load payouts";
    console.error("[Payouts]", error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
