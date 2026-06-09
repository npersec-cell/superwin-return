import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getRoundStatus(round: { open_at: string | null; close_at: string | null; winner_slot: number | null }): "upcoming" | "open" | "closed" | "resolved" {
  const now = Date.now();
  const open = round.open_at ? new Date(round.open_at).getTime() : null;
  const close = round.close_at ? new Date(round.close_at).getTime() : null;

  if (round.winner_slot !== null && round.winner_slot !== undefined) return "resolved";
  if (open && now < open) return "upcoming";
  if (close && now > close) return "closed";
  if (open && close && now >= open && now <= close) return "open";
  return "closed";
}

// GET: Public - list all rounds
export async function GET() {
  try {
    const { data: rounds, error } = await supabase
      .from("number_war_rounds")
      .select("id, name, open_at, close_at, winner_slot, status, created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const enriched = (rounds || []).map((r) => ({
      ...r,
      computedStatus: getRoundStatus(r),
    }));

    return NextResponse.json({ ok: true, data: enriched });
  } catch (error) {
    console.error("Error loading rounds:", error);
    return NextResponse.json({ ok: false, error: "Failed to load rounds" }, { status: 500 });
  }
}

// POST: Admin - create new round + 201 slots
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin(request);

    const body = await request.json();
    const { name, openAt, closeAt } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ ok: false, error: "กรุณากรอกชื่อรายการแข่งขัน" }, { status: 400 });
    }

    if (!openAt || !closeAt) {
      return NextResponse.json({ ok: false, error: "กรุณากรอกวันเปิดและวันปิด" }, { status: 400 });
    }

    const openDate = new Date(openAt);
    const closeDate = new Date(closeAt);

    if (closeDate.getTime() <= openDate.getTime()) {
      return NextResponse.json({ ok: false, error: "วันปิดต้องหลังวันเปิด" }, { status: 400 });
    }

    // Create round
    const { data: round, error: roundError } = await supabase
      .from("number_war_rounds")
      .insert({
        name: name.trim(),
        open_at: openDate.toISOString(),
        close_at: closeDate.toISOString(),
        status: "upcoming",
      })
      .select()
      .single();

    if (roundError || !round) {
      return NextResponse.json({ ok: false, error: roundError?.message || "Failed to create round" }, { status: 500 });
    }

    // Create 201 slots (0-200) for this round
    const slotRows = Array.from({ length: 201 }, (_, i) => ({
      slot_number: i,
      round_id: round.id,
      current_price: 10,
      total_takeovers: 0,
    }));

    const { error: slotsError } = await supabase.from("number_slots").insert(slotRows);
    if (slotsError) {
      // Rollback: delete the round if slots failed
      await supabase.from("number_war_rounds").delete().eq("id", round.id);
      return NextResponse.json({ ok: false, error: "Failed to create slots: " + slotsError.message }, { status: 500 });
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      admin_id: user.id,
      action: "create_number_war_round",
      target_type: "number_war_round",
      target_id: round.id,
      metadata: { name: name.trim(), open_at: openDate.toISOString(), close_at: closeDate.toISOString() },
    });

    return NextResponse.json({ ok: true, data: round });
  } catch (error) {
    console.error("Error creating round:", error);
    return NextResponse.json({ ok: false, error: "Failed to create round" }, { status: 500 });
  }
}
