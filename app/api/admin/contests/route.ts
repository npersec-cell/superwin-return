import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

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
    const { name, description, end_time, prize } = body;

    if (!name || !end_time || !prize) {
      return NextResponse.json({ ok: false, error: "Missing required fields: name, end_time, prize" });
    }

    const { data, error } = await supabase
      .from("contests")
      .insert({
        name,
        description,
        end_time: new Date(end_time),
        prize,
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
