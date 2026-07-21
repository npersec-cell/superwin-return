/**
 * Utility functions for SuperWin Hub
 * Centralized helpers for common operations
 */

// ── Number Formatting ───────────────────────────────

/** Format number with compact notation (e.g., 1200 → "1.2k") */
export function compact(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

/** Format number with sign prefix (e.g., 100 → "+100") */
export function signed(n: number): string {
  return `${n >= 0 ? "+" : ""}${n}`;
}

/** Safe number conversion — returns 0 for NaN/null/undefined */
export function safeNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isNaN(num) || value === null || value === undefined ? fallback : num;
}

/** Check if value is a valid finite number */
export function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && !Number.isNaN(value);
}

// ── Name Masking ─────────────────────────────────────

/** Mask name by replacing last 2 chars with "xx" */
export function maskName(name: string): string {
  if (!name) return "";
  if (name === "You") return name;
  if (name.length <= 2) return name + "xx";
  return name.slice(0, -2) + "xx";
}

// ── Time Utilities ───────────────────────────────────

/** Format milliseconds to MM:SS */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60000);
  const seconds = Math.floor((Math.max(0, ms) % 60000) / 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Format countdown for question deadlines */
export function formatCountdown(remainingMs: number): string {
  const days = Math.floor(remainingMs / 86400000);
  const hours = Math.floor((remainingMs % 86400000) / 3600000);
  const minutes = Math.floor((remainingMs % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Get days since a date */
export function daysSince(date: string | Date): number {
  const then = new Date(date).getTime();
  const now = Date.now();
  return Math.max(1, Math.floor((now - then) / (1000 * 60 * 60 * 24)));
}

// ── LocalStorage Helpers ─────────────────────────────

/** Safely read from localStorage with fallback */
export function readLocalStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Safely write to localStorage */
export function writeLocalStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable — ignore silently
  }
}

// ── Array Utilities ──────────────────────────────────

/** Get unique values from array using Set */
export function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

/** Group array items by key */
export function groupBy<T, K extends string>(
  arr: T[],
  getKey: (item: T) => K
): Record<K, T[]> {
  return arr.reduce((acc, item) => {
    const key = getKey(item);
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {} as Record<K, T[]>);
}

// ── Percentile Calculation ───────────────────────────

/** Calculate percentile rank (0-100), higher value = higher percentile */
export function getPercentile(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 0;
  const sorted = [...allValues].sort((a, b) => a - b);
  const rank = sorted.filter(v => v < value).length + 1;
  return (rank / allValues.length) * 100;
}

// ── Debounce / Throttle ──────────────────────────────

/** Debounce function — delays execution until after wait ms */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), wait);
  };
}

/** Throttle function — limits execution to once per interval */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => { inThrottle = false; }, limit);
    }
  };
}

// ── Rank Calculation ─────────────────────────────────

type RankInfo = { name: string; icon: string };

/** Get rank name and icon based on position and total users */
export function getRankFromPosition(rank: number, totalUsers: number): RankInfo {
  if (!totalUsers || totalUsers === 0) return { name: "Bronze", icon: "/ranks/bronze.png" };
  if (rank === 1) return { name: "Crown", icon: "/ranks/crown.png" };

  const minForTier = (tierPercent: number) => Math.max(1, Math.ceil(totalUsers * tierPercent / 100));

  const minConqueror = Math.max(2, minForTier(3));
  if (rank <= minConqueror) return { name: "Conqueror", icon: "/ranks/conqueror.png" };

  const minAce = Math.max(3, minForTier(8));
  if (rank <= minAce) return { name: "Ace", icon: "/ranks/ace.png" };

  const minDiamond = Math.max(5, minForTier(15));
  if (rank <= minDiamond) return { name: "Diamond", icon: "/ranks/diamond.png" };

  const percentile = ((totalUsers - rank) / totalUsers) * 100;
  if (percentile >= 50) return { name: "Platinum", icon: "/ranks/platinum.png" };
  if (percentile >= 40) return { name: "Gold", icon: "/ranks/gold.png" };
  if (percentile >= 15) return { name: "Silver", icon: "/ranks/silver.png" };
  return { name: "Bronze", icon: "/ranks/bronze.png" };
}

// ── Claim Amount Distribution ────────────────────────

/** Weighted random claim amount: 10-100 coins, 100 is rarest */
export function randomClaimAmount(): number {
  const r = Math.random();
  if (r < 0.50) return Math.floor(Math.random() * 21) + 10;       // 10-30 (50%)
  if (r < 0.80) return Math.floor(Math.random() * 30) + 31;       // 31-60 (30%)
  if (r < 0.95) return Math.floor(Math.random() * 30) + 61;       // 61-90 (15%)
  return Math.floor(Math.random() * 10) + 91;                      // 91-100 (5%)
}

// ── Insurance Cost (deprecated but kept for reference) ─

/** @deprecated Insurance feature removed — kept for historical reference */
export function getInsuranceCost(betAmount: number): number {
  const safeAmount = Math.max(betAmount, 10);
  const rate = Math.max(0.05, 0.20 - Math.log10(safeAmount / 10) * 0.05);
  return Math.max(Math.floor(betAmount * rate), 1);
}
