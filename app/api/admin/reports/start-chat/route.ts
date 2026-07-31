import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/reports/start-chat
 * Admin initiates a new chat with a user by email.
 * Creates a new report (admin-initiated) and sends the first message.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();
    const { email, message } = body;

    if (!email || !email.trim()) {
      return NextResponse.json({ ok: false, error: "Email is required" }, { status: 400 });
    }

    if (!message || message.trim().length === 0) {
      return NextResponse.json({ ok: false, error: "Message is required" }, { status: 400 });
    }

    if (message.trim().length > 1000) {
      return NextResponse.json({ ok: false, error: "Message too long (max 1000 characters)" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Find user by email
    const { data: targetUser, error: userError } = await supabase
      .from("users")
      .select("id, email")
      .eq("email", email.trim())
      .single();

    if (userError || !targetUser) {
      return NextResponse.json({ ok: false, error: "User not found with that email" }, { status: 404 });
    }

    // Create a new report (admin-initiated)
    const { data: report, error: reportError } = await supabase
      .from("reports")
      .insert({
        user_id: targetUser.id,
        email: targetUser.email,
        message: `[Admin-initiated chat]`,
        status: "pending",
      })
      .select()
      .single();

    if (reportError) {
      throw new Error(reportError.message || "Failed to create report");
    }

    // Send the first message
    const { data: msgData, error: msgError } = await supabase
      .from("report_messages")
      .insert({
        report_id: report.id,
        sender_id: admin.id,
        sender_role: "admin",
        message: message.trim(),
        is_read: false,
      })
      .select()
      .single();

    if (msgError) {
      throw new Error(msgError.message || "Failed to send message");
    }

    return NextResponse.json({
      ok: true,
      data: {
        reportId: report.id,
        messageId: msgData.id,
        userEmail: targetUser.email,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to start chat";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
