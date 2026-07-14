import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const supabase = createSupabaseAdminClient();

    const { id } = await params;

    const { data: contest, error } = await supabase
      .from("contests")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching contest:", error);
      return NextResponse.json({ ok: false, error: "Contest not found" });
    }

    return NextResponse.json({ ok: true, data: contest });
  } catch (e: any) {
    const message = e?.message || "Server error";
    const status = message === "Unauthorized" || message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const supabase = createSupabaseAdminClient();

    const { id } = await params;
    const body = await request.json();

    // Determine update fields
    const updateFields: any = {};
    
    if (body.status) updateFields.status = body.status;
    if (body.name !== undefined) updateFields.name = body.name;
    if (body.description !== undefined) updateFields.description = body.description;
    if (body.end_time !== undefined) updateFields.end_time = new Date(body.end_time);
    if (body.prize !== undefined) updateFields.prize = body.prize;
    if (body.winner_user_id !== undefined) updateFields.winner_user_id = body.winner_user_id;

    const { data, error } = await supabase
      .from("contests")
      .update(updateFields)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating contest:", error);
      return NextResponse.json({ ok: false, error: "Failed to update contest" });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    const message = e?.message || "Server error";
    const status = message === "Unauthorized" || message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const supabase = createSupabaseAdminClient();

    const { id } = await params;

    const { error } = await supabase
      .from("contests")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting contest:", error);
      return NextResponse.json({ ok: false, error: "Failed to delete contest" });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const message = e?.message || "Server error";
    const status = message === "Unauthorized" || message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
