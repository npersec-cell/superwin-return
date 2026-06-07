import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";
import { validateRequest, adminUserRoleSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit-log";

function toStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Admin update failed";
  if (message === "Unauthorized") return 401;
  if (message === "Forbidden") return 403;
  return 500;
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);

    // Validate request body with Zod
    const validation = await validateRequest(request, adminUserRoleSchema);
    if (!validation.success) {
      return validation.response;
    }

    const body = validation.data;
    const email = body.email.toLowerCase().trim();

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("users")
      .update({ role: "admin", updated_at: new Date().toISOString() })
      .eq("email", email)
      .select("id, email, role")
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: "User email not found. User must sign up first." }, { status: 404 });
    }

    // Audit Log: Record this admin action
    await logAudit({
      adminId: admin.id,
      action: "make_admin",
      targetType: "user",
      targetId: data.id,
      metadata: {
        targetEmail: email,
      },
    });

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin update failed";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}
