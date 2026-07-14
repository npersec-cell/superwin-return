import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const supabase = createSupabaseAdminClient();

    const { data: userData, error } = await supabase
      .from("users")
      .select("shipping_name, shipping_address, shipping_zipcode, shipping_phone, address_completed")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error("Error fetching user shipping info:", error);
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        coinBalance: user.coinBalance,
        lifetimeProfit: user.lifetimeProfit,
        lastClaimAt: user.lastClaimAt,
        nextClaimAt: user.nextClaimAt,
        status: user.status,
        avatarUrl: user.avatarUrl,
        addressCompleted: userData?.address_completed ?? user.addressCompleted ?? false,
        shippingName: userData?.shipping_name || null,
        shippingAddress: userData?.shipping_address || null,
        shippingZipcode: userData?.shipping_zipcode || null,
        shippingPhone: userData?.shipping_phone || null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json(
      { ok: false, error: message },
      { status }
    );
  }
}
