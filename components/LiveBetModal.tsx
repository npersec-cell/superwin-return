"use client";

import { maskName } from "@/lib/utils";

export interface LiveBet {
  userId: string;
  displayName: string | null;
  rawEmailPrefix?: string;
  predictionId: string;
  predictionTitle: string;
  tournamentName?: string;
  optionLabel: string;
  amount: number;
  createdAt: string;
}

interface LiveBetModalProps {
  bet: LiveBet;
  onClose: () => void;
}

export default function LiveBetModal({ bet, onClose }: LiveBetModalProps) {
  const date = new Date(bet.createdAt);
  const formattedDate = date.toLocaleString("th-TH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });

  return (
    <section className="modal" aria-label="Live Bet Details" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth: "400px" }}>
        <div className="modal-head">
          <h3>💥 Live Predict Details</h3>
          <button className="button" onClick={onClose}>Close</button>
        </div>
        <div className="modal-body" style={{ gap: "14px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ fontSize: "11px", color: "var(--muted)" }}>User</div>
            <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--yellow)" }}>
              {bet.displayName || maskName(bet.rawEmailPrefix || bet.userId?.slice(0, 8) || 'User')}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ fontSize: "11px", color: "var(--muted)" }}>Tournament</div>
            <div style={{ fontSize: "13px", color: "var(--text)" }}>
              🏆 {bet.tournamentName || 'PUBG Mobile Esports'}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ fontSize: "11px", color: "var(--muted)" }}>Prediction</div>
            <div style={{ fontSize: "13px", color: "var(--text)" }}>
              🎯 {bet.predictionTitle}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ fontSize: "11px", color: "var(--muted)" }}>Option</div>
            <div style={{ fontSize: "13px", color: "var(--text)" }}>
              🎯 {bet.optionLabel || 'Option'}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ fontSize: "11px", color: "var(--muted)" }}>Amount</div>
            <div style={{ fontSize: "16px", fontWeight: "700", color: "var(--yellow)" }}>
              {bet.amount.toLocaleString()} <img src="https://superwinhub.app/ammo-icon.webp" alt="" width="18" height="18" style={{ display: "inline-block", verticalAlign: "middle", marginLeft: "4px" }} />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ fontSize: "11px", color: "var(--muted)" }}>Placed at</div>
            <div style={{ fontSize: "12px", color: "var(--text-weak)" }}>
              {formattedDate}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
