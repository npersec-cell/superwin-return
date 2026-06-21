"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface NotificationListProps {
  initialNotifications: Notification[];
  initialPagination: PaginationInfo;
  currentPage: number;
  userId: string;
}

const TYPE_ICONS: Record<string, string> = {
  prediction_win: "🎉",
  prediction_resolved: "✅",
  prediction_refund: "↩️",
  system: "🔔",
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

export default function NotificationList({
  initialNotifications,
  initialPagination,
  currentPage,
}: NotificationListProps) {
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [pagination, setPagination] = useState<PaginationInfo>(initialPagination);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchNotifications = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/notifications?page=${page}&limit=20`);
      const data = await res.json();
      if (data.ok) {
        setNotifications(data.data || []);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const markAsRead = async (ids: string[]) => {
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationIds: ids, markAsRead: true }),
      });
      const data = await res.json();
      if (data.ok) {
        setNotifications((prev) =>
          prev.map((n) => (ids.includes(n.id) ? { ...n, isRead: true } : n))
        );
        setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
      }
    } catch (error) {
      console.error("Failed to mark as read:", error);
    }
  };

  const markAsUnread = async (ids: string[]) => {
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationIds: ids, markAsRead: false }),
      });
      const data = await res.json();
      if (data.ok) {
        setNotifications((prev) =>
          prev.map((n) => (ids.includes(n.id) ? { ...n, isRead: false } : n))
        );
      }
    } catch (error) {
      console.error("Failed to mark as unread:", error);
    }
  };

  const deleteNotifications = async (ids: string[]) => {
    if (!confirm(`Delete ${ids.length} notification(s)?`)) return;
    try {
      const res = await fetch("/api/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationIds: ids }),
      });
      const data = await res.json();
      if (data.ok) {
        setNotifications((prev) => prev.filter((n) => !ids.includes(n.id)));
        setSelectedIds([]);
      }
    } catch (error) {
      console.error("Failed to delete notifications:", error);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === notifications.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(notifications.map((n) => n.id));
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markAsRead([notification.id]);
    }
    // Navigate if metadata has prediction_id
    if (notification.metadata?.prediction_id) {
      window.location.href = `/?prediction=${notification.metadata.prediction_id}`;
    }
  };

  return (
    <div className="notification-list">
      {/* Bulk Actions */}
      {notifications.length > 0 && (
        <div className="bulk-actions">
          <label className="select-all">
            <input
              type="checkbox"
              checked={selectedIds.length === notifications.length && notifications.length > 0}
              onChange={toggleSelectAll}
            />
            <span>เลือกทั้งหมด</span>
          </label>

          <div className="bulk-buttons">
            {selectedIds.length > 0 && (
              <>
                <button
                  className="button ghost"
                  onClick={() => markAsRead(selectedIds)}
                >
                  มาร์คอ่านแล้ว ({selectedIds.length})
                </button>
                <button
                  className="button ghost"
                  onClick={() => markAsUnread(selectedIds)}
                >
                  มาร์คยังไม่ได้อ่าน
                </button>
                <button
                  className="button ghost"
                  style={{ color: "var(--red)" }}
                  onClick={() => deleteNotifications(selectedIds)}
                >
                  ลบ ({selectedIds.length})
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Notification Items */}
      <div className="notification-items">
        {loading ? (
          <div className="loading">กำลังโหลด...</div>
        ) : notifications.length === 0 ? (
          <div className="empty">ไม่มีการแจ้งเตือน</div>
        ) : (
          notifications.map((notification) => (
            <div
              key={notification.id}
              className={`notification-item ${notification.isRead ? "read" : "unread"}`}
              onClick={() => handleNotificationClick(notification)}
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(notification.id)}
                onChange={(e) => {
                  e.stopPropagation();
                  toggleSelect(notification.id);
                }}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="notification-icon">
                {TYPE_ICONS[notification.type] || "🔔"}
              </div>
              <div className="notification-content">
                <div className="notification-title">{notification.title}</div>
                <div className="notification-message">{notification.message}</div>
                <div className="notification-time">
                  {formatBangkokTime(notification.createdAt)}
                </div>
              </div>
              {!notification.isRead && <div className="unread-dot" />}
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={() => {
              const newPage = pagination.page - 1;
              setPagination((prev) => ({ ...prev, page: newPage }));
              fetchNotifications(newPage);
            }}
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
            onClick={() => {
              const newPage = pagination.page + 1;
              setPagination((prev) => ({ ...prev, page: newPage }));
              fetchNotifications(newPage);
            }}
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
