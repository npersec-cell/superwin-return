import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

function toStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed";
  if (message === "Unauthorized") return 401;
  if (message === "Forbidden") return 403;
  return 500;
}

/**
 * GET /api/notifications
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 20, max: 50)
 * - unreadOnly: boolean (default: false)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const supabase = createSupabaseAdminClient();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Build query
    let query = supabase
      .from("notifications")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (unreadOnly) {
      query = query.eq("is_read", false);
    }

    const { data, error, count } = await query;

    if (error) throw new Error(error.message);

    // Get unread count
    const { count: unreadCount } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    // Transform data
    const notifications = (data || []).map((notif: NotificationRow) => ({
      id: notif.id,
      type: notif.type,
      title: notif.title,
      message: notif.message,
      metadata: notif.metadata,
      isRead: notif.is_read,
      createdAt: notif.created_at,
    }));

    return NextResponse.json({
      ok: true,
      data: notifications,
      unreadCount: unreadCount || 0,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load notifications";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}

/**
 * PATCH /api/notifications
 * Body: { notificationIds: string[], markAsRead: boolean }
 * Marks notifications as read/unread
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const supabase = createSupabaseAdminClient();

    const body = await request.json();
    const { notificationIds, markAsRead = true } = body;

    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "notificationIds must be a non-empty array" },
        { status: 400 }
      );
    }

    // Update notifications (only own notifications)
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: markAsRead })
      .eq("user_id", user.id)
      .in("id", notificationIds);

    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      message: `Marked ${notificationIds.length} notifications as ${markAsRead ? "read" : "unread"}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update notifications";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}

/**
 * DELETE /api/notifications
 * Query params:
 * - all: boolean (delete all notifications)
 * - olderThan: ISO date string (delete notifications older than date)
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const supabase = createSupabaseAdminClient();

    const { searchParams } = new URL(request.url);
    const all = searchParams.get("all") === "true";
    const olderThan = searchParams.get("olderThan");

    let query = supabase
      .from("notifications")
      .delete()
      .eq("user_id", user.id);

    if (!all && !olderThan) {
      return NextResponse.json(
        { ok: false, error: "Must specify 'all=true' or 'olderThan' date" },
        { status: 400 }
      );
    }

    if (olderThan) {
      query = query.lt("created_at", olderThan);
    }

    const { error, count } = await query;

    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      message: `Deleted ${count || 0} notifications`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete notifications";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}
