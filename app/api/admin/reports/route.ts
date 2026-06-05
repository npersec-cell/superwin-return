import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

export const dynamic = "force-dynamic";

// 1. ดึงรายการแจ้งปัญหาทั้งหมดสำหรับแอดมิน
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const supabase = createSupabaseAdminClient();
    const { data: reports, error } = await supabase
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message || "Failed to fetch reports");
    }

    return NextResponse.json({ ok: true, data: reports });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Load reports failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// 2. ปรับปรุงสถานะหรือลบรายงานการแจ้งปัญหา
export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin(request);

    const body = await request.json();
    const { id, status, delete: shouldDelete } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: "Report ID is required" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    if (shouldDelete) {
      // ลบรายงาน
      const { error: deleteError } = await supabase
        .from("reports")
        .delete()
        .eq("id", id);

      if (deleteError) throw new Error(deleteError.message);
      return NextResponse.json({ ok: true, message: "Report deleted successfully" });
    } else {
      // อัปเดตสถานะ (pending -> resolved)
      const { error: updateError } = await supabase
        .from("reports")
        .update({ status })
        .eq("id", id);

      if (updateError) throw new Error(updateError.message);
      return NextResponse.json({ ok: true, message: "Report status updated" });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Update report failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
