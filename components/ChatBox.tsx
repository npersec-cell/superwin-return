"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";

type ChatMessage = {
  id: string;
  userId: string;
  displayName: string;
  message: string;
  createdAt: string;
};

type ChatBoxProps = {
  isAdmin?: boolean;
  onDeleteMessage?: (id: string) => void;
};

const POLL_INTERVAL_MS = 5000;
const MAX_MESSAGES = 20; // Limit messages displayed in UI to prevent lag

export default function ChatBox({ isAdmin = false, onDeleteMessage }: ChatBoxProps) {
  const { isSignedIn, user } = useUser();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [charCount, setCharCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastMessageIdRef = useRef<string | null>(null);

  const MAX_CHARS = 500;

  // ── Fetch messages ──
  const fetchMessages = async () => {
    try {
      const res = await fetch(`/api/chat?limit=${MAX_MESSAGES}`);
      const json = await res.json();
      if (json.ok && Array.isArray(json.data)) {
        setMessages(json.data);
        // Track last message ID to detect new messages
        if (json.data.length > 0) {
          lastMessageIdRef.current = json.data[json.data.length - 1].id;
        }
      }
    } catch (err) {
      console.error("Chat fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchMessages();
  }, []);

  // Poll for new messages
  useEffect(() => {
    const interval = setInterval(fetchMessages, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Update char count
  useEffect(() => {
    setCharCount(inputValue.length);
  }, [inputValue]);

  // ── Send message ──
  const sendMessage = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || !isSignedIn) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.th || json.error || "Failed to send message");
        return;
      }

      // Optimistic update: add message to list
      if (json.data) {
        setMessages(prev => {
          const updated = [...prev, json.data];
          // Keep only last MAX_MESSAGES
          if (updated.length > MAX_MESSAGES) {
            return updated.slice(updated.length - MAX_MESSAGES);
          }
          return updated;
        });
      }

      setInputValue("");
      setError(null);
      inputRef.current?.focus();
    } catch (err) {
      setError("An error occurred. Please try again.");
      console.error("Chat send error:", err);
    } finally {
      setSending(false);
    }
  };

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Handle delete (admin)
  const handleDelete = async (id: string) => {
    if (!isAdmin && !confirm("Do you want to delete this message?")) return;

    try {
      const res = await fetch(`/api/chat/${id}`, { method: "DELETE" });
      if (res.ok) {
        // Remove from local state
        setMessages(prev => prev.filter(m => m.id !== id));
        onDeleteMessage?.(id);
      } else {
        alert("Failed to delete message");
      }
    } catch {
      alert("Error deleting message");
    }
  };

  // Format timestamp
  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  };

  // Current user's display name
  const currentDisplayName = user?.firstName
    ? [user.firstName, user.lastName].filter(Boolean).join(" ").trim()
    : user?.username || "";

  return (
    <section className="panel" style={{
      border: "1px solid var(--hairline)",
      background: "var(--card)",
      borderRadius: "12px",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      maxHeight: "500px",
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
        <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--text)" }}>
          Chat Room
        </span>
      </div>

      {/* Messages Area */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        minHeight: "200px",
        maxHeight: "320px",
      }}>
        {loading && messages.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px", color: "var(--muted)", fontSize: "11px" }}>
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px", color: "var(--muted)", fontSize: "11px" }}>
            No messages yet<br />Be the first to chat!
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = isSignedIn && user?.id === msg.userId;
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
                    : "transparent",
                  position: "relative",
                }}
              >
                {/* Name + Time row */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{
                    fontSize: "11px",
                    fontWeight: "700",
                    color: isOwn ? "var(--yellow)" : "var(--info)",
                  }}>
                    {msg.displayName || "Anonymous"}
                  </span>
                  <span style={{ fontSize: "9px", color: "var(--muted)" }}>
                    {formatTime(msg.createdAt)}
                  </span>
                  {/* Delete button for admin */}
                  {(isAdmin || isOwn) && (
                    <button
                      onClick={() => handleDelete(msg.id)}
                      style={{
                        marginLeft: "auto",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "10px",
                        color: "var(--red)",
                        opacity: 0.6,
                        padding: "0 4px",
                      }}
                      title="Delete message"
                    >
                      ✕
                    </button>
                  )}
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
          })
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
        {isSignedIn ? (
          <>
            <div style={{ display: "flex", gap: "6px" }}>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
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
                {sending ? "…" : "Send"}
              </button>
            </div>
            {/* Character count */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "4px",
              fontSize: "9px",
              color: charCount > MAX_CHARS * 0.9 ? "var(--red)" : "var(--muted)",
            }}>
              <span>{charCount}/{MAX_CHARS}</span>
              <span>Press Enter to Send</span>
            </div>
          </>
        ) : (
          <div style={{
            textAlign: "center",
            padding: "8px",
            fontSize: "11px",
            color: "var(--muted)",
          }}>
            🔒 <a href="/sign-in" style={{ color: "var(--yellow)", textDecoration: "none", fontWeight: "600" }}>Sign in</a> to send chat messages
          </div>
        )}
      </div>
    </section>
  );
}
