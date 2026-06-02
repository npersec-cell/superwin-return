import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

type LedgerRow = {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  detail: string | null;
  created_at: string;
};

function formatAction(type: string) {
  if (type === "claim") return "Claim";
  if (type === "predict") return "Predict";
  if (type === "payout") return "Payout";
  if (type === "refund") return "Refund";
  return "Adjustment";
}

function formatDateParts(value: string) {
  const date = new Date(value);
  return {
    month: date.toLocaleString("en-US", { month: "long", year: "numeric" }),
    date: date.toLocaleString("en-GB", { day: "2-digit", month: "short" }),
    time: date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const searchParams = request.nextUrl.searchParams;
    const filter = searchParams.get("filter") || "All";

    const supabase = createSupabaseAdminClient();
    let query = supabase
      .from("coin_ledger")
      .select("id, type, amount, balance_after, detail, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (filter !== "All") {
      query = query.eq("type", filter.toLowerCase());
    }

    const { data, error } = await query.returns<LedgerRow[]>();

    if (error) {
      throw new Error(error.message || "Failed to load history");
    }

    const rows = (data || []).map((row) => {
      const parts = formatDateParts(row.created_at);
      return {
        id: row.id,
        ...parts,
        action: formatAction(row.type),
        detail: row.detail || `${formatAction(row.type)} record`,
        amount: row.amount,
        balanceAfter: row.balance_after
      };
    });

    return NextResponse.json({
      ok: true,
      data: { rows }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load history";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
