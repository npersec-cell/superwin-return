import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    // Initialize slots if they don't exist
    const { data: existingSlots, error: countError } = await supabase
      .from("number_slots")
      .select("id")
      .limit(1);

    if (countError) throw countError;

    // If no slots exist, create them (0-200)
    if (!existingSlots || existingSlots.length === 0) {
      const slots = Array.from({ length: 201 }, (_, i) => ({
        slot_number: i,
        current_price: 10,
        total_takeovers: 0,
      }));

      const { error: insertError } = await supabase
        .from("number_slots")
        .insert(slots);

      if (insertError) throw insertError;
    }

    // Fetch all slots with owner info
    const { data: slots, error } = await supabase
      .from("number_slots")
      .select(`
        *,
        owner:owner_id (id, display_name, email)
      `)
      .order("slot_number", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ ok: true, data: slots });
  } catch (error) {
    console.error("Error fetching number slots:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch slots" },
      { status: 500 }
    );
  }
}
