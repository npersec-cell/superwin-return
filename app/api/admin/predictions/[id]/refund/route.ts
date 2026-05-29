import { NextResponse } from "next/server";
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
};

type UserRow = {
  id: string;
  coin_balance: number;
};

function toStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Refund failed";
  if (message === "Unauthorized") return 401;
  if (message === "Forbidden") return 403;
  return 500;
}

export async function POST(_request: Request, context: Params) {
  try {
    await requireAdmin();
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
      .select("id, user_id, amount")
      .eq("prediction_id", id)
      .eq("status", "running")
      .returns<EntryRow[]>();

    if (entriesError) throw new Error(entriesError.message);

    let refundedEntries = 0;
    let totalRefunded = 0;

    for (const entry of entries || []) {
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id, coin_balance")
        .eq("id", entry.user_id)
        .single<UserRow>();

      if (userError || !user) throw new Error(userError?.message || "User not found");

      const balanceAfter = user.coin_balance + entry.amount;

      const { error: userUpdateError } = await supabase
        .from("users")
        .update({ coin_balance: balanceAfter, updated_at: refundedAt })
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
