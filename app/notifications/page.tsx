import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";
import Link from "next/link";
import NotificationList from "@/components/NotificationList";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationsPageProps {
  searchParams: {
    page?: string;
  };
}

async function getNotifications(page: number = 1, userId: string): Promise<{
  notifications: Notification[];
  unreadCount: number;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const supabase = createSupabaseAdminClient();

  const limit = 20;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // Fetch notifications
  const { data, error, count } = await supabase
    .from("notifications")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("Failed to fetch notifications:", error);
    return {
      notifications: [],
      unreadCount: 0,
      pagination: { page: 1, limit, total: 0, totalPages: 0 },
    };
  }

  // Get unread count
  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  const notifications: Notification[] = (data || []).map((notif: any) => ({
    id: notif.id,
    type: notif.type,
    title: notif.title,
    message: notif.message,
    metadata: notif.metadata,
    isRead: notif.is_read,
    createdAt: notif.created_at,
  }));

  return {
    notifications,
    unreadCount: unreadCount || 0,
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
    },
  };
}

export default async function NotificationsPage({
  searchParams,
}: NotificationsPageProps) {
  try {
    const user = await requireUser();
    const page = parseInt(searchParams.page || "1") || 1;
    const { notifications, unreadCount, pagination } = await getNotifications(page, user.id);

    return (
      <main className="page">
        <div className="app" style={{ maxWidth: "760px" }}>
          <header className="topbar">
            <div className="brand-text">
              <h1>SUPERWIN HUB</h1>
              <span>Notifications</span>
            </div>
            <div className="actions">
              <Link className="button gold" href="/">
                Back
              </Link>
            </div>
          </header>

          <section className="panel">
            <div className="panel-header">
              <h2>การแจ้งเตือน</h2>
              {unreadCount > 0 && (
                <span className="accent-gold">
                  {unreadCount} ยังไม่ได้อ่าน
                </span>
              )}
            </div>

            <NotificationList
              initialNotifications={notifications}
              initialPagination={pagination}
              currentPage={page}
              userId={user.id}
            />
          </section>
        </div>
      </main>
    );
  } catch {
    return (
      <main className="page">
        <div className="app">
          <header className="topbar">
            <div className="brand-text">
              <h1>SUPERWIN HUB</h1>
              <span>Notifications</span>
            </div>
            <Link className="button gold" href="/">
              Back
            </Link>
          </header>
          <section className="panel">
            <div className="modal-body">
              <div className="info-block">
                <h4>Access denied</h4>
                <p>Please sign in to view notifications.</p>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }
}
