import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const authUser = await requireUser(request);
    const userId = authUser.id;

    const body = await request.json();
    const {
      shippingName,
      shippingAddress,
      shippingZipcode,
      shippingPhone,
    } = body;

    // Validate required fields
    if (!shippingName || !shippingAddress || !shippingZipcode || !shippingPhone) {
      return NextResponse.json(
        { ok: false, error: "กรุณากรอกข้อมูลให้ครบทุกช่อง" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    // Determine if address is fully completed
    const addressCompleted = Boolean(
      shippingName.trim() &&
      shippingAddress.trim() &&
      shippingZipcode.trim() &&
      shippingPhone.trim()
    );

    const { error } = await supabase
      .from("users")
      .update({
        shipping_name: shippingName.trim(),
        shipping_address: shippingAddress.trim(),
        shipping_zipcode: shippingZipcode.trim(),
        shipping_phone: shippingPhone.trim(),
        address_completed: addressCompleted,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) {
      console.error("Error updating user profile:", error);
      return NextResponse.json(
        { ok: false, error: "ไม่สามารถบันทึกข้อมูลได้" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "บันทึกข้อมูลสำเร็จ",
      data: {
        addressCompleted,
      },
    });
  } catch (error) {
    console.error("Error in me/update:", error);
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json(
      { ok: false, error: message },
      { status }
    );
  }
}
