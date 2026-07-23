"use client";

import { useState, useCallback } from "react";

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

interface AuditLogsClientProps {
  initialLogs: AuditLog[];
  initialPagination: PaginationInfo;
  currentPage: number;
}

const ACTION_LABELS: Record<string, string> = {
  resolve_prediction: "Resolve prediction",
  refund_prediction: "Refund coins",
  create_prediction: "Create prediction",
  update_prediction: "Update prediction",
  cancel_prediction: "Cancel prediction",
  make_admin: "Make admin",
  remove_admin: "Remove admin",
  refresh_leaderboard_cache: "Refresh Leaderboard Cache",
  cleanup_rate_limits: "Cleanup Rate Limits",
  cleanup_cache: "Cleanup Cache",
};

const TARGET_TYPE_LABELS: Record<string, string> = {
  prediction: "Prediction",
  user: "User",
  system: "System",
  leaderboard: "Leaderboard",
};

function formatBangkokTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return isoString;
  }
}

function formatMetadata(metadata: Record<string, unknown> | null): string {
  if (!metadata) return "-";
  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return "-";
  }
}

export default function AuditLogsClient({
  initialLogs,
  initialPagination,
  currentPage,
}: AuditLogsClientProps) {
  const [logs, setLogs] = useState<AuditLog[]>(initialLogs);
  const [pagination, setPagination] = useState<PaginationInfo>(initialPagination);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedAction, setSelectedAction] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const fetchLogs = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", "50");
      if (selectedAction) params.set("action", selectedAction);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const response = await fetch(`/api/admin/audit-logs?${params.toString()}`);
      const result = await response.json();

      if (result.ok) {
        setLogs(result.data || []);
        setPagination(result.pagination);
      }
    } catch (error) {
      console.error("Failed to fetch audit logs:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedAction, startDate, endDate]);

  const handleSearch = () => {
    fetchLogs(1);
  };

  const handleReset = () => {
    setSearch("");
    setSelectedAction("");
    setStartDate("");
    setEndDate("");
    // Reset and fetch without filters
    setLoading(true);
    fetch("/api/admin/audit-logs?page=1&limit=50")
      .then((res) => res.json())
      .then((result) => {
        if (result.ok) {
          setLogs(result.data || []);
          setPagination(result.pagination);
        }
      })
      .catch((error) => console.error("Failed to reset filters:", error))
      .finally(() => setLoading(false));
  };

  const handlePageChange = (newPage: number) => {
    fetchLogs(newPage);
  };

  return (
    <div className="audit-logs-container">
      {/* Filters */}
      <div className="filters">
        <div className="filter-group">
          <label>Action:</label>
          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className="filter-select"
          >
            <option value="">All</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Start Date:</label>
          <input
            type="datetime-local"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="filter-input"
          />
        </div>

        <div className="filter-group">
          <label>End Date:</label>
          <input
            type="datetime-local"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="filter-input"
          />
        </div>

        <div className="filter-group">
          <label>Search:</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search details..."
            className="filter-input"
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>

        <div className="filter-actions">
          <button
            onClick={handleSearch}
            disabled={loading}
            className="button gold"
          >
            {loading ? "Searching..." : "Search"}
          </button>
          <button
            onClick={handleReset}
            disabled={loading}
            className="button ghost"
          >
            Clear filters
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        {loading ? (
          <div className="loading">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="empty-state">No audit logs found</div>
        ) : (
          <table className="audit-table">
            <thead>
              <tr>
                <th>#</th>
                <th>เTime (Bangkok)</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target Type</th>
                <th>Target ID</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, index) => (
                <tr key={log.id}>
                  <td>{(pagination.page - 1) * pagination.limit + index + 1}</td>
                  <td className="nowrap">{formatBangkokTime(log.createdAt)}</td>
                  <td>
                    <div className="admin-info">
                      <span className="admin-email">{log.adminEmail}</span>
                      {log.adminName && (
                        <span className="admin-name">({log.adminName})</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`action-badge action-${log.action.split("_")[0]}`}>
                      {ACTION_LABELS[log.action] || log.action}
                    </span>
                  </td>
                  <td>
                    {log.targetType ? (
                      <span className="target-type">
                        {TARGET_TYPE_LABELS[log.targetType] || log.targetType}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="mono">{log.targetId || "-"}</td>
                  <td className="metadata-cell">
                    <pre>{formatMetadata(log.metadata)}</pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={() => handlePageChange(pagination.page - 1)}
            disabled={pagination.page <= 1 || loading}
            className="button ghost"
          >
            Previous
          </button>
          <span className="page-info">
            Page {pagination.page} / {pagination.totalPages}
            <span className="total-info">(total {pagination.total} items)</span>
          </span>
          <button
            onClick={() => handlePageChange(pagination.page + 1)}
            disabled={pagination.page >= pagination.totalPages || loading}
            className="button ghost"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
