import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/reports/[id]/messages — Fetch messages for a specific report (user can only see their own reports)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    const { id: reportId } = await params;

    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();

    // Verify this report belongs to the user
    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select("id, user_id, email")
      .eq("id", reportId)
      .single();

    if (reportError || !report) {
      return NextResponse.json({ ok: false, error: "Report not found" }, { status: 404 });
    }

    // Allow if user owns the report OR is admin
    const isAdmin = user.role === "admin";
    const isOwner = report.user_id === user.id || report.email === user.email;

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // Fetch messages ordered by creation time
    const { data: messages, error } = await supabase
      .from("report_messages")
      .select("id, sender_id, sender_role, message, is_read, created_at")
      .eq("report_id", reportId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message || "Failed to load messages");
    }

    // Mark unread messages from other party as read
    const unreadIds = (messages || [])
      .filter(m => m.sender_role !== (isAdmin ? "admin" : "user") && !m.is_read)
      .map(m => m.id);

    if (unreadIds.length > 0) {
      await supabase
        .from("report_messages")
        .update({ is_read: true })
        .in("id", unreadIds);
    }

    return NextResponse.json({ ok: true, data: messages || [] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load messages";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// POST /api/reports/[id]/messages — Send a message to a report
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    const { id: reportId } = await params;

    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { message } = body;

    if (!message || message.trim().length === 0) {
      return NextResponse.json({ ok: false, error: "Message is required" }, { status: 400 });
    }

    if (message.trim().length > 1000) {
      return NextResponse.json({ ok: false, error: "Message too long (max 1000 characters)" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Verify report exists
    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select("id, user_id, email")
      .eq("id", reportId)
      .single();

    if (reportError || !report) {
      return NextResponse.json({ ok: false, error: "Report not found" }, { status: 404 });
    }

    const isAdmin = user.role === "admin";
    const isOwner = report.user_id === user.id || report.email === user.email;

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // Insert message
    const { data: inserted, error: insertError } = await supabase
      .from("report_messages")
      .insert({
        report_id: reportId,
        sender_id: user.id,
        sender_role: isAdmin ? "admin" : "user",
        message: message.trim(),
        is_read: false,
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(insertError.message || "Failed to send message");
    }

    // Cleanup old messages
    await supabase.rpc("report_cleanup_old", { p_keep_count: 100 });

    return NextResponse.json({ ok: true, data: inserted });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to send message";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
