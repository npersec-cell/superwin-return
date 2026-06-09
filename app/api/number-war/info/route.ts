import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: Public - get info content
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("number_war_info")
      .select("id, title, content, updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      // If no row exists, return default
      if (error.code === "PGRST116") {
        return NextResponse.json({
          ok: true,
          data: {
            id: null,
            title: "วิธีเล่น Number War",
            content: "ยังไม่มีข้อมูล กรุณาติดต่อแอดมิน",
            updated_at: null,
          },
        });
      }
      throw error;
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("Error loading number war info:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load info" },
      { status: 500 }
    );
  }
}

// POST: Admin - update info content
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin(request);

    const body = await request.json();
    const { title, content } = body;

    if (!content || !content.trim()) {
      return NextResponse.json(
        { ok: false, error: "กรุณากรอกเนื้อหา" },
        { status: 400 }
      );
    }

    // Check if row exists
    const { data: existing } = await supabase
      .from("number_war_info")
      .select("id")
      .limit(1)
      .single();

    let result;
    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from("number_war_info")
        .update({
          title: title?.trim() || "วิธีเล่น Number War",
          content: content.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Insert new
      const { data, error } = await supabase
        .from("number_war_info")
        .insert({
          title: title?.trim() || "วิธีเล่น Number War",
          content: content.trim(),
        })
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      admin_id: user.id,
      action: "update_number_war_info",
      target_type: "number_war_info",
      target_id: result.id,
      metadata: { title: result.title },
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    console.error("Error updating number war info:", error);
    const message = error instanceof Error ? error.message : "Failed to update info";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
