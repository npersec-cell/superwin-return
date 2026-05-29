export type UserRole = "user" | "admin";
export type UserStatus = "active" | "suspended" | "banned";
export type LedgerType = "claim" | "predict" | "payout" | "refund" | "fee" | "adjustment";
export type PredictionStatus = "draft" | "open" | "closed" | "resolved" | "canceled";
export type EntryStatus = "running" | "won" | "lost" | "refunded";
export type RewardStatus = "pending" | "contacting" | "completed" | "canceled";

export type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

export type PredictionOptionDto = {
  id: string;
  label: string;
  sortOrder: number;
  estimatedReturnPercent: number;
};

export type PredictionWithOptionsDto = {
  id: string;
  tournamentName: string;
  question: string;
  closesAt: string;
  options: PredictionOptionDto[];
};

export type RunningPredictionDto = {
  id: string;
  predictionId: string;
  question: string;
  tournamentName: string;
  optionLabel: string;
  amount: number;
  estimatedReturnPercent: number | null;
  status: EntryStatus;
  createdAt: string;
};

export type PredictRequestBody = {
  predictionId: string;
  optionId: string;
  amount: number;
};
