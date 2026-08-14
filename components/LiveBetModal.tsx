"use client";

import { maskName } from "@/lib/utils";

export interface LiveBet {
  type?: 'regular' | 'btc';
  userId: string;
  displayName: string | null;
  rawEmailPrefix?: string;
  predictionId?: string;
  predictionTitle?: string;
  tournamentName?: string;
  optionLabel?: string;
  // BTC specific fields
  direction?: 'UP' | 'DOWN';
  entryPrice?: number;
  status?: string;
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

  const isBTC = bet.type === 'btc';

  return (
    <section className="modal" aria-label="Live Bet Details" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth: "400px" }}>
        <div className="modal-head">
          <h3>{isBTC ? "₿ BTC Quick Predict" : "💥 Live Predict Details"}</h3>
          <button className="button" onClick={onClose}>Close</button>
        </div>
        <div className="modal-body" style={{ gap: "14px" }}>

          {isBTC ? (
            // ── BTC Quick Predict View ──
            <>
              {/* User */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ fontSize: "11px", color: "var(--muted)" }}>User</div>
                <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--yellow)" }}>
                  {bet.displayName || maskName(bet.rawEmailPrefix || bet.userId?.slice(0, 8) || 'User')}
                </div>
              </div>

              {/* Direction */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ fontSize: "11px", color: "var(--muted)" }}>Direction</div>
                <div style={{ 
                  fontSize: "18px", 
                  fontWeight: "800", 
                  color: bet.direction === 'UP' ? "var(--green)" : "var(--red)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px"
                }}>
                  {bet.direction === 'UP' ? '🔼 UP' : '🔽 DOWN'}
                  <span style={{ fontSize: "12px", color: "var(--muted)", fontWeight: "600" }}>×1.9</span>
                </div>
              </div>

              {/* Entry Price */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ fontSize: "11px", color: "var(--muted)" }}>Entry Price (BTC)</div>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "var(--text)" }}>
                  ${bet.entryPrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '-'}
                </div>
              </div>

              {/* Stake Amount */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ fontSize: "11px", color: "var(--muted)" }}>Stake</div>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "var(--yellow)" }}>
                  {bet.amount.toLocaleString()} <img src="https://superwinhub.app/ammo-icon.webp" alt="" width="18" height="18" style={{ display: "inline-block", verticalAlign: "middle", marginLeft: "4px" }} />
                </div>
              </div>

              {/* Potential Payout */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ fontSize: "11px", color: "var(--muted)" }}>Potential Win</div>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "var(--green)" }}>
                  {(bet.amount * 1.9).toLocaleString()} <img src="https://superwinhub.app/ammo-icon.webp" alt="" width="18" height="18" style={{ display: "inline-block", verticalAlign: "middle", marginLeft: "4px" }} />
                </div>
              </div>

              {/* Status */}
              {bet.status && bet.status !== 'running' && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ fontSize: "11px", color: "var(--muted)" }}>Result</div>
                  <div style={{ 
                    fontSize: "14px", 
                    fontWeight: "700", 
                    color: bet.status === 'won' ? "var(--green)" : "var(--red)" 
                  }}>
                    {bet.status === 'won' ? '✅ WON' : bet.status === 'lost' ? '❌ LOST' : bet.status}
                  </div>
                </div>
              )}

              {/* Time */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ fontSize: "11px", color: "var(--muted)" }}>Placed at</div>
                <div style={{ fontSize: "12px", color: "var(--text-weak)" }}>
                  {formattedDate}
                </div>
              </div>
            </>
          ) : (
            // ── Regular Prediction View ──
            <>
              {/* User */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ fontSize: "11px", color: "var(--muted)" }}>User</div>
                <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--yellow)" }}>
                  {bet.displayName || maskName(bet.rawEmailPrefix || bet.userId?.slice(0, 8) || 'User')}
                </div>
              </div>

              {/* Tournament */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ fontSize: "11px", color: "var(--muted)" }}>Tournament</div>
                <div style={{ fontSize: "13px", color: "var(--text)" }}>
                  🏆 {bet.tournamentName || 'PUBG Mobile Esports'}
                </div>
              </div>

              {/* Prediction */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ fontSize: "11px", color: "var(--muted)" }}>Prediction</div>
                <div style={{ fontSize: "13px", color: "var(--text)" }}>
                  🎯 {bet.predictionTitle}
                </div>
              </div>

              {/* Option */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ fontSize: "11px", color: "var(--muted)" }}>Option</div>
                <div style={{ fontSize: "13px", color: "var(--text)" }}>
                  🎯 {bet.optionLabel || 'Option'}
                </div>
              </div>

              {/* Amount */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ fontSize: "11px", color: "var(--muted)" }}>Amount</div>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "var(--yellow)" }}>
                  {bet.amount.toLocaleString()} <img src="https://superwinhub.app/ammo-icon.webp" alt="" width="18" height="18" style={{ display: "inline-block", verticalAlign: "middle", marginLeft: "4px" }} />
                </div>
              </div>

              {/* Time */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ fontSize: "11px", color: "var(--muted)" }}>Placed at</div>
                <div style={{ fontSize: "12px", color: "var(--text-weak)" }}>
                  {formattedDate}
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </section>
  );
}
