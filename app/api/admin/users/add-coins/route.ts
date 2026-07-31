import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSafeErrorResponse } from "@/lib/safe-error-handler";

// POST /api/admin/users/add-coins — bulk add coins to users by display_name (admin only)
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const body = await request.json();
    const { recipients, amount, reason } = body;

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json(
        { ok: false, error: "recipients must be a non-empty array of display names" },
        { status: 400 }
      );
    }

    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { ok: false, error: "amount must be a positive number" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    // 1. Find all matching users by display_name
    const { data: users, error: findError } = await supabase
      .from("users")
      .select("id, display_name, email, coin_balance")
      .in("display_name", recipients);

    if (findError) {
      return NextResponse.json(
        { ok: false, error: `Failed to find users: ${findError.message}` },
        { status: 500 }
      );
    }

    if (!users || users.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No matching users found" },
        { status: 404 }
      );
    }

    const notFound = recipients.filter(
      (name) => !users.some((u) => u.display_name === name)
    );

    // 2. Update coin_balance for each user
    const results = [];
    let totalAdded = 0;

    for (const user of users) {
      const newBalance = (Number(user.coin_balance) || 0) + amount;

      const { error: updateError } = await supabase
        .from("users")
        .update({ coin_balance: newBalance })
        .eq("id", user.id);

      if (updateError) {
        results.push({
          display_name: user.display_name,
          success: false,
          error: updateError.message,
        });
        continue;
      }

      // 3. Record in coin_ledger
      const { error: ledgerError } = await supabase.from("coin_ledger").insert({
        user_id: user.id,
        type: "credit",
        amount: amount,
        balance_after: newBalance,
        ref_type: "admin_compensation",
        detail: reason || `Admin compensation: ${amount} coins`,
      });

      if (ledgerError) {
        console.error(`Ledger error for ${user.display_name}:`, ledgerError);
      }

      results.push({
        display_name: user.display_name,
        email: user.email,
        previous_balance: Number(user.coin_balance) || 0,
        added: amount,
        new_balance: newBalance,
        success: true,
      });

      totalAdded += amount;
    }

    return NextResponse.json({
      ok: true,
      data: {
        requested: recipients.length,
        found: users.length,
        not_found: notFound,
        total_added: totalAdded,
        results,
      },
    });
  } catch (error) {
    return createSafeErrorResponse(error);
  }
}
