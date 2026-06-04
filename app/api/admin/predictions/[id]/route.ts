import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

type Params = {
  params: { id: string } | Promise<{ id: string }>;
};

type PatchBody = {
  tournamentName?: string;
  question?: string;
  opensAt?: string;
  closesAt?: string;
  feeRate?: number;
  status?: "draft" | "open" | "closed" | "resolved" | "canceled";
  options?: { id: string; label: string }[];
};

function toStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Admin request failed";
  if (message === "Unauthorized") return 401;
  if (message === "Forbidden") return 403;
  return 500;
}

function parseBkkDateTime(localStr: string) {
  if (!localStr) return null;
  if (localStr.includes("Z") || localStr.includes("+")) {
    return new Date(localStr).toISOString();
  }
  return new Date(localStr + "+07:00").toISOString();
}

export async function PATCH(request: NextRequest, context: Params) {
  try {
    await requireAdmin();
    const { id } = await Promise.resolve(context.params);
    const body = (await request.json()) as PatchBody;
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.tournamentName !== undefined) update.tournament_name = String(body.tournamentName).trim();
    if (body.question !== undefined) update.question = String(body.question).trim();
    if (body.opensAt !== undefined && body.opensAt) update.opens_at = parseBkkDateTime(body.opensAt);
    if (body.closesAt !== undefined && body.closesAt) update.closes_at = parseBkkDateTime(body.closesAt);
    if (body.feeRate !== undefined) update.fee_rate = Number(body.feeRate);
    if (body.status !== undefined) update.status = body.status;

    const supabase = createSupabaseAdminClient();
    
    // อัปเดตรายชื่อตัวเลือกคำตอบหากมีการส่งมา
    if (body.options !== undefined && Array.isArray(body.options)) {
      for (const option of body.options) {
        if (option.id && option.label) {
          const { error: optErr } = await supabase
            .from("prediction_options")
            .update({ label: String(option.label).trim() })
            .eq("id", option.id)
            .eq("prediction_id", id);
          if (optErr) throw new Error("Failed to update option: " + optErr.message);
        }
      }
    }

    const { data, error } = await supabase
      .from("predictions")
      .update(update)
      .eq("id", id)
      .select("id, tournament_name, question, status, opens_at, closes_at, fee_rate, created_at, updated_at")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update prediction";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}

export async function DELETE(request: NextRequest, context: Params) {
  try {
    await requireAdmin();
    const { id } = await Promise.resolve(context.params);
    const supabase = createSupabaseAdminClient();

    // 1. ตรวจสอบสถานะก่อนลบ
    const { data: prediction, error: findError } = await supabase
      .from("predictions")
      .select("status")
      .eq("id", id)
      .single();

    if (findError) throw new Error(findError.message);
    if (prediction.status !== "resolved" && prediction.status !== "canceled") {
      throw new Error("ลบได้เฉพาะคำถามที่ทำการสรุปผล (Resolved) หรือยกเลิก (Canceled) แล้วเท่านั้น");
    }

    // 2. ลบตัวเลือกคำตอบ (prediction_options) — entries จะถูก set option_id = null อัตโนมัติ
    //    เพื่อให้ prediction_entries ยังอยู่สำหรับคำนวณ leaderboard
    await supabase
      .from("prediction_options")
      .delete()
      .eq("prediction_id", id);

    // 2.5 ลบ coin_ledger ที่เกี่ยวข้องกับคำถามนี้ (match จาก question ใน detail)
    const { data: predictionData } = await supabase
      .from("predictions")
      .select("question, tournament_name")
      .eq("id", id)
      .single();
    
    if (predictionData) {
      // ลบ coin_ledger ที่ detail มี Question: {question} อยู่
      const { error: ledgerDelError } = await supabase
        .from("coin_ledger")
        .delete()
        .or(
          `detail.ilike.%Question: ${predictionData.question}%,detail.ilike.%Tournament: ${predictionData.tournament_name}%`
        );
      if (ledgerDelError) console.error("Failed to delete ledger:", ledgerDelError.message);
    }

    // 3. ลบตัวคำถาม (predictions)
    const { error: deleteError } = await supabase
      .from("predictions")
      .delete()
      .eq("id", id);

    if (deleteError) throw new Error(deleteError.message);

    return NextResponse.json({ ok: true, data: { id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete prediction";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}
