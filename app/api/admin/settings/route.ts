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

// Default settings returned when DB has no data yet
const DEFAULT_SETTINGS: Record<string, any> = {
  info: {
    content: "ล็อกอิน ➔ กดรับเหรียญฟรีทุก 1 ชั่วโมง ➔ เลือกวิเคราะห์ทีมที่ชอบ ➔ ใส่จำนวนเหรียญแล้วกดยืนยันคำทายผล\n\nแต่ละคำถามมีเวลานับถอยหลังปิดรับทายแยกอิสระ เมื่อปิดทายผลแล้วแอดมินจะทำการสรุปและแจกจ่ายเหรียญรางวัลสุทธิทันที"
  },
  tournaments: [{ name: "Super League", logoUrl: "" }],
  savedQuestions: [
    "Which team will win the championship?",
    "Which team will get the Chicken Dinner?",
    "Who will get the most kills in this match?"
  ],
  savedRounds: [
    "แบ่งกลุ่ม",
    "รอบ 16 ทีม",
    "รอบ 8 ทีม",
    "รอบชิงชนะเลิศ"
  ],
  announcement: "Welcome to SUPERWIN HUB! Claim your free coins every hour and predict live matches to reach the All time Top 10!"
};

// ── GET /api/admin/settings — Admin only: fetch all site settings ──
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const allSettings = await loadAllSettings();

    // Merge with defaults so missing keys (e.g. first-time setup) don't break the UI
    const merged = { ...DEFAULT_SETTINGS, ...allSettings };

    // Merge 'info' — keep DB value if exists, otherwise use default
    if (allSettings.info !== undefined) {
      merged.info = allSettings.info;
    }

    return NextResponse.json({ ok: true, data: merged });
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

    // Use upsert with conflict target to properly handle insert-or-update
    const { data, error } = await supabase
      .from("site_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" })
      .select("key, value")
      .maybeSingle();

    if (error) {
      console.error("Admin settings POST error:", JSON.stringify(error));
      return NextResponse.json(
        { ok: false, error: "Failed to save settings", details: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { ok: false, error: "No data returned from upsert" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    if (err.message === "Forbidden" || err.message === "Unauthorized") {
      return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
    }
    console.error("Admin settings POST error:", JSON.stringify(err));
    return NextResponse.json({ ok: false, error: "Internal server error", details: err.message }, { status: 500 });
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
      .upsert(upsertRows, { onConflict: "key" })
      .select("key, value");

    if (error) {
      console.error("Admin settings PATCH error:", JSON.stringify(error));
      return NextResponse.json(
        { ok: false, error: "Failed to save settings", details: error.message },
        { status: 500 }
      );
    }

    // Re-assemble full settings object to return, merged with defaults
    const rawSettings = await loadAllSettings();
    const merged = { ...DEFAULT_SETTINGS, ...rawSettings };
    if (rawSettings.info !== undefined) {
      merged.info = rawSettings.info;
    }
    return NextResponse.json({ ok: true, data: merged });
  } catch (err: any) {
    if (err.message === "Forbidden" || err.message === "Unauthorized") {
      return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
    }
    console.error("Admin settings PATCH error:", JSON.stringify(err));
    return NextResponse.json({ ok: false, error: "Internal server error", details: err.message }, { status: 500 });
  }
}
