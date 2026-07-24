import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";
import { createSafeErrorResponse } from "@/lib/safe-error-handler";

/**
 * GET /api/tournaments/active
 * Returns list of non-archived tournaments for user question creation form.
 * Only returns tournament names (no logo/archived info exposed).
 */
export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    // Fetch site settings to get tournaments list
    const { data: settingsRow } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "tournaments")
      .single();

    const allTournaments = (settingsRow?.value as any[]) || [];

    // Filter out archived tournaments
    const activeTournaments = allTournaments
      .map((t) => {
        if (typeof t === "string") return { name: t, archived: false };
        return { name: t.name || "", archived: !!t.archived };
      })
      .filter((t) => !t.archived && t.name.trim())
      .map((t) => t.name);

    return NextResponse.json({
      ok: true,
      data: activeTournaments,
    });
  } catch (error) {
    return createSafeErrorResponse(error);
  }
}
