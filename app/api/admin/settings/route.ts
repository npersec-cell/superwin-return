import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

// POST /api/admin/settings — Admin only: update site settings
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const body = await request.json();
    const { key, value } = body;

    if (!key || value === undefined) {
      return NextResponse.json(
        { ok: false, error: "Missing key or value" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("site_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() })
      .select("key, value")
      .single();

    if (error) {
      console.error("Admin settings POST error:", error);
      return NextResponse.json(
        { ok: false, error: "Failed to save settings" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    if (err.message === "Forbidden" || err.message === "Unauthorized") {
      return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
    }
    console.error("Admin settings POST error:", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
