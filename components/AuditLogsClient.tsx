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
  resolve_prediction: "ปิดผลการพยากรณ์",
  refund_prediction: "คืน coins",
  create_prediction: "สร้างรอบพยากรณ์",
  update_prediction: "แก้ไขรอบพยากรณ์",
  cancel_prediction: "ยกเลิกรอบพยากรณ์",
  make_admin: "ตั้งเป็น Admin",
  remove_admin: "ถอดถอน Admin",
  refresh_leaderboard_cache: "รีเฟรช Leaderboard Cache",
  cleanup_rate_limits: "ล้าง Rate Limits",
  cleanup_cache: "ล้าง Cache",
};

const TARGET_TYPE_LABELS: Record<string, string> = {
  prediction: "รอบพยากรณ์",
  user: "ผู้ใช้",
  system: "ระบบ",
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
          <label>การกระทำ:</label>
          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className="filter-select"
          >
            <option value="">ทั้งหมด</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>วันที่เริ่ม:</label>
          <input
            type="datetime-local"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="filter-input"
          />
        </div>

        <div className="filter-group">
          <label>วันที่สิ้นสุด:</label>
          <input
            type="datetime-local"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="filter-input"
          />
        </div>

        <div className="filter-group">
          <label>ค้นหา:</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาในรายละเอียด..."
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
            {loading ? "กำลังค้นหา..." : "ค้นหา"}
          </button>
          <button
            onClick={handleReset}
            disabled={loading}
            className="button ghost"
          >
            ล้างตัวกรอง
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        {loading ? (
          <div className="loading">กำลังโหลด...</div>
        ) : logs.length === 0 ? (
          <div className="empty-state">ไม่พบข้อมูล Audit Logs</div>
        ) : (
          <table className="audit-table">
            <thead>
              <tr>
                <th>ลำดับ</th>
                <th>เวลา (Bangkok)</th>
                <th>ผู้ทำ</th>
                <th>การกระทำ</th>
                <th>ประเภทเป้าหมาย</th>
                <th>ID เป้าหมาย</th>
                <th>รายละเอียด</th>
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
            ก่อนหน้า
          </button>
          <span className="page-info">
            หน้า {pagination.page} / {pagination.totalPages}
            <span className="total-info">(ทั้งหมด {pagination.total} รายการ)</span>
          </span>
          <button
            onClick={() => handlePageChange(pagination.page + 1)}
            disabled={pagination.page >= pagination.totalPages || loading}
            className="button ghost"
          >
            ถัดไป
          </button>
        </div>
      )}
    </div>
  );
}
