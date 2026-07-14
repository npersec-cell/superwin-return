import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSafeErrorResponse } from "@/lib/safe-error-handler";

// GET /api/admin/users — list all users (admin only)
export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin(request);

    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("users")
      .select("id, display_name, email, role, coin_balance, created_at, last_claim_at, shipping_name, shipping_address, shipping_zipcode, shipping_phone")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const users = (data || []).map((u) => ({
      id: u.id,
      name: u.display_name,
      email: u.email,
      isAdmin: u.role === "admin",
      coinBalance: u.coin_balance,
      createdAt: u.created_at,
      lastClaimAt: u.last_claim_at,
      shippingName: u.shipping_name,
      shippingAddress: u.shipping_address,
      shippingZipcode: u.shipping_zipcode,
      shippingPhone: u.shipping_phone,
    }));

    return NextResponse.json({ ok: true, data: users });
  } catch (error) {
    return createSafeErrorResponse(error);
  }
}
