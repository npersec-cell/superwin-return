import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

export const dynamic = "force-dynamic";

// 1. Fetch all reports for admin (with unread message count)
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

    // Get unread message counts per report (messages from users that admin hasn't read)
    const reportIds = reports?.map(r => r.id) || [];
    let unreadCounts: Record<string, number> = {};
    
    if (reportIds.length > 0) {
      const { data: msgCounts } = await supabase
        .from("report_messages")
        .select("report_id, is_read")
        .in("report_id", reportIds)
        .eq("sender_role", "user")
        .eq("is_read", false);
      
      unreadCounts = {};
      for (const m of (msgCounts || [])) {
        unreadCounts[m.report_id] = (unreadCounts[m.report_id] || 0) + 1;
      }
    }

    const reportsWithCount = (reports || []).map(r => ({
      ...r,
      unread_count: unreadCounts[r.id] || 0,
    }));

    return NextResponse.json({ ok: true, data: reportsWithCount });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Load reports failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// 2. Update status or delete a report
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
      // Delete report
      const { error: deleteError } = await supabase
        .from("reports")
        .delete()
        .eq("id", id);

      if (deleteError) throw new Error(deleteError.message);
      return NextResponse.json({ ok: true, message: "Report deleted successfully" });
    } else {
      // Update status (pending -> resolved)
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
