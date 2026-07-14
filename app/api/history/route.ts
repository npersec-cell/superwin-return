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
  created_at: string;
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

    const { data, error } = await supabase
      .from("coin_ledger")
      .select("id, type, amount, balance_after, detail, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      throw new Error(error.message || "Failed to load history");
    }

    const rows = (data || []).map((row) => {
      return {
        id: row.id,
        date: formatDate(row.created_at),
        action: formatAction(row.type),
        detail: row.detail || "",
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
