"use client";

import { useEffect, useRef, useState } from "react";

type ReportMessage = {
  id: string;
  sender_id: string | null;
  sender_role: "user" | "admin";
  message: string;
  is_read: boolean;
  created_at: string;
};

type ReportChatProps = {
  reportId: string;
  isAdmin?: boolean;
  onClose?: () => void;
};

const POLL_INTERVAL_MS = 5000;
const MAX_CHARS = 1000;

export default function ReportChat({ reportId, isAdmin = false, onClose }: ReportChatProps) {
  const [messages, setMessages] = useState<ReportMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Fetch messages ──
  const fetchMessages = async () => {
    try {
      const res = await fetch(`/api/reports/${reportId}/messages`);
      const json = await res.json();
      if (json.ok && Array.isArray(json.data)) {
        setMessages(json.data);
      }
    } catch (err) {
      console.error("Report chat fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchMessages();
  }, [reportId]);

  // Poll for new messages
  useEffect(() => {
    const interval = setInterval(fetchMessages, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [reportId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // ── Send message ──
  const sendMessage = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch(`/api/reports/${reportId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Failed to send message");
        return;
      }

      // Optimistic update
      if (json.data) {
        setMessages(prev => [...prev, json.data]);
      }

      setInputValue("");
      setError(null);
      inputRef.current?.focus();
    } catch (err) {
      setError("An error occurred. Please try again.");
      console.error("Report chat send error:", err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    
    if (isToday) return "วันนี้";
    if (isYesterday) return "เมื่อวาน";
    return date.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
  };

  // Group messages by date
  const groupedMessages: Array<{ date: string; msgs: ReportMessage[] }> = [];
  let lastDate = "";
  for (const msg of messages) {
    const msgDate = formatDate(msg.created_at);
    if (msgDate !== lastDate) {
      groupedMessages.push({ date: msgDate, msgs: [msg] });
      lastDate = msgDate;
    } else {
      groupedMessages[groupedMessages.length - 1].msgs.push(msg);
    }
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      maxHeight: "500px",
      background: "var(--card)",
      borderRadius: "12px",
      overflow: "hidden",
      border: "1px solid var(--hairline)",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 14px",
        borderBottom: "1px solid var(--hairline)",
        background: "rgba(255,255,255,0.02)",
      }}>
        <span style={{ fontSize: "14px" }}>💬</span>
        <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--text)", flex: 1 }}>
          {isAdmin ? "แชทกับ User" : "แชทกับ Admin"}
        </span>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: "16px",
              color: "var(--muted)",
              padding: "0 4px",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Messages Area */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        minHeight: "200px",
        maxHeight: "380px",
      }}>
        {loading && messages.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px", color: "var(--muted)", fontSize: "11px" }}>
            กำลังโหลดบทสนทนา...
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px", color: "var(--muted)", fontSize: "11px" }}>
            ยังไม่มีบทสนทนา<br />เริ่มต้นพูดคุยได้เลย!
          </div>
        ) : (
          groupedMessages.map((group, gi) => (
            <div key={gi}>
              {/* Date separator */}
              <div style={{
                textAlign: "center",
                padding: "8px 0 4px",
                fontSize: "9px",
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}>
                {group.date}
              </div>
              
              {group.msgs.map((msg) => {
                const isOwn = isAdmin ? msg.sender_role === "admin" : msg.sender_role === "user";
                return (
                  <div
                    key={msg.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "2px",
                      padding: "6px 10px",
                      borderRadius: "8px",
                      background: isOwn
                        ? "rgba(255, 225, 0, 0.06)"
                        : "rgba(255,255,255,0.02)",
                      maxWidth: "85%",
                      alignSelf: isOwn ? "flex-end" : "flex-start",
                    }}
                  >
                    {/* Name + Time row */}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{
                        fontSize: "10px",
                        fontWeight: "700",
                        color: isOwn ? "var(--yellow)" : "var(--info)",
                      }}>
                        {isOwn ? (isAdmin ? "คุณ" : "ฉัน") : (isAdmin ? "User" : "Admin")}
                      </span>
                      <span style={{ fontSize: "9px", color: "var(--muted)" }}>
                        {formatTime(msg.created_at)}
                      </span>
                    </div>
                    {/* Message text */}
                    <span style={{
                      fontSize: "12px",
                      color: "var(--text)",
                      lineHeight: "1.4",
                      wordBreak: "break-word",
                    }}>
                      {msg.message}
                    </span>
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error message */}
      {error && (
        <div style={{
          padding: "6px 14px",
          fontSize: "10px",
          color: "var(--red)",
          background: "rgba(246, 70, 93, 0.08)",
          borderTop: "1px solid rgba(246, 70, 93, 0.15)",
        }}>
          ⚠ {error}
        </div>
      )}

      {/* Input Area */}
      <div style={{
        padding: "10px 14px",
        borderTop: "1px solid var(--hairline)",
        background: "rgba(255,255,255,0.02)",
      }}>
        <div style={{ display: "flex", gap: "6px" }}>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="พิมพ์ข้อความ..."
            disabled={sending}
            maxLength={MAX_CHARS}
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--hairline)",
              borderRadius: "8px",
              padding: "8px 12px",
              fontSize: "12px",
              color: "var(--text)",
              outline: "none",
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => e.target.style.borderColor = "var(--yellow)"}
            onBlur={(e) => e.target.style.borderColor = "var(--hairline)"}
          />
          <button
            onClick={sendMessage}
            disabled={sending || !inputValue.trim()}
            style={{
              background: sending || !inputValue.trim()
                ? "var(--hairline)"
                : "var(--yellow)",
              color: sending ? "var(--muted)" : "#000",
              border: "none",
              borderRadius: "8px",
              padding: "0 16px",
              fontSize: "13px",
              fontWeight: "700",
              cursor: sending ? "not-allowed" : "pointer",
              transition: "all 0.15s",
              minWidth: "40px",
            }}
          >
            {sending ? "…" : "ส่ง"}
          </button>
        </div>
        {/* Character count */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "4px",
          fontSize: "9px",
          color: inputValue.length > MAX_CHARS * 0.9 ? "var(--red)" : "var(--muted)",
        }}>
          <span>{inputValue.length}/{MAX_CHARS}</span>
          <span>กด Enter เพื่อส่ง</span>
        </div>
      </div>
    </div>
  );
}
