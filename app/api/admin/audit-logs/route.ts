import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";
import { createSafeErrorResponse } from "@/lib/safe-error-handler";

interface AuditLogRow {
  id: string;
  admin_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  users: {
    email: string;
    display_name: string | null;
  } | null;
}

function toStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Admin request failed";
  if (message === "Unauthorized") return 401;
  if (message === "Forbidden") return 403;
  return 500;
}

/**
 * GET /api/admin/audit-logs
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 50, max: 100)
 * - action: string (filter by action)
 * - adminId: string (filter by admin)
 * - startDate: string (ISO date)
 * - endDate: string (ISO date)
 * - search: string (search in metadata)
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const supabase = createSupabaseAdminClient();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));
    const action = searchParams.get("action");
    const adminId = searchParams.get("adminId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const search = searchParams.get("search");

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Build query
    let query = supabase
      .from("audit_logs")
      .select(`
        id,
        admin_id,
        action,
        target_type,
        target_id,
        metadata,
        created_at,
        users!audit_logs_admin_id_fkey (
          email,
          display_name
        )
      `, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    // Apply filters
    if (action) {
      query = query.eq("action", action);
    }
    if (adminId) {
      query = query.eq("admin_id", adminId);
    }
    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    const { data, error, count } = await query;

    if (error) throw new Error(error.message);

    // Filter by search in metadata (client-side filter since JSON search is complex)
    let filteredData = data || [];
    if (search) {
      const searchLower = search.toLowerCase();
      filteredData = filteredData.filter((log) => {
        const metadataStr = log.metadata ? JSON.stringify(log.metadata).toLowerCase() : "";
        const actionStr = log.action.toLowerCase();
        const targetTypeStr = (log.target_type || "").toLowerCase();
        const targetIdStr = (log.target_id || "").toLowerCase();
        return (
          actionStr.includes(searchLower) ||
          targetTypeStr.includes(searchLower) ||
          targetIdStr.includes(searchLower) ||
          metadataStr.includes(searchLower)
        );
      });
    }

    // Transform data
    const transformedData = filteredData.map((log: any) => ({
      id: log.id,
      adminId: log.admin_id,
      adminEmail: log.users?.email || "Unknown",
      adminName: log.users?.display_name || null,
      action: log.action,
      targetType: log.target_type,
      targetId: log.target_id,
      metadata: log.metadata,
      createdAt: log.created_at,
    }));

    return NextResponse.json({
      ok: true,
      data: transformedData,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    return createSafeErrorResponse(error);
  }
}
