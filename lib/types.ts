/**
 * Shared TypeScript types for SuperWin Hub
 * Centralized type definitions used across the application
 */

// ── User & Auth ───────────────────────────────────────

export type UserRole = "user" | "admin";
export type AccountStatus = "active" | "inactive" | "suspended";

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  role: UserRole;
  status: AccountStatus;
  coin_balance: number;
  lifetime_profit: number;
  claim_count: number;
  reload_count: number;
  next_claim_at: string | null;
  last_claim_at: string | null;
  created_at: string;
  updated_at: string;
  avatar_url?: string | null;
}

// ── Predictions ───────────────────────────────────────

export interface Prediction {
  id: string;
  tournament_name: string;
  question: string;
  status: "draft" | "open" | "closed" | "resolved" | "canceled";
  opens_at: string | null;
  closes_at: string;
  fee_rate: number;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PredictionOption {
  id: string;
  prediction_id: string;
  label: string;
  sort_order: number;
}

export interface PredictionEntry {
  id: string;
  user_id: string;
  prediction_id: string;
  option_id: string;
  amount: number;
  payout_amount: number | null;
  status: "running" | "won" | "lost" | "refunded";
  insurance: boolean;
  insurance_cost: number;
  deleted_at?: string | null;
  created_at: string;
}

// ── DTOs (Data Transfer Objects) ─────────────────────

/** Prediction with computed options data for API response */
export interface PredictionWithOptionsDto {
  id: string;
  tournamentName: string;
  question: string;
  closesAt: string;
  totalPool: number;
  playerCount: number;
  options: Array<{
    id: string;
    label: string;
    sortOrder?: number;
    estimatedReturnPercent: number;
  }>;
  entries?: Array<{
    optionId: string;
    userId: string;
    amount: number;
    status: string;
  }>;
}

/** Running prediction entry for user display */
export interface RunningPredictionDto {
  id: string;
  predictionId: string;
  question: string;
  tournamentName: string;
  optionLabel: string;
  amount: number;
  estimatedReturnPercent: number | null;
  status: "running" | "won" | "lost" | "refunded";
  createdAt: string;
}

// ── Coin Ledger ───────────────────────────────────────

export type LedgerType = "claim" | "predict" | "payout" | "refund" | "insurance" | "admin_adjust";
export type LedgerRefType = "claim" | "prediction_entry" | "contest" | "users_table";

export interface CoinLedger {
  id: string;
  user_id: string;
  type: LedgerType;
  amount: number;
  balance_after: number;
  ref_type: LedgerRefType;
  ref_id: string | null;
  detail: string;
  tournament_name?: string | null;
  question?: string | null;
  answer?: string | null;
  created_at: string;
}

// ── Rate Limiting ─────────────────────────────────────

export interface RateLimitLog {
  id: string;
  identifier: string;
  endpoint: string;
  created_at: string;
}

// ── Balance Audit ─────────────────────────────────────

export interface BalanceAuditLog {
  id: string;
  user_id: string;
  action_type: string;
  amount_before: number;
  amount_after: number;
  amount_delta: number;
  ref_type: string | null;
  ref_id: string | null;
  detail: string;
  performed_by: string | null;
  created_at: string;
}

// ── Leaderboard ───────────────────────────────────────

export interface LeaderboardUserStats {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  profitScore: number;       // coin_balance
  predictionCount: number;   // unique questions predicted
  highestSingleWin: number;  // max profit from single bet
  avgClaimPerDay: number;    // claim_count / daysSinceCreated
  overall?: number;          // average of 4 percentiles
  orangePct?: number;
  predPct?: number;
  winPct?: number;
  activePct?: number;
  hasActivity?: boolean;
}

export interface LeaderboardRank {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  value: number;
  profitScore?: number;
}

// ── Contest ───────────────────────────────────────────

export interface Contest {
  id: string;
  name: string;
  description: string;
  status: "draft" | "active" | "ended";
  start_time: string;
  end_time: string;
  prize_1?: string;
  prize_2?: string;
  prize_3?: string;
  prize_4?: string;
  prize_5?: string;
  created_at: string;
  updated_at: string;
}

// ── Site Settings ─────────────────────────────────────

export interface SiteSettings {
  info: {
    content: string;
  };
  tournaments: (string | { name: string; logoUrl: string })[];
  savedQuestions: string[];
  predictionOrder?: string[];
  announcement?: string;
}

// ── API Response Types ────────────────────────────────

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface ApiMeResponse {
  ok: boolean;
  data?: {
    id: string;
    email: string;
    displayName: string | null;
    role: UserRole;
    coinBalance: number;
    lifetimeProfit: number;
    nextClaimAt: string | null;
  };
  error?: string;
}

export interface ApiClaimResponse {
  ok: boolean;
  data?: {
    amount: number;
    user: {
      coinBalance: number;
      lifetimeProfit: number;
      lastClaimAt: string | null;
      nextClaimAt: string | null;
    };
    ledger?: {
      id: string;
      type: string;
      amount: number;
      balance_after: number;
      detail: string;
      created_at: string;
    };
  };
  error?: string;
}

export interface ApiPredictResponse {
  ok: boolean;
  data?: {
    user: {
      coinBalance: number;
      lifetimeProfit: number;
    };
    entry: {
      id: string;
      predictionId: string;
      optionId: string;
      amount: number;
      estimatedReturnPercent: number;
      status: "running";
      question: string;
      tournamentName: string;
      optionLabel: string;
    };
  };
  error?: string;
}

// ── Frontend Component Props ──────────────────────────

export type Question = {
  id: string;
  tournament: string;
  title: string;
  closeOffsetMinutes?: number;
  closesAt?: string;
  totalPool: number;
  playerCount: number;
  options: Array<{ id: string; name: string; returns: number }>;
  entries?: Array<{ optionId: string; userId: string; amount: number; status: string }>;
};

export type HistoryItem = {
  date: string;
  time: string;
  action: "Reload" | "Payout" | "Refund";
  detail: string;
  amount: number;
};

export type LiveBet = {
  userId: string;
  displayName: string;
  predictionId: string;
  predictionTitle: string;
  tournamentName: string;
  optionName: string;
  amount: number;
  createdAt: string;
};
