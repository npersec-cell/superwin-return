import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";
import { logAudit } from "@/lib/audit-log";
import { createSafeErrorResponse } from "@/lib/safe-error-handler";

/**
 * DELETE /api/admin/predictions/:id
 * Delete a prediction and all its options/entries.
 * Only allowed for questions created by users (has created_by_user_id).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin(request);
    const { id } = await params;

    const supabase = createSupabaseAdminClient();

    // Get prediction info first
    const { data: prediction, error: fetchError } = await supabase
      .from("predictions")
      .select("id, question, tournament_name, status, created_by_user_id")
      .eq("id", id)
      .single();

    if (fetchError || !prediction) {
      return NextResponse.json({ ok: false, error: "Prediction not found" }, { status: 404 });
    }

    // Safety: only allow deleting user-created questions via this endpoint
    if (!prediction.created_by_user_id) {
      return NextResponse.json(
        { ok: false, error: "Can only delete user-created questions via this endpoint. Use admin panel for admin questions." },
        { status: 403 }
      );
    }

    // Cannot delete resolved or closed questions with entries
    if (["resolved", "closed"].includes(prediction.status)) {
      const { count } = await supabase
        .from("prediction_entries")
        .select("*", { count: "exact", head: true })
        .eq("prediction_id", id)
        .in("status", ["running", "won", "lost"]);

      if ((count || 0) > 0) {
        return NextResponse.json(
          { ok: false, error: "Cannot delete a question that has been closed/resolved with entries. Please refund first." },
          { status: 400 }
        );
      }
    }

    // Delete entries first
    await supabase.from("prediction_entries").delete().eq("prediction_id", id);

    // Delete options
    await supabase.from("prediction_options").delete().eq("prediction_id", id);

    // Delete prediction
    await supabase.from("predictions").delete().eq("id", id);

    // Audit log
    await logAudit({
      adminId: admin.id,
      action: "delete_user_prediction",
      targetType: "prediction",
      targetId: id,
      metadata: {
        question: prediction.question,
        tournamentName: prediction.tournament_name,
        createdByUserId: prediction.created_by_user_id,
        status: prediction.status,
      },
    });

    return NextResponse.json({ ok: true, deleted: id });
  } catch (error) {
    return createSafeErrorResponse(error);
  }
}
