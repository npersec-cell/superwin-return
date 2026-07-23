import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

type SiteSettingsRow = {
  key: string;
  value: any;
};

/**
 * Helper: load all site settings and assemble into a single object.
 * Used by GET handler and internally by PATCH after updates.
 */
async function loadAllSettings(): Promise<Record<string, any>> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("site_settings")
    .select("key, value") as { data: SiteSettingsRow[] | null; error: any };

  if (error) {
    console.error("Admin settings load error:", error);
    return {};
  }

  const result: Record<string, any> = {};
  for (const row of data || []) {
    result[row.key] = row.value;
  }
  return result;
}

// ── GET /api/admin/settings — Admin only: fetch all site settings ──
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const allSettings = await loadAllSettings();
    return NextResponse.json({ ok: true, data: allSettings });
  } catch (err: any) {
    if (err.message === "Forbidden" || err.message === "Unauthorized") {
      return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
    }
    console.error("Admin settings GET error:", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}

// ── POST /api/admin/settings — Admin only: update a single setting by key/value ──
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

// ── PATCH /api/admin/settings — Admin only: partial update of multiple keys at once ──
export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin(request);

    const body = await request.json();
    const entries = Object.entries(body);

    if (entries.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No fields to update" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();
    const timestamp = new Date().toISOString();

    // Build upsert payload: each key in body becomes a row { key, value, updated_at }
    const upsertRows = entries.map(([key, value]) => ({
      key,
      value,
      updated_at: timestamp,
    }));

    const { data, error } = await supabase
      .from("site_settings")
      .upsert(upsertRows)
      .select("key, value");

    if (error) {
      console.error("Admin settings PATCH error:", error);
      return NextResponse.json(
        { ok: false, error: "Failed to save settings" },
        { status: 500 }
      );
    }

    // Re-assemble full settings object to return
    const updatedSettings = await loadAllSettings();
    return NextResponse.json({ ok: true, data: updatedSettings });
  } catch (err: any) {
    if (err.message === "Forbidden" || err.message === "Unauthorized") {
      return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
    }
    console.error("Admin settings PATCH error:", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
