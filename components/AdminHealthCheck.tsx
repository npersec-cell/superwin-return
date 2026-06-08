"use client";

import { useState, useEffect } from "react";

// Types
type CheckResult = {
  name: string;
  status: "PASS" | "WARN" | "FAIL";
  message: string;
  details?: Record<string, unknown>;
};

type HealthReport = {
  timestamp: string;
  overallStatus: "HEALTHY" | "WARNING" | "CRITICAL";
  checks: CheckResult[];
  summary: string;
};

type AuditLog = {
  id: string;
  adminId: string;
  adminEmail: string;
  adminName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch");
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Request failed");
  return json.data as T;
}

export default function AdminHealthCheck() {
  const [healthReport, setHealthReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRunTime, setLastRunTime] = useState<string | null>(null);
  
  const [alerts, setAlerts] = useState<AuditLog[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);

  // Auto load alerts on mount
  useEffect(() => {
    loadAlerts();
  }, []);

  async function runHealthCheck() {
    setLoading(true);
    setError(null);
    try {
      const report = await fetchJson<HealthReport>("/api/admin/health-check");
      setHealthReport(report);
      setLastRunTime(new Date().toLocaleString("th-TH"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Health check failed");
    } finally {
      setLoading(false);
    }
  }

  async function loadAlerts() {
    setAlertsLoading(true);
    try {
      const data = await fetchJson<AuditLog[]>("/api/admin/audit-logs?limit=20");
      setAlerts(data || []);
    } catch {
      // Ignore
    } finally {
      setAlertsLoading(false);
    }
  }

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case "HEALTHY":
      case "PASS":
        return "#22c55e"; // Green
      case "WARNING":
      case "WARN":
        return "#eab308"; // Yellow
      case "CRITICAL":
      case "FAIL":
        return "#ef4444"; // Red
      default:
        return "#fff";
    }
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "HEALTHY":
      case "PASS":
        return "✅";
      case "WARNING":
      case "WARN":
        return "⚠️";
      case "CRITICAL":
      case "FAIL":
        return "🔴";
      default:
        return "❓";
    }
  };

  return (
    <section className="panel" style={{ width: "100%", maxWidth: "900px", display: "grid", gap: "16px", margin: "0 auto" }}>
      
      {/* Health Check Section */}
      <section className="panel" style={{ 
        background: "var(--card)", 
        border: "1px solid var(--hairline)", 
        borderRadius: "12px", 
        padding: "16px" 
      }}>
        <div className="panel-head" style={{ 
          padding: "0 0 12px 0", 
          borderBottom: "1px solid var(--hairline)", 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center" 
        }}>
          <h3 style={{ margin: 0, fontSize: "14px", color: "#fff" }}>
            🔍 System Health Check
          </h3>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {lastRunTime && (
              <span style={{ fontSize: "10px", color: "var(--muted)" }}>
                🔷 ครั้งล่าสุด: {lastRunTime}
              </span>
            )}
            <button 
              className="button gold" 
              onClick={runHealthCheck} 
              disabled={loading}
              style={{ height: "28px", fontSize: "11px", padding: "0 12px" }}
            >
              {loading ? "⏳ กำลังตรวจสอบ..." : "▶️ Run Health Check"}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ 
            background: "rgba(239, 68, 68, 0.1)", 
            border: "1px solid rgba(239, 68, 68, 0.3)", 
            borderRadius: "8px", 
            padding: "12px", 
            color: "#ef4444",
            fontSize: "12px"
          }}>
            ❌ {error}
          </div>
        )}

        {loading && !healthReport && (
          <div style={{ 
            textAlign: "center", 
            padding: "30px", 
            color: "var(--text-weak)",
            fontSize: "12px"
          }}>
            ⏳ กำลังตรวจสอบระบบ...
          </div>
        )}

        {healthReport && (
          <div style={{ display: "grid", gap: "16px" }}>
            {/* Overall Status Card */}
            <div style={{ 
              background: healthReport.overallStatus === "HEALTHY" 
                ? "rgba(34, 197, 94, 0.1)" 
                : healthReport.overallStatus === "WARNING"
                ? "rgba(234, 179, 8, 0.1)"
                : "rgba(239, 68, 68, 0.1)",
              border: `1px solid ${getStatusColor(healthReport.overallStatus)}`,
              borderRadius: "12px",
              padding: "16px",
              textAlign: "center"
            }}>
              <div style={{ fontSize: "48px", marginBottom: "8px" }}>
                {getStatusIcon(healthReport.overallStatus)}
              </div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: getStatusColor(healthReport.overallStatus) }}>
                {healthReport.overallStatus}
              </div>
              <div style={{ fontSize: "12px", color: "#fff", marginTop: "4px" }}>
                {healthReport.summary}
              </div>
              <div style={{ fontSize: "10px", color: "var(--muted)", marginTop: "6px" }}>
                🕐 {new Date(healthReport.timestamp).toLocaleString("th-TH")}
              </div>
            </div>

            {/* Individual Checks */}
            <div style={{ 
              display: "grid", 
              gap: "10px",
              marginTop: "8px"
            }}>
              {healthReport.checks.map((check, idx) => (
                <div key={idx} style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "12px",
                  padding: "10px 12px",
                  background: "var(--bg)",
                  borderRadius: "8px",
                  borderLeft: `3px solid ${getStatusColor(check.status)}`
                }}>
                  <span style={{ fontSize: "14px" }}>
                    {getStatusIcon(check.status)}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "#fff" }}>
                      {check.name}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
                      {check.message}
                    </div>
                    {check.details && Object.keys(check.details).length > 0 && (
                      <div style={{ 
                        marginTop: "6px", 
                        fontSize: "10px", 
                        color: "var(--text-weak)",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "6px"
                      }}>
                        {Object.entries(check.details).map(([key, value]) => (
                          <span key={key} style={{ 
                            background: "var(--card)",
                            padding: "2px 6px",
                            borderRadius: "4px"
                          }}>
                            {key}: {String(value).substring(0, 30)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* System Alerts Section */}
      <section className="panel" style={{ 
        background: "var(--card)", 
        border: "1px solid var(--hairline)", 
        borderRadius: "12px", 
        padding: "16px" 
      }}>
        <div className="panel-head" style={{ 
          padding: "0 0 12px 0", 
          borderBottom: "1px solid var(--hairline)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <h3 style={{ margin: 0, fontSize: "14px", color: "#fff" }}>
            📋 System Alerts ({alerts.length})
          </h3>
          <button 
            className="button gold" 
            onClick={loadAlerts} 
            disabled={alertsLoading}
            style={{ height: "26px", fontSize: "11px", padding: "0 10px" }}
          >
            🔄 รีเฟรช
          </button>
        </div>

        {alertsLoading ? (
          <div style={{ textAlign: "center", padding: "20px", color: "var(--text-weak)", fontSize: "12px" }}>
            ⏳ กำลังโหลด...
          </div>
        ) : alerts.length === 0 ? (
          <div style={{ 
            textAlign: "center", 
            padding: "30px", 
            color: "var(--green)",
            fontSize: "12px"
          }}>
            ✅ ไม่มีกิจกรรมผิดปกติ
          </div>
        ) : (
          <div style={{ overflowX: "auto", marginTop: "12px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
              <thead>
                <tr style={{ color: "var(--muted)", textAlign: "left", borderBottom: "1px solid var(--hairline)" }}>
                  <th style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>Action</th>
                  <th style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>Admin</th>
                  <th style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>Target</th>
                  <th style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr 
                    key={alert.id} 
                    style={{ 
                      borderBottom: "1px solid var(--hairline-soft)",
                      transition: "background 120ms"
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--card-2)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "8px", color: "#fff", whiteSpace: "nowrap" }}>
                      <span style={{ 
                        padding: "2px 6px", 
                        background: "var(--bg)",
                        borderRadius: "4px"
                      }}>
                        {alert.action}
                      </span>
                    </td>
                    <td style={{ padding: "8px", color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {alert.adminId === "system" ? "🤖 System" : alert.adminId?.substring(0, 8) || "-"}
                    </td>
                    <td style={{ padding: "8px", color: "var(--text)", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {alert.targetType || "-"}#{alert.targetId?.substring(0, 8) || "-"}
                    </td>
                    <td style={{ padding: "8px", color: "var(--muted)", fontSize: "10px", whiteSpace: "nowrap" }}>
                      {alert.createdAt ? new Date(alert.createdAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
