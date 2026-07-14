import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

// Convert datetime-local input (YYYY-MM-DDTHH:mm) to ISO string with Bangkok timezone (GMT+7)
function toBangkokISO(datetimeLocal: string): string {
  // datetime-local format: "YYYY-MM-DDTHH:mm"
  // Add ":00" and assume it's already in GMT+7, convert to UTC
  const date = new Date(datetimeLocal + ":00");
  return date.toISOString();
}

export async function GET() {
  try {
    await requireAdmin();
    const supabase = createSupabaseAdminClient();

    const { data: contests, error } = await supabase
      .from("contests")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching contests:", error);
      return NextResponse.json({ ok: false, error: "Failed to fetch contests" });
    }

    return NextResponse.json({ ok: true, data: contests });
  } catch (e: any) {
    const message = e?.message || "Server error";
    const status = message === "Unauthorized" || message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const supabase = createSupabaseAdminClient();

    const body = await request.json();
    const { name, description, end_time, prize_1, prize_2, prize_3, prize_4, prize_5 } = body;

    if (!name || !end_time || !prize_1) {
      return NextResponse.json({ ok: false, error: "Missing required fields: name, end_time, prize_1" });
    }

    const { data, error } = await supabase
      .from("contests")
      .insert({
        name,
        description,
        end_time: toBangkokISO(end_time),
        prize_1,
        prize_2,
        prize_3,
        prize_4,
        prize_5,
        status: "active",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating contest:", error);
      return NextResponse.json({ ok: false, error: "Failed to create contest" });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    const message = e?.message || "Server error";
    const status = message === "Unauthorized" || message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
