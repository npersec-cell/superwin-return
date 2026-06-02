"use client";

import { useUser, SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";

type HistoryItem = {
  month: string;
  date: string;
  time: string;
  action: "Claim" | "Predict" | "Payout" | "Refund";
  detail: string;
  amount: number;
};

type ApiHistoryResponse = {
  ok: boolean;
  data?: {
    rows: Array<HistoryItem & { id: string; balanceAfter: number }>;
  };
  error?: string;
};

function money(amount: number) {
  return `${amount >= 0 ? "+" : ""}${amount}`;
}

function renderHistoryDetail(detail: string) {
  return detail
    .split(" · ")
    .filter((part) => !part.toLowerCase().includes("approx return"))
    .map((part) => <span key={part}>{part}</span>);
}

export default function HistoryPage() {
  const { isSignedIn } = useUser();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyFilter, setHistoryFilter] = useState<"All" | HistoryItem["action"]>("All");
  const [historyLoading, setHistoryLoading] = useState(false);

  async function loadHistory(filter: "All" | HistoryItem["action"] = "All") {
    if (!isSignedIn) return;
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/history?filter=${encodeURIComponent(filter)}`);
      const payload = (await response.json()) as ApiHistoryResponse;
      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error || "Failed to load history");
      }
      setHistory(payload.data.rows);
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (isSignedIn) {
      loadHistory(historyFilter);
    }
  }, [isSignedIn, historyFilter]);

  const filteredHistory =
    historyFilter === "All" ? history : history.filter((item) => item.action === historyFilter);

  return (
    <main className="page">
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <img className="logo" src="/SuperWin_b.png" alt="SuperWin logo" />
            <div className="brand-text">
              <h1>SUPERWIN HUB</h1>
              <span>Prediction Room</span>
            </div>
          </div>
          <div className="actions">
            <Link href="/" className="button gold">
              Back
            </Link>
          </div>
        </header>

        <section className="panel">
          <div className="panel-head">
            <h2>Coin History</h2>
            <span className="micro">
              {isSignedIn ? `${history.length} records` : "Sign in to view"}
            </span>
          </div>
          <div className="modal-body" style={{ maxHeight: "none", minHeight: "300px" }}>
            {!isSignedIn ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px 0",
                  color: "var(--muted)",
                }}
              >
                <p style={{ marginBottom: "16px" }}>
                  Please sign in to view your coin history
                </p>
                <SignInButton mode="modal">
                  <button className="button primary">Sign In</button>
                </SignInButton>
              </div>
            ) : (
              <>
                <div className="filter-row">
                  {(["All", "Predict", "Claim", "Payout"] as const).map((filter) => (
                    <button
                      key={filter}
                      className={`button ${historyFilter === filter ? "active" : ""}`}
                      onClick={() => setHistoryFilter(filter)}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
                <div>
                  {historyLoading ? (
                    <div
                      className="history-row"
                      style={{ justifyContent: "center", padding: "24px 0" }}
                    >
                      <span className="micro" style={{ color: "var(--muted)" }}>
                        Loading...
                      </span>
                    </div>
                  ) : filteredHistory.length ? (
                    filteredHistory.map((row, index) => (
                      <div
                        key={`${row.date}-${row.time}-${index}`}
                        className="history-row"
                      >
                        <span>{row.date}</span>
                        <span>{row.time}</span>
                        <span>{row.action}</span>
                        <span className="history-detail">
                          {renderHistoryDetail(row.detail)}
                        </span>
                        <b className={row.amount >= 0 ? "accent-gold" : "accent-red"}>
                          {money(row.amount)}
                        </b>
                      </div>
                    ))
                  ) : (
                    <div
                      className="history-row"
                      style={{ justifyContent: "center", padding: "24px 0" }}
                    >
                      <span className="micro" style={{ color: "var(--muted)" }}>
                        No {historyFilter} history
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
