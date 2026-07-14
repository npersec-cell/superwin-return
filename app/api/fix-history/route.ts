import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";

export async function POST(request: NextRequest) {
  const supabase = createSupabaseAdminClient();

  // Get all coin_ledger entries with detail = 'Bet placed' that have ref_type = 'prediction_entry'
  const { data: oldLedgerEntries } = await supabase
    .from("coin_ledger")
    .select("id, ref_type, ref_id, amount, created_at")
    .eq("detail", "Bet placed")
    .eq("type", "predict");

  if (!oldLedgerEntries || oldLedgerEntries.length === 0) {
    return NextResponse.json({ 
      ok: true, 
      message: "No old ledger entries found with detail = 'Bet placed'"
    });
  }

  // Get all prediction_entries
  const { data: allEntries } = await supabase
    .from("prediction_entries")
    .select("id, prediction_id, option_id, amount, status, created_at");

  // Create map of entries by id
  const entryMap = new Map<string, {
    prediction_id: string;
    option_id: string;
    amount: number;
    created_at: string;
  }>();

  for (const entry of allEntries || []) {
    entryMap.set(entry.id, {
      prediction_id: entry.prediction_id,
      option_id: entry.option_id,
      amount: entry.amount,
      created_at: entry.created_at
    });
  }

  // Get predictions
  const predictionIds = [...new Set(allEntries?.map(e => e.prediction_id) || [])];
  const { data: predictions } = await supabase
    .from("predictions")
    .select("id, tournament_name, question")
    .in("id", predictionIds);

  const predictionMap = new Map<string, { tournament_name: string; question: string }>();
  for (const pred of predictions || []) {
    predictionMap.set(pred.id, {
      tournament_name: pred.tournament_name,
      question: pred.question
    });
  }

  // Get options
  const optionIds = [...new Set(allEntries?.map(e => e.option_id) || [])];
  const { data: options } = await supabase
    .from("prediction_options")
    .select("id, label")
    .in("id", optionIds);

  const optionMap = new Map<string, string>();
  for (const opt of options || []) {
    optionMap.set(opt.id, opt.label);
  }

  // Update ledger entries
  const updatedCount = 0;
  const notUpdated: string[] = [];

  for (const ledger of oldLedgerEntries) {
    // Try to find matching entry by ref_id
    let matchedEntry = null;
    if (ledger.ref_type === "prediction_entry" && ledger.ref_id) {
      matchedEntry = entryMap.get(ledger.ref_id);
    }

    // If no ref_id, try to find by amount and timestamp (within 5 minutes)
    if (!matchedEntry) {
      const ledgerDate = new Date(ledger.created_at).getTime();
      for (const [entryId, entryData] of entryMap.entries()) {
        const entryDate = new Date(entryData.created_at).getTime();
        const timeDiff = Math.abs(ledgerDate - entryDate);
        if (entryData.amount === Math.abs(ledger.amount) && timeDiff < 5 * 60 * 1000) {
          matchedEntry = entryData;
          break;
        }
      }
    }

    if (matchedEntry) {
      const prediction = predictionMap.get(matchedEntry.prediction_id);
      const option = optionMap.get(matchedEntry.option_id);

      if (prediction && option) {
        const newDetail = `Tournament: ${prediction.tournament_name} · Question: ${prediction.question} · Answer: ${option}`;

        const { error } = await supabase
          .from("coin_ledger")
          .update({ detail: newDetail })
          .eq("id", ledger.id);

        if (error) {
          notUpdated.push(ledger.id);
        }
      }
    } else {
      notUpdated.push(ledger.id);
    }
  }

  return NextResponse.json({
    ok: true,
    message: `Updated ${oldLedgerEntries.length - notUpdated.length} entries, ${notUpdated.length} not updated`,
    notUpdated
  });
}
