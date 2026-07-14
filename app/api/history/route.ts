import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";
import { createSafeErrorResponse } from "@/lib/safe-error-handler";

type LedgerRow = {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  detail: string | null;
  ref_type: string | null;
  ref_id: string | null;
  created_at: string;
};

type EntryRow = {
  id: string;
  prediction_id: string;
  option_id: string;
  amount: number;
};

type PredictionRow = {
  id: string;
  tournament_name: string;
  question: string;
};

type OptionRow = {
  id: string;
  label: string;
};

function formatAction(type: string) {
  if (type === "claim") return "Reload";
  if (type === "predict") return "Predict";
  if (type === "payout") return "Payout";
  if (type === "refund") return "Refund";
  return "Adjustment";
}

function formatDate(value: string) {
  const date = new Date(value);
  return date.toLocaleDateString("en-US", { 
    month: "short", 
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Bangkok" 
  });
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const supabase = createSupabaseAdminClient();

    // Get ledger entries
    const { data: ledgerData, error } = await supabase
      .from("coin_ledger")
      .select("id, type, amount, balance_after, detail, ref_type, ref_id, created_at, tournament_name, question, answer")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      throw new Error(error.message || "Failed to load history");
    }

    // Get all prediction entries for this user
    const { data: userEntries } = await supabase
      .from("prediction_entries")
      .select("id, prediction_id, option_id, amount, status")
      .eq("user_id", user.id);

    // Create map of entries by id
    const entryMap = new Map<string, EntryRow>();
    const entryIds = new Set<string>();
    for (const entry of userEntries || []) {
      entryMap.set(entry.id, {
        id: entry.id,
        prediction_id: entry.prediction_id,
        option_id: entry.option_id,
        amount: entry.amount
      });
      entryIds.add(entry.prediction_id);
    }

    // Get predictions for these entries
    const { data: predictions } = await supabase
      .from("predictions")
      .select("id, tournament_name, question")
      .in("id", Array.from(entryIds));

    const predictionMap = new Map<string, PredictionRow>();
    const predictionOptionIds = new Set<string>();
    for (const pred of predictions || []) {
      predictionMap.set(pred.id, {
        id: pred.id,
        tournament_name: pred.tournament_name,
        question: pred.question
      });
      // Find entry for this prediction and get option_id
      for (const entry of userEntries || []) {
        if (entry.prediction_id === pred.id) {
          predictionOptionIds.add(entry.option_id);
        }
      }
    }

    // Get options for these predictions
    const { data: options } = await supabase
      .from("prediction_options")
      .select("id, label")
      .in("id", Array.from(predictionOptionIds));

    const optionMap = new Map<string, OptionRow>();
    for (const opt of options || []) {
      optionMap.set(opt.id, {
        id: opt.id,
        label: opt.label
      });
    }

    // Build the response
    const rows = (ledgerData || []).map((row) => {
      let detail = row.detail || "";
      
      // Use new columns if available
      if (row.tournament_name && row.question && row.answer) {
        detail = `Tournament: ${row.tournament_name} · Question: ${row.question} · Answer: ${row.answer}`;
      } else if (row.ref_type === "prediction_entry" && row.ref_id) {
        // Legacy: find entry by ref_id
        const entry = entryMap.get(row.ref_id);
        if (entry) {
          const prediction = predictionMap.get(entry.prediction_id);
          const option = optionMap.get(entry.option_id);
          
          if (prediction && option) {
            detail = `Tournament: ${prediction.tournament_name} · Question: ${prediction.question} · Answer: ${option.label}`;
          }
        }
      } else if (row.ref_type === "prediction" && row.ref_id) {
        // Legacy: find prediction by ref_id
        const prediction = predictionMap.get(row.ref_id);
        if (prediction) {
          detail = `Tournament: ${prediction.tournament_name} · Question: ${prediction.question} · Answer: Unknown`;
        }
      }
      
      return {
        id: row.id,
        date: formatDate(row.created_at),
        action: formatAction(row.type),
        detail,
        amount: row.amount,
        balanceAfter: row.balance_after
      };
    });

    return NextResponse.json({
      ok: true,
      data: { rows }
    });
  } catch (error) {
    return createSafeErrorResponse(error);
  }
}
