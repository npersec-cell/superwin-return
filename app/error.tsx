"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[ErrorBoundary]", error);
  }, [error]);

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "#0d1013",
      color: "#e8eaed",
      padding: "24px",
      textAlign: "center",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    }}>
      <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
      <h1 style={{ fontSize: "22px", fontWeight: "600", margin: "0 0 8px 0" }}>Something Went Wrong</h1>
      <p style={{ fontSize: "14px", color: "#9aa0a6", margin: "0 0 8px 0", maxWidth: "340px" }}>We encountered an issue loading this page. Please try again.</p>
      <p style={{ fontSize: "11px", color: "#5f6368", margin: "0 0 20px 0", fontFamily: "monospace", wordBreak: "break-all" }}>{error.message}</p>
      <button onClick={reset} style={{
        padding: "12px 28px",
        background: "linear-gradient(135deg, #ff6b35, #f7c531)",
        color: "#0d1013",
        border: "none",
        borderRadius: "24px",
        fontWeight: "600",
        fontSize: "14px",
        cursor: "pointer",
        transition: "transform 0.2s"
      }}>Try Again</button>
    </div>
  );
}
