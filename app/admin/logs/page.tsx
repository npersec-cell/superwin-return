import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";
import AuditLogsClient from "@/components/AuditLogsClient";

interface AuditLog {
  id: string;
  adminId: string;
  adminEmail: string;
  adminName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

async function getAuditLogs(page: number = 1): Promise<{ logs: AuditLog[]; pagination: PaginationInfo }> {
  const supabase = createSupabaseAdminClient();

  const from = (page - 1) * 50;
  const to = from + 49;

  const { data, error, count } = await supabase
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

  if (error) {
    console.error("Failed to fetch audit logs:", error);
    return { logs: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } };
  }

  const logs: AuditLog[] = (data || []).map((log: any) => ({
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

  return {
    logs,
    pagination: {
      page,
      limit: 50,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / 50),
    },
  };
}

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  try {
    const user = await requireAdmin();

    const page = parseInt(searchParams.page || "1") || 1;
    const { logs, pagination } = await getAuditLogs(page);

    return (
      <main className="page">
        <div className="app">
          <header className="topbar">
            <div className="brand-text">
              <h1>SUPERWIN HUB</h1>
              <span>Audit Logs</span>
            </div>
            <nav className="nav-links">
              <Link className="button ghost" href="/admin">Predictions</Link>
              <Link className="button ghost" href="/admin/users">Users</Link>
              <Link className="button gold" href="/">Back</Link>
            </nav>
          </header>

          <section className="panel">
            <div className="panel-header">
              <h2>Audit Logs</h2>
              <p className="subtitle">ประวัติการกระทำของผู้ดูแลระบบ</p>
            </div>

            <AuditLogsClient
              initialLogs={logs}
              initialPagination={pagination}
              currentPage={page}
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
              <span>Audit Logs</span>
            </div>
            <Link className="button gold" href="/">Back</Link>
          </header>
          <section className="panel">
            <div className="modal-body">
              <div className="info-block">
                <h4>Access denied</h4>
                <p>This page is available only for admin users.</p>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }
}
