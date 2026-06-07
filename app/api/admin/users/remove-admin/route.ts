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
    const currentAdmin = await requireAdmin(request);

    // Validate request body with Zod
    const validation = await validateRequest(request, adminUserRoleSchema);
    if (!validation.success) {
      return validation.response;
    }

    const body = validation.data;
    const email = body.email.toLowerCase().trim();

    if (email === currentAdmin.email.toLowerCase()) {
      return NextResponse.json({ ok: false, error: "Cannot remove your own admin role" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: admins, error: countError } = await supabase
      .from("users")
      .select("id")
      .eq("role", "admin");

    if (countError) throw new Error(countError.message);

    if ((admins || []).length <= 1) {
      return NextResponse.json({ ok: false, error: "At least one admin is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("users")
      .update({ role: "user", updated_at: new Date().toISOString() })
      .eq("email", email)
      .eq("role", "admin")
      .select("id, email, role")
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: "Admin email not found" }, { status: 404 });
    }

    // Audit Log: Record this admin action
    await logAudit({
      adminId: currentAdmin.id,
      action: "remove_admin",
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
