import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

type Params = {
  params: { id: string } | Promise<{ id: string }>;
};

type PredictionRow = {
  id: string;
  tournament_name: string;
  question: string;
  status: string;
};

type EntryRow = {
  id: string;
  user_id: string;
  amount: number;
  insurance: boolean;
  insurance_cost: number;
};

type UserRow = {
  id: string;
  coin_balance: number;
  profit_score: number | null;
  lifetime_profit: number | null;
};

function toStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Refund failed";
  if (message === "Unauthorized") return 401;
  if (message === "Forbidden") return 403;
  return 500;
}

export async function POST(request: NextRequest, context: Params) {
  try {
    await requireAdmin(request);
    const { id } = await Promise.resolve(context.params);
    const supabase = createSupabaseAdminClient();
    const refundedAt = new Date().toISOString();

    const { data: prediction, error: predictionError } = await supabase
      .from("predictions")
      .select("id, tournament_name, question, status")
      .eq("id", id)
      .single<PredictionRow>();

    if (predictionError || !prediction) {
      return NextResponse.json({ ok: false, error: "Prediction not found" }, { status: 404 });
    }

    if (prediction.status === "resolved") {
      return NextResponse.json({ ok: false, error: "Resolved prediction cannot be refunded" }, { status: 400 });
    }

    const { data: entries, error: entriesError } = await supabase
      .from("prediction_entries")
      .select("id, user_id, amount, insurance, insurance_cost")
      .eq("prediction_id", id)
      .eq("status", "running")
      .returns<EntryRow[]>();

    if (entriesError) throw new Error(entriesError.message);

    let refundedEntries = 0;
    let totalRefunded = 0;

    for (const entry of entries || []) {
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id, coin_balance, profit_score, lifetime_profit")
        .eq("id", entry.user_id)
        .single<UserRow>();

      if (userError || !user) throw new Error(userError?.message || "User not found");

      const balanceAfter = user.coin_balance + entry.amount;
      const profitScoreAfter = (user.profit_score ?? 0) + (entry.insurance ? entry.insurance_cost : 0);
      const lifeAfter = Math.max(0, (user.lifetime_profit ?? 0) + entry.amount);

      const { error: userUpdateError } = await supabase
        .from("users")
        .update({
          coin_balance: balanceAfter,
          profit_score: profitScoreAfter,
          lifetime_profit: lifeAfter,
          updated_at: refundedAt,
        })
        .eq("id", entry.user_id);

      if (userUpdateError) throw new Error(userUpdateError.message);

      const { error: entryUpdateError } = await supabase
        .from("prediction_entries")
        .update({ status: "refunded", payout_amount: entry.amount, resolved_at: refundedAt })
        .eq("id", entry.id);

      if (entryUpdateError) throw new Error(entryUpdateError.message);

      const detail = `Tournament: ${prediction.tournament_name} · Question: ${prediction.question} · Result: Refunded · Refund: ${entry.amount}`;

      const { error: ledgerError } = await supabase
        .from("coin_ledger")
        .insert({
          user_id: entry.user_id,
          type: "refund",
          amount: entry.amount,
          balance_after: balanceAfter,
          ref_type: "prediction_entry",
          ref_id: entry.id,
          detail
        });

      if (ledgerError) throw new Error(ledgerError.message);

      // Refund insurance cost (green ammo) if purchased
      if (entry.insurance && entry.insurance_cost > 0) {
        const insDetail = `Tournament: ${prediction.tournament_name} · Question: ${prediction.question} · Result: Refunded · Insurance Refund: ${entry.insurance_cost} green ammo`;
        // Re-fetch user to get updated profit_score after the refund
        const { data: userAfterIns, error: userAfterInsError } = await supabase
          .from("users")
          .select("profit_score")
          .eq("id", entry.user_id)
          .single();
        if (userAfterInsError) throw new Error(userAfterInsError.message);
        const profitScoreAfterRefund = userAfterIns?.profit_score ?? 0;

        const { error: insLedgerError } = await supabase
          .from("coin_ledger")
          .insert({
            user_id: entry.user_id,
            type: "refund",
            amount: entry.insurance_cost,
            balance_after: profitScoreAfterRefund,
            ref_type: "prediction_entry",
            ref_id: entry.id,
            detail: insDetail,
          });
        if (insLedgerError) throw new Error(insLedgerError.message);
      }

      refundedEntries += 1;
      totalRefunded += entry.amount;
    }

    const { error: predictionUpdateError } = await supabase
      .from("predictions")
      .update({ status: "canceled", canceled_at: refundedAt, updated_at: refundedAt })
      .eq("id", id);

    if (predictionUpdateError) throw new Error(predictionUpdateError.message);

    return NextResponse.json({ ok: true, data: { predictionId: id, refundedEntries, totalRefunded } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refund failed";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}
