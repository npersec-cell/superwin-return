import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

export const dynamic = "force-dynamic";

type Claim = {
  id: string;
  month: string;
  rewardName: string;
  winnerName: string;
  winnerEmail: string;
  receiverName: string;
  phone: string;
  address: string;
  note: string;
  status: "pending" | "contacting" | "completed";
  trackingNumber: string;
  createdAt: string;
  completedAt?: string;
};

function toStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Admin request failed";
  if (message === "Unauthorized") return 401;
  if (message === "Forbidden") return 403;
  return 500;
}

export async function GET() {
  try {
    await requireAdmin();
    const supabase = createSupabaseAdminClient();
    
    // ดึงใบเคลมรางวัลทั้งหมดจากฐานข้อมูล Supabase แทนระบบไฟล์
    const { data: dbClaims, error } = await supabase
      .from("winner_claims")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message || "Failed to load claims from database");
    }

    const mappedClaims: Claim[] = (dbClaims || []).map((dbClaim) => ({
      id: dbClaim.id,
      month: dbClaim.month,
      rewardName: dbClaim.reward_name,
      winnerName: dbClaim.winner_name,
      winnerEmail: dbClaim.winner_email,
      receiverName: dbClaim.receiver_name || "",
      phone: dbClaim.phone || "",
      address: dbClaim.address || "",
      note: dbClaim.note || "",
      status: dbClaim.status,
      trackingNumber: dbClaim.tracking_number || "",
      createdAt: dbClaim.created_at,
      completedAt: dbClaim.completed_at
    }));

    return NextResponse.json({ ok: true, data: mappedClaims });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load claims";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    const { id, status, trackingNumber } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing claim ID" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // ดึงค่าปัจจุบันของ Record
    const { data: current, error: selectError } = await supabase
      .from("winner_claims")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (selectError || !current) {
      return NextResponse.json({ ok: false, error: "Claim not found in database" }, { status: 404 });
    }

    const isCompletedNow = status === "completed" && current.status !== "completed";
    const completedAtValue = isCompletedNow ? new Date().toISOString() : current.completed_at;

    // อัปเดตข้อมูลตรงไปยัง Supabase
    const { data: updated, error: updateError } = await supabase
      .from("winner_claims")
      .update({
        status: status !== undefined ? status : current.status,
        tracking_number: trackingNumber !== undefined ? String(trackingNumber).trim() : current.tracking_number,
        completed_at: completedAtValue
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      throw new Error(updateError.message || "Failed to update claim in database");
    }

    const mappedUpdated: Claim = {
      id: updated.id,
      month: updated.month,
      rewardName: updated.reward_name,
      winnerName: updated.winner_name,
      winnerEmail: updated.winner_email,
      receiverName: updated.receiver_name || "",
      phone: updated.phone || "",
      address: updated.address || "",
      note: updated.note || "",
      status: updated.status,
      trackingNumber: updated.tracking_number || "",
      createdAt: updated.created_at,
      completedAt: updated.completed_at
    };

    return NextResponse.json({ ok: true, data: mappedUpdated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update claim";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}
