import { createSupabaseAdminClient } from "@/lib/db";

export type AuditAction =
  | "resolve_prediction"
  | "refund_prediction"
  | "create_prediction"
  | "update_prediction"
  | "cancel_prediction"
  | "make_admin"
  | "remove_admin"
  | "refresh_leaderboard_cache"
  | "cleanup_rate_limits"
  | "cleanup_cache";

export type AuditTargetType = "prediction" | "user" | "system" | "leaderboard";

interface LogAuditParams {
  adminId: string;
  action: AuditAction;
  targetType?: AuditTargetType;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * บันทึก Audit Log เข้า Supabase
 * ใช้ใน Admin API routes หลังจากกระทำสำเร็จแล้ว
 */
export async function logAudit({
  adminId,
  action,
  targetType,
  targetId,
  metadata = {},
}: LogAuditParams): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient();

    await supabase.from("audit_logs").insert({
      admin_id: adminId,
      action,
      target_type: targetType || null,
      target_id: targetId || null,
      metadata,
    });
  } catch (error) {
    // Log error but don't throw - audit log failure shouldn't break main flow
    console.error("[Audit Log] Failed to write:", error);
  }
}
