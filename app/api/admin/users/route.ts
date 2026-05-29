import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

function toStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Load admins failed";
  if (message === "Unauthorized") return 401;
  if (message === "Forbidden") return 403;
  return 500;
}

export async function GET() {
  try {
    await requireAdmin();
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("users")
      .select("id, email, display_name, role, created_at")
      .eq("role", "admin")
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      data: (data || []).map((user) => ({
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        createdAt: user.created_at
      }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Load admins failed";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}
