import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

type LedgerRow = {
  id: string;
  type: string;
  amount: number;
  detail: string;
  ref_type: string | null;
  ref_id: string | null;
  tournament_name: string | null;
  question: string | null;
  answer: string | null;
  created_at: string;
};

type EntryRow = {
  id: string;
  prediction_id: string;
  option_id: string;
  amount: number;
  status: string;
  created_at: string;
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

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const supabase = createSupabaseAdminClient();

    // Get all coin_ledger entries that have detail = 'Bet placed'
    const { data: ledgerData, error: ledgerError } = await supabase
      .from("coin_ledger")
      .select("*")
      .eq("user_id", user.id)
      .eq("detail", "Bet placed")
      .returns<LedgerRow[]>();

    if (ledgerError) {
      throw new Error(ledgerError.message || "Failed to load ledger entries");
    }

    const ledgerEntries = ledgerData || [];
    
    if (ledgerEntries.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No ledger entries with 'Bet placed' found"
      });
    }

    // Get all prediction_entries for this user
    const { data: userEntries, error: entriesError } = await supabase
      .from("prediction_entries")
      .select("*")
      .eq("user_id", user.id)
      .returns<EntryRow[]>();

    if (entriesError) {
      throw new Error(entriesError.message || "Failed to load prediction entries");
    }

    const entries = userEntries || [];
    
    if (entries.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No prediction entries found"
      });
    }

    // Create map of entries by amount (since we don't have ref_id)
    // Note: coin_ledger.amount is negative, prediction_entries.amount is positive
    const entriesByAmount = new Map<number, EntryRow[]>();
    for (const entry of entries) {
      const amount = entry.amount;
      if (!entriesByAmount.has(amount)) {
        entriesByAmount.set(amount, []);
      }
      entriesByAmount.get(amount)!.push(entry);
    }

    // Get predictions for these entries
    const predictionIds = [...new Set(entries.map(e => e.prediction_id))];
    const { data: predictions, error: predictionsError } = await supabase
      .from("predictions")
      .select("id, tournament_name, question")
      .in("id", predictionIds)
      .returns<PredictionRow[]>();

    if (predictionsError) {
      throw new Error(predictionsError.message || "Failed to load predictions");
    }

    const predictionMap = new Map<string, PredictionRow>();
    for (const pred of predictions || []) {
      predictionMap.set(pred.id, pred);
    }

    // Get options for these entries
    const optionIds = [...new Set(entries.map(e => e.option_id))];
    const { data: options, error: optionsError } = await supabase
      .from("prediction_options")
      .select("id, label")
      .in("id", optionIds)
      .returns<OptionRow[]>();

    if (optionsError) {
      throw new Error(optionsError.message || "Failed to load options");
    }

    const optionMap = new Map<string, OptionRow>();
    for (const opt of options || []) {
      optionMap.set(opt.id, opt);
    }

    // Update coin_ledger entries
    let updatedCount = 0;
    const updates: { id: string; detail: string; tournament_name: string; question: string; answer: string }[] = [];

    for (const ledger of ledgerEntries) {
      const amount = Math.abs(ledger.amount);
      const matchingEntries = entriesByAmount.get(amount) || [];
      
      // Find matching entry by timestamp (within 5 minutes)
      let matchedEntry: EntryRow | null = null;
      for (const entry of matchingEntries) {
        const ledgerTime = new Date(ledger.created_at).getTime();
        const entryTime = new Date(entry.created_at).getTime();
        const diff = Math.abs(ledgerTime - entryTime);
        
        if (diff < 5 * 60 * 1000) { // within 5 minutes
          matchedEntry = entry;
          break;
        }
      }

      if (matchedEntry) {
        const prediction = predictionMap.get(matchedEntry.prediction_id);
        const option = optionMap.get(matchedEntry.option_id);
        
        if (prediction && option) {
          const newDetail = `Tournament: ${prediction.tournament_name} · Question: ${prediction.question} · Answer: ${option.label}`;
          updates.push({
            id: ledger.id,
            detail: newDetail,
            tournament_name: prediction.tournament_name,
            question: prediction.question,
            answer: option.label
          });
          updatedCount++;
        }
      }
    }

    // Update coin_ledger entries
    for (const update of updates) {
      const { error } = await supabase
        .from("coin_ledger")
        .update({
          detail: update.detail,
          tournament_name: update.tournament_name,
          question: update.question,
          answer: update.answer
        })
        .eq("id", update.id);

      if (error) {
        console.error(`Failed to update ledger entry ${update.id}:`, error);
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Updated ${updatedCount} ledger entries`,
      updatedCount
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sync ledger detail";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
