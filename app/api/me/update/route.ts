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
      displayName,
    } = body;

    // Validate required fields (only if shipping fields are provided)
    const hasShippingFields = shippingName !== undefined || shippingAddress !== undefined || shippingZipcode !== undefined || shippingPhone !== undefined;
    if (hasShippingFields && (!shippingName || !shippingAddress || !shippingZipcode || !shippingPhone)) {
      return NextResponse.json(
        { ok: false, error: "กรุณากรอกข้อมูลให้ครบทุกช่อง" },
        { status: 400 }
      );
    }

    // Validate display name length
    if (displayName !== undefined && displayName !== null && displayName.length > 8) {
      return NextResponse.json(
        { ok: false, error: "ชื่อเล่นต้องไม่เกิน 8 ตัวอักษร" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (hasShippingFields) {
      const addressCompleted = Boolean(
        shippingName?.trim() &&
        shippingAddress?.trim() &&
        shippingZipcode?.trim() &&
        shippingPhone?.trim()
      );
      updateData.shipping_name = shippingName.trim();
      updateData.shipping_address = shippingAddress.trim();
      updateData.shipping_zipcode = shippingZipcode.trim();
      updateData.shipping_phone = shippingPhone.trim();
      updateData.address_completed = addressCompleted;
    }

    if (displayName !== undefined) {
      updateData.display_name = displayName ? displayName.trim().slice(0, 8) : null;
    }

    const { error } = await supabase
      .from("users")
      .update(updateData)
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
        addressCompleted: hasShippingFields
          ? Boolean(shippingName?.trim() && shippingAddress?.trim() && shippingZipcode?.trim() && shippingPhone?.trim())
          : undefined,
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
