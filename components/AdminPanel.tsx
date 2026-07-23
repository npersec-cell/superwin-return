"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type AdminPrediction = {
  id: string;
  tournamentName: string;
  question: string;
  status: string;
  opensAt: string | null;
  closesAt: string | null;
  feeRate: number;
  createdAt: string;
  entryCount: number;
  options: { id: string; label: string; sortOrder: number }[];
};

type AdminUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: "admin";
  createdAt: string;
};

type DashboardPrediction = {
  id: string;
  tournamentName: string;
  question: string;
  status: string;
  closesAt: string | null;
  createdAt: string;
  totalPoolCoins: number;
  uniquePlayers: number;
  optionStats: {
    id: string;
    label: string;
    totalCoins: number;
    playerCount: number;
    multiplier: number;
  }[];
  playerBets: {
    id: string;
    email: string;
    displayName: string;
    userId?: string;
    optionLabel: string;
    amount: number;
    createdAt: string;
  }[];
};

type TournamentItem = {
  name: string;
  logoUrl: string;
  archived?: boolean;
};

type SiteSettings = {
  info: {
    howToPlay: string;
    questionTime: string;
  };
  tournaments: (string | TournamentItem)[];
  savedQuestions: string[];
  savedRounds: string[];
  predictionOrder?: string[];
  announcement?: string;
};

type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

type OptionSet = {
  id: string;
  name: string;
  options: string[];
  createdAt: string;
};

function toDateTimeLocal(value: Date) {
  const offset = value.getTimezoneOffset();
  const local = new Date(value.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function displayDate(value: string | null) {
  if (!value) return "--";
  return new Date(value).toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok"
  });
}

function statusLabel(status: string) {
  if (status === "open") return "Open";
  if (status === "closed") return "Closed";
  if (status === "resolved") return "Resolved";
  if (status === "canceled") return "Canceled";
  if (status === "draft") return "Draft";
  return status;
}

const defaultSettings: SiteSettings = {
  info: {
    howToPlay: "ล็อกอิน ➔ กดรับcoinsฟรีทุก 1 ชั่วโมง ➔ Pickวิเคราะห์ทีมที่ชอบ ➔ ใส่จำนวนcoinsแล้วกดยืนยันคำทายผล",
    questionTime: "แต่ละQuestionมีเวลานับถอยหลังปิดรับทายแยกอิสระ เมื่อปิดทายผลแล้วAdminsจะทำการสรุปและแจกPaidcoinsรางวัลสุทธิทันที"
  },
  tournaments: [{ name: "Super League", logoUrl: "" }],
  savedQuestions: [
    "Which team will win the championship?",
    "Which team will get the Chicken Dinner?",
    "Who will get the most kills in this match?"
  ],
  savedRounds: [
    "แบ่งกลุ่ม",
    "รอบ 16 ทีม",
    "รอบ 8 ทีม",
    "รอบชิงWonเลิศ"
  ],
  announcement: "Welcome to SUPERWIN HUB! Claim your free coins every hour and predict live matches to reach the All time Top 10!"
};

function isRunningNow(item: AdminPrediction) {
  if (item.status !== "open") return false;
  if (!item.closesAt) return true;
  return new Date(item.closesAt).getTime() > Date.now();
}

function isPendingResult(item: AdminPrediction) {
  if (item.status === "closed") return true;
  if (item.status === "open") {
    if (!item.closesAt) return false;
    return new Date(item.closesAt).getTime() <= Date.now();
  }
  return false;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const targetUrl = `${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`;
  const response = await fetch(targetUrl, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(init?.headers || {})
    }
  });
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    const shortText = text.replace(/\s+/g, " ").slice(0, 120);
    throw new Error(`API ${url} ไม่ได้ตอบ JSON (status ${response.status}, type ${contentType || "none"}) ${shortText}`);
  }
  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !payload.ok || payload.data === undefined) {
    // Include validation details if available
    const detailStr = (payload as any).details?.length
      ? `\n→ ${(payload as any).details.join(", ")}`
      : "";
    throw new Error(`API ${url}: ${payload.error || "Operation failed"}${detailStr}`);
  }
  return payload.data;
}

function getTournamentInfo(t: string | TournamentItem) {
  if (typeof t === "string") return { name: t, logoUrl: "", archived: false };
  return { name: t.name, logoUrl: t.logoUrl || "", archived: t.archived || false };
}

export default function AdminPanel({ adminEmail }: { adminEmail: string }) {
  const [predictions, setPredictions] = useState<AdminPrediction[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [tournamentName, setTournamentName] = useState("");
  const [question, setQuestion] = useState("");
  const [round, setRound] = useState("");
  const [opensAt, setOpensAt] = useState(toDateTimeLocal(new Date()));
  const [closesAt, setClosesAt] = useState(toDateTimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [feeRate, setFeeRate] = useState("0.03");
  const [optionInput, setOptionInput] = useState("");
  const [adminEmailInput, setAdminEmailInput] = useState("");
  const [newTournamentInput, setNewTournamentInput] = useState("");
  const [newTournamentLogoUrl, setNewTournamentLogoUrl] = useState("");
  const [optionsBulkInput, setOptionsBulkInput] = useState("");
  const [showBulkOptions, setShowBulkOptions] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardPrediction[]>([]);
  const [selectedDashboardId, setSelectedDashboardId] = useState<string | null>(null);
  const [selectedDashboardTournament, setSelectedDashboardTournament] = useState("");
  const [draftOptions, setDraftOptions] = useState<string[]>([]);
  const [savedOptionSets, setSavedOptionSets] = useState<OptionSet[]>([]);
  const [showSaveOptionSet, setShowSaveOptionSet] = useState(false);
  const [optionSetNameInput, setOptionSetNameInput] = useState("");
  const [editingOptionSetId, setEditingOptionSetId] = useState<string | null>(null);
  const [editOptionSetNameInput, setEditOptionSetNameInput] = useState("");
  const [winningOptions, setWinningOptions] = useState<Record<string, string>>({});
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [editTemplateInput, setEditTemplateInput] = useState("");
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  const [showArchived, setShowArchived] = useState(false);
  const [topUsers, setTopUsers] = useState<Array<{ id: string; email: string; displayName: string; lifetimeProfit?: number }>>([]);
  const [editClosesAt, setEditClosesAt] = useState<Record<string, string>>({});
  const [editQuestions, setEditQuestions] = useState<Record<string, string>>({});
  const [editOptionsInputs, setEditOptionsInputs] = useState<Record<string, Record<string, string>>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTournamentNames, setEditTournamentNames] = useState<Record<string, string>>({});

  // ── Payout breakdown for resolved predictions ──
  interface PayoutParticipant {
    userId: string;
    userName: string;
    optionId: string | null;
    optionLabel: string;
    betAmount: number;
    status: string;
    payoutAmount: number;
    insuranceCost: number;
    insuranceRefund: number;  // Add this field
    hasInsurance: boolean;
  }
  interface PayoutSummary {
    totalPool: number;
    feeRate: number;
    feeTaken: number;
    distributablePool: number;
    totalDistributed: number;
    totalInsuranceRefunded: number;
    winnersCount: number;
    losersCount: number;
    entryCount: number;
    verificationOk: boolean;
    roundingDifference: number;
  }
  interface PayoutData {
    prediction: { id: string; question: string; tournamentName: string; winningOptionLabel: string | null };
    summary: PayoutSummary;
    participants: PayoutParticipant[];
  }
  const [expandedPayoutId, setExpandedPayoutId] = useState<string | null>(null);
  const [payoutDetails, setPayoutDetails] = useState<Record<string, PayoutData>>({});
  const [payoutLoading, setPayoutLoading] = useState<Record<string, boolean>>({});

  async function togglePayoutDetails(predictionId: string) {
    if (expandedPayoutId === predictionId) {
      setExpandedPayoutId(null);
      return;
    }
    setExpandedPayoutId(predictionId);
    if (payoutDetails[predictionId]) return; // already loaded
    setPayoutLoading((prev) => ({ ...prev, [predictionId]: true }));
    try {
      const res = await fetch(`/api/admin/predictions/${predictionId}/payouts`);
      const payload = await res.json();
      if (res.ok && payload.ok && payload.data) {
        setPayoutDetails((prev) => ({ ...prev, [predictionId]: payload.data }));
      } else {
        console.error("[Payouts]", payload.error);
      }
    } catch (err) {
      console.error("[Payouts] fetch error", err);
    } finally {
      setPayoutLoading((prev) => ({ ...prev, [predictionId]: false }));
    }
  }

  // แท็บเมนูหลังบ้าน
  const [activeTab, setActiveTab] = useState<"questions" | "running" | "settings" | "admins" | "tournaments" | "dashboard" | "reports" | "users" | "contests" | "chat">("dashboard");
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSort, setUserSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "createdAt", dir: "desc" });
  const [userPage, setUserPage] = useState(1);
  const [reports, setReports] = useState<any[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [contests, setContests] = useState<any[]>([]);
  const [contestsLoading, setContestsLoading] = useState(false);
  const [showNewContestForm, setShowNewContestForm] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeScheduleStart, setYoutubeScheduleStart] = useState("");
  const [youtubeScheduleEnd, setYoutubeScheduleEnd] = useState("");
  const [frontendEnabled, setFrontendEnabled] = useState(true);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [showEditContestForm, setShowEditContestForm] = useState(false);
  const [editingContestId, setEditingContestId] = useState<string | null>(null);
  const [newContestName, setNewContestName] = useState("");
  const [newContestDescription, setNewContestDescription] = useState("");
  const [newContestEndTime, setNewContestEndTime] = useState(() => {
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [newContestPrize1, setNewContestPrize1] = useState("");
  const [newContestPrize2, setNewContestPrize2] = useState("");
  const [newContestPrize3, setNewContestPrize3] = useState("");
  const [newContestPrize4, setNewContestPrize4] = useState("");
  const [newContestPrize5, setNewContestPrize5] = useState("");

  async function handleCreateContest() {
    if (!newContestName.trim() || !newContestEndTime || !newContestPrize1.trim()) {
      alert("กรุณากรอกข้อมูลให้ครบถ้วน (ชื่อกิจกรรม, End Time, 1st Prize)");
      return;
    }
    try {
      const response = await fetch("/api/admin/contests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newContestName.trim(),
          description: newContestDescription.trim(),
          end_time: newContestEndTime.replace(" ", "T") + ":00", // GMT+7
          prize_1: newContestPrize1.trim(),
          prize_2: newContestPrize2.trim() || null,
          prize_3: newContestPrize3.trim() || null,
          prize_4: newContestPrize4.trim() || null,
          prize_5: newContestPrize5.trim() || null,
        }),
      });
      const payload = await response.json();
      if (payload.ok) {
        setShowNewContestForm(false);
        setNewContestName("");
        setNewContestDescription("");
        setNewContestEndTime(() => {
          const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          return d.toISOString().slice(0, 16);
        });
        setNewContestPrize1("");
        setNewContestPrize2("");
        setNewContestPrize3("");
        setNewContestPrize4("");
        setNewContestPrize5("");
        loadContests();
      } else {
        alert("Failed to create contest: " + (payload.error || ""));
      }
    } catch {
      alert("Failed to create contest");
    }
  }

  async function handleEditContest() {
    if (!newContestName.trim() || !newContestEndTime || !newContestPrize1.trim()) {
      alert("กรุณากรอกข้อมูลให้ครบถ้วน (ชื่อกิจกรรม, End Time, 1st Prize)");
      return;
    }
    if (!editingContestId) {
      alert("ไม่พบกิจกรรมที่จะEdit");
      return;
    }
    try {
      const response = await fetch("/api/admin/contests", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingContestId,
          name: newContestName.trim(),
          description: newContestDescription.trim(),
          end_time: newContestEndTime.replace(" ", "T") + ":00", // GMT+7
          prize_1: newContestPrize1.trim(),
          prize_2: newContestPrize2.trim() || null,
          prize_3: newContestPrize3.trim() || null,
          prize_4: newContestPrize4.trim() || null,
          prize_5: newContestPrize5.trim() || null,
        }),
      });
      const payload = await response.json();
      if (payload.ok) {
        setShowEditContestForm(false);
        setEditingContestId(null);
        setNewContestName("");
        setNewContestDescription("");
        setNewContestEndTime(() => {
          const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          return d.toISOString().slice(0, 16);
        });
        setNewContestPrize1("");
        setNewContestPrize2("");
        setNewContestPrize3("");
        setNewContestPrize4("");
        setNewContestPrize5("");
        loadContests();
      } else {
        alert("Editกิจกรรมไม่successfully: " + (payload.error || ""));
      }
    } catch {
      alert("Editกิจกรรมไม่successfully");
    }
  }

  const [localOrder, setLocalOrder] = useState<string[]>([]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage("");
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // Load saved option sets from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("superwin_option_sets");
      if (raw) setSavedOptionSets(JSON.parse(raw));
    } catch {
      // ignore parse errors
    }
  }, []);

  useEffect(() => {
    const list = predictions.filter(isRunningNow);
    const order = settings.predictionOrder || [];
    const sorted = [...list].sort((a, b) => {
      const idxA = order.indexOf(a.id);
      const idxB = order.indexOf(b.id);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
    setLocalOrder(sorted.map(p => p.id));
  }, [predictions, settings.predictionOrder]);

  const sortedRunningPredictions = useMemo(() => {
    const list = predictions.filter(isRunningNow);
    return [...list].sort((a, b) => {
      const idxA = localOrder.indexOf(a.id);
      const idxB = localOrder.indexOf(b.id);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }, [predictions, localOrder]);

  const runningPredictions = useMemo(() => predictions.filter(isRunningNow), [predictions]);
  const pendingPredictions = useMemo(() => predictions.filter(isPendingResult), [predictions]);
  const resolvedPredictions = useMemo(() => predictions.filter((item) => item.status === "resolved"), [predictions]);

  // การแบ่งหน้าสำหรับQuestionที่กำลังรัน
  const [runningPage, setRunningPage] = useState(1);
  const [runningTournamentFilter, setRunningTournamentFilter] = useState("");
  const runningPageSize = 5;

  const filteredRunningPredictions = useMemo(() => {
    if (!runningTournamentFilter) return [];
    return sortedRunningPredictions.filter(p => p.tournamentName === runningTournamentFilter);
  }, [sortedRunningPredictions, runningTournamentFilter]);

  const runningTotalPages = Math.max(1, Math.ceil(filteredRunningPredictions.length / runningPageSize));
  const currentRunning = useMemo(() => {
    const start = (runningPage - 1) * runningPageSize;
    return filteredRunningPredictions.slice(start, start + runningPageSize);
  }, [filteredRunningPredictions, runningPage]);

  useEffect(() => {
    setRunningPage(1);
  }, [runningTournamentFilter]);

  // การแบ่งหน้าสำหรับQuestionที่หมดเวลา รอคำตอบ
  const [pendingPage, setPendingPage] = useState(1);
  const pendingPageSize = 5;
  const filteredPendingPredictions = useMemo(() => {
    if (!runningTournamentFilter) return pendingPredictions;
    return pendingPredictions.filter(p => p.tournamentName === runningTournamentFilter);
  }, [pendingPredictions, runningTournamentFilter]);
  const pendingTotalPages = Math.max(1, Math.ceil(filteredPendingPredictions.length / pendingPageSize));
  const currentPending = useMemo(() => {
    const start = (pendingPage - 1) * pendingPageSize;
    return filteredPendingPredictions.slice(start, start + pendingPageSize);
  }, [filteredPendingPredictions, pendingPage]);

  useEffect(() => { setPendingPage(1); }, [runningTournamentFilter]);

  // การแบ่งหน้าสำหรับQuestionที่Resolved
  const [resolvedPage, setResolvedPage] = useState(1);
  const resolvedPageSize = 5;
  const filteredResolvedPredictions = useMemo(() => {
    if (!runningTournamentFilter) return resolvedPredictions;
    return resolvedPredictions.filter(p => p.tournamentName === runningTournamentFilter);
  }, [resolvedPredictions, runningTournamentFilter]);
  const resolvedTotalPages = Math.max(1, Math.ceil(filteredResolvedPredictions.length / resolvedPageSize));
  const currentResolved = useMemo(() => {
    const start = (resolvedPage - 1) * resolvedPageSize;
    return filteredResolvedPredictions.slice(start, start + resolvedPageSize);
  }, [filteredResolvedPredictions, resolvedPage]);

  useEffect(() => { setResolvedPage(1); }, [runningTournamentFilter]);

  // การแบ่งหน้าสำหรับQuestionทั้งหมด
  const [allPage, setAllPage] = useState(1);
  const allPageSize = 5;
  const allTotalPages = Math.max(1, Math.ceil(predictions.length / allPageSize));
  const currentAll = useMemo(() => {
    const start = (allPage - 1) * allPageSize;
    return predictions.slice(start, start + allPageSize);
  }, [predictions, allPage]);


  async function loadPredictions() {
    const data = await requestJson<AdminPrediction[]>("/api/admin/predictions");
    setPredictions(data);
  }

  async function loadAdmins() {
    const data = await requestJson<any[]>("/api/admin/users");
    const adminsOnly = data
      .filter((u) => u.isAdmin)
      .map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.name || null,
        role: "admin" as const,
        createdAt: u.createdAt || new Date().toISOString(),
      }));
    setAdmins(adminsOnly);
  }

  async function loadSettings() {
    const data = await requestJson<SiteSettings>("/api/admin/settings");
    setSettings(data);
  }

  async function loadTopUsers() {
    const data = await requestJson<Array<{ id: string; email: string; displayName: string }>>("/api/admin/leaderboard");
    setTopUsers(data);
  }

  async function loadDashboardData() {
    const data = await requestJson<DashboardPrediction[]>("/api/admin/dashboard");
    setDashboardData(data);
    if (data.length > 0) {
      if (!selectedDashboardTournament) {
        setSelectedDashboardTournament(data[0].tournamentName);
      }
      // NOTE: Do NOT auto-initialize tournamentName from dashboard data.
      // That caused bugs where new questions were saved under the wrong tournament
      // (data[0] = newest prediction, not necessarily the desired tournament).
      // Admin must explicitly select a tournament from the dropdown.
    }
  }

  async function loadReports() {
    try {
      setReportsLoading(true);
      const response = await fetch("/api/admin/reports");
      const payload = await response.json();
      if (response.ok && payload.ok && payload.data) {
        setReports(payload.data);
      }
    } catch {
      // Ignored
    } finally {
      setReportsLoading(false);
    }
  }

  async function loadContests() {
    try {
      setContestsLoading(true);
      const response = await fetch("/api/admin/contests");
      const payload = await response.json();
      if (response.ok && payload.ok && payload.data) {
        setContests(payload.data);
      }
    } catch {
      // Ignored
    } finally {
      setContestsLoading(false);
    }
  }

  async function handleUpdateReport(id: string, status: "pending" | "resolved", isDelete = false) {
    try {
      const response = await fetch("/api/admin/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, delete: isDelete })
      });
      const payload = await response.json();
      if (response.ok && payload.ok) {
        await loadReports();
      } else {
        alert(payload.error || "Operation failed");
      }
    } catch {
      alert("Network error occurred");
    }
  }

  async function loadChatMessages() {
    setChatLoading(true);
    try {
      const data = await requestJson<any[]>('/api/admin/chat?limit=200');
      setChatMessages(data || []);
    } catch (e) {
      console.error('Failed to load chat:', e);
    } finally {
      setChatLoading(false);
    }
  }

  async function deleteChatMessage(id: string) {
    if (!confirm('Deleteข้อความนี้?')) return;
    try {
      const res = await fetch(`/api/chat/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setChatMessages(prev => prev.filter(m => m.id !== id));
      } else {
        alert('Deleteไม่successfully');
      }
    } catch {
      alert('An error occurred');
    }
  }

  async function reloadAll() {
    await Promise.all([loadPredictions(), loadAdmins(), loadSettings(), loadTopUsers(), loadDashboardData()]);
  }

  useEffect(() => {
    reloadAll().catch((error) => setMessage(error.message));
  }, []);

  async function loadYoutubeEmbed() {
    try {
      const res = await fetch('/api/settings');
      const json = await res.json();
      if (json.ok && json.data) {
        // Load YouTube embed code or URL
        if (json.data.youtube_embed?.embed_code) {
          // Try to extract URL from embed code for display
          const urlMatch = json.data.youtube_embed.embed_code.match(/src="([^"]+)"/);
          if (urlMatch) {
            setYoutubeUrl(urlMatch[1]);
          }
        }
        // Load YouTube URL directly (new format)
        if (json.data.youtube_embed?.url) {
          setYoutubeUrl(json.data.youtube_embed.url);
        }
        // Load schedule times
        if (json.data.youtube_embed?.schedule_start) {
          setYoutubeScheduleStart(json.data.youtube_embed.schedule_start);
        }
        if (json.data.youtube_embed?.schedule_end) {
          setYoutubeScheduleEnd(json.data.youtube_embed.schedule_end);
        }
        // Load frontend features enabled state
        if (json.data.frontend_features !== undefined) {
          setFrontendEnabled(!!json.data.frontend_features.enabled);
        }
      }
    } catch (e) {
      console.error('Failed to load YouTube embed:', e);
    }
  }

  async function saveFrontendSettings() {
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'frontend_features', value: { enabled: frontendEnabled } }),
      });
      const payload = await res.json();
      if (res.ok && payload.ok) {
        alert('Saved successfully');
      } else {
        alert('Failed to save: ' + (payload.error || res.status));
      }
    } catch (e: any) {
      alert('An error occurred: ' + (e?.message || String(e)));
    }
  }

  // Convert YouTube URL to embed iframe code
  function youtubeUrlToEmbed(url: string): string {
    const trimmed = url.trim();
    let videoId = "";

    // Match various YouTube URL formats
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/, // Direct video ID
    ];

    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match && match[1]) {
        videoId = match[1];
        break;
      }
    }

    if (!videoId) {
      return trimmed; // Return as-is if we can't extract video ID
    }

    return `<iframe width="720" height="405" src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=1&rel=0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  }

  async function saveYoutubeEmbed(e?: React.FormEvent) {
    if (e) e.preventDefault();
    try {
      const embedCode = youtubeUrlToEmbed(youtubeUrl);
      const scheduleData: any = {
        enabled: true,
        url: youtubeUrl,
        embed_code: embedCode,
      };
      // Only include schedule times if both are set
      if (youtubeScheduleStart) scheduleData.schedule_start = youtubeScheduleStart;
      if (youtubeScheduleEnd) scheduleData.schedule_end = youtubeScheduleEnd;

      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'youtube_embed', value: scheduleData }),
      });
      if (res.ok) {
        alert('Savesuccessfully');
      } else {
        alert('Saveไม่successfully');
      }
    } catch {
      alert('An error occurred');
    }
  }

  useEffect(() => {
    if (activeTab !== "dashboard") return;
    loadYoutubeEmbed();
    loadDashboardData().catch(() => undefined);
    const timer = setInterval(() => {
      loadDashboardData().catch(() => undefined);
    }, 10000);
    return () => clearInterval(timer);
  }, [activeTab]);

  async function loadUsers() {
    setUsersLoading(true);
    try {
      const data = await requestJson<any[]>("/api/admin/users");
      setUsers(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === "users") loadUsers().catch(() => undefined);
  }, [activeTab]);

  function addOption() {
    const next = optionInput.trim();
    if (!next) return;
    setDraftOptions((current) => [...current, next]);
    setOptionInput("");
  }

  function removeOption(index: number) {
    setDraftOptions((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function usePreviousOptions() {
    const latest = [...predictions].sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    })[0];
    if (!latest || !latest.options.length) {
      setMessage("No previous question found");
      return;
    }
    const labels = latest.options.sort((a, b) => a.sortOrder - b.sortOrder).map((o) => o.label);
    setDraftOptions(labels);
    setMessage(`Copied options from previous question: ${latest.question}`);
  }

  // ── Option Set (ชุดตัวPick) management ───────────────────────
  function persistOptionSets(sets: OptionSet[]) {
    setSavedOptionSets(sets);
    localStorage.setItem("superwin_option_sets", JSON.stringify(sets));
  }

  function saveOptionSet() {
    const name = optionSetNameInput.trim();
    if (!name) {
      setMessage("Please enter option set name");
      return;
    }
    if (draftOptions.length < 2) {
      setMessage("ต้องมีตัวPickอย่างน้อย 2 ข้อถึงจะSaveเป็นชุดได้");
      return;
    }
    const newSet: OptionSet = {
      id: crypto.randomUUID(),
      name,
      options: [...draftOptions],
      createdAt: new Date().toISOString()
    };
    const updated = [...savedOptionSets, newSet];
    persistOptionSets(updated);
    setOptionSetNameInput("");
    setShowSaveOptionSet(false);
    setMessage(`Saveชุด "${name}" แล้ว (${draftOptions.length} ตัวPick)`);
  }

  function loadOptionSet(id: string) {
    const set = savedOptionSets.find((s) => s.id === id);
    if (!set) return;
    setDraftOptions([...set.options]);
    setMessage(`Loaded set "${set.name}" แล้ว (${set.options.length} ตัวPick)`);
  }

  function deleteOptionSet(id: string) {
    const set = savedOptionSets.find((s) => s.id === id);
    if (!set) return;
    if (!window.confirm(`DeleteชุดตัวPick "${set.name}"?`)) return;
    const updated = savedOptionSets.filter((s) => s.id !== id);
    persistOptionSets(updated);
    if (editingOptionSetId === id) {
      setEditingOptionSetId(null);
      setEditOptionSetNameInput("");
    }
    setMessage(`Deleteชุด "${set.name}" แล้ว`);
  }

  function updateOptionSetName(id: string) {
    const name = editOptionSetNameInput.trim();
    if (!name) return;
    const updated = savedOptionSets.map((s) =>
      s.id === id ? { ...s, name } : s
    );
    persistOptionSets(updated);
    setEditingOptionSetId(null);
    setEditOptionSetNameInput("");
    setMessage(`Editชื่อชุดเป็น "${name}" แล้ว`);
  }

  function overwriteOptionSet(id: string) {
    const set = savedOptionSets.find((s) => s.id === id);
    if (!set) return;
    if (
      !window.confirm(
        `Saveทับชุด "${set.name}" ด้วยตัวPickปัจจุบัน (${draftOptions.length} ข้อ)?`
      )
    )
      return;
    const updated = savedOptionSets.map((s) =>
      s.id === id ? { ...s, options: [...draftOptions] } : s
    );
    persistOptionSets(updated);
    setMessage(`Saveทับชุด "${set.name}" แล้ว`);
  }

  async function createPrediction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tournamentName.trim()) {
      setMessage("⚠️ Please select a tournament before creating a question");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const options = draftOptions.map((item) => item.trim()).filter(Boolean);
      const fullQuestion = round.trim() ? `รอบ ${round.trim()} - ${question.trim()}` : question.trim();
      const data = await requestJson<AdminPrediction>("/api/admin/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentName, question: fullQuestion, opensAt, closesAt, feeRate: Number(feeRate), status: "open", options })
      });
      // Auto-sort: insert new prediction ID into predictionOrder by closesAt
      const currentOrder = settings.predictionOrder || [];
      const allPredictions = [...predictions, data];
      const sorted = [...allPredictions].sort((a, b) => {
        const timeA = a.closesAt ? new Date(a.closesAt).getTime() : Infinity;
        const timeB = b.closesAt ? new Date(b.closesAt).getTime() : Infinity;
        return timeA - timeB;
      });
      const newOrder = sorted.map(p => p.id);
      await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ predictionOrder: newOrder })
      });
      setMessage("Question created");
      setQuestion("");
      setRound("");
      setDraftOptions([]);
      setTournamentName("");
      await loadPredictions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create question");
    } finally {
      setLoading(false);
    }
  }

  async function makeAdmin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const data = await requestJson<{ email: string; role: string }>("/api/admin/users/make-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmailInput })
      });
      setMessage(`Added ${data.email} as admin`);
      setAdminEmailInput("");
      await loadAdmins();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AddedAdminsไม่successfully");
    } finally {
      setLoading(false);
    }
  }

  async function addTournament() {
    const name = newTournamentInput.trim();
    if (!name) return;
    const exists = (settings.tournaments || []).some((t) => {
      const tName = typeof t === "string" ? t : t.name;
      return tName.toLowerCase() === name.toLowerCase();
    });
    if (exists) {
      setMessage("Tournament name already exists");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const newTour: TournamentItem = { name, logoUrl: newTournamentLogoUrl };
      const nextTournaments = [...(settings.tournaments || []), newTour];
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournaments: nextTournaments })
      });
      setSettings(data);
      setNewTournamentInput("");
      setNewTournamentLogoUrl("");
      setMessage(`Addedทัวร์นาเมนต์ ${name} successfully`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Addedทัวร์นาเมนต์ไม่successfully");
    } finally {
      setLoading(false);
    }
  }

  async function removeTournament(name: string) {
    const confirmed = window.confirm(`Deleteทัวร์นาเมนต์ "${name}"? (Questionที่มีอยู่จะไม่ถูกDelete แต่ทัวร์นาเมนต์นี้จะไม่ShowในตัวPickสร้างQuestionใหม่)`);
    if (!confirmed) return;
    setLoading(true);
    setMessage("");
    try {
      const nextTournaments = (settings.tournaments || []).filter((t) => {
        const tName = typeof t === "string" ? t : t.name;
        return tName !== name;
      });
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournaments: nextTournaments })
      });
      setSettings(data);
      if (tournamentName === name) {
        const first = data.tournaments?.[0];
        const firstName = typeof first === "string" ? first : (first?.name || "");
        setTournamentName(firstName);
      }
      setMessage(`Deleteทัวร์นาเมนต์ ${name} successfully`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Deleteทัวร์นาเมนต์ไม่successfully");
    } finally {
      setLoading(false);
    }
  }

  async function toggleArchiveTournament(name: string) {
    setLoading(true);
    setMessage("");
    try {
      const nextTournaments = (settings.tournaments || []).map((t) => {
        const tName = typeof t === "string" ? t : t.name;
        if (tName === name) {
          if (typeof t === "string") {
            return { name: t, logoUrl: "", archived: true };
          }
          return { ...t, archived: !t.archived };
        }
        return t;
      });
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournaments: nextTournaments })
      });
      setSettings(data);
      const info = getTournamentInfo(nextTournaments.find((t) => getTournamentInfo(t).name === name) || name);
      setMessage(info.archived ? `Hidden tournament ${name} successfully` : `Showing tournament ${name} successfully`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "อัปเดตสถานะทัวร์นาเมนต์ไม่successfully");
    } finally {
      setLoading(false);
    }
  }

  async function updateTournamentLogo(tName: string, file: File | undefined) {
    if (!file) return;
    compressImage(file, async (b64) => {
      setLoading(true);
      setMessage("");
      try {
        const nextTournaments = (settings.tournaments || []).map((t) => {
          const name = typeof t === "string" ? t : t.name;
          if (name === tName) {
            return { name, logoUrl: b64 };
          }
          return t;
        });
        const data = await requestJson<SiteSettings>("/api/admin/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tournaments: nextTournaments })
        });
        setSettings(data);
        setMessage(`Updated tournament logo "${tName}" successfully`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Update Logoไม่successfully");
      } finally {
        setLoading(false);
      }
    });
  }

  function compressImage(file: File, callback: (b64: string) => void) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = 96; // perfect 1:1 square canvas dimension
        canvas.width = size;
        canvas.height = size;
        
        let scaledWidth = img.width;
        let scaledHeight = img.height;
        
        if (img.width > img.height) {
          scaledWidth = size;
          scaledHeight = Math.round((img.height * size) / img.width);
        } else {
          scaledHeight = size;
          scaledWidth = Math.round((img.width * size) / img.height);
        }
        
        const offsetX = Math.round((size - scaledWidth) / 2);
        const offsetY = Math.round((size - scaledHeight) / 2);
        
        const ctx = canvas.getContext("2d");
        if (ctx) {
          // Clear canvas to ensure perfect transparency
          ctx.clearRect(0, 0, size, size);
          // Draw image beautifully centered with aspect ratio fully preserved
          ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);
          // Export as PNG to support transparent backgrounds (prevents black border issues)
          const b64 = canvas.toDataURL("image/png");
          callback(b64);
        } else {
          callback(String(reader.result || ""));
        }
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  }

  function handleTournamentLogo(file: File | undefined) {
    if (!file) return;
    compressImage(file, (b64) => {
      setNewTournamentLogoUrl(b64);
    });
  }

  function addBulkOptions() {
    const lines = optionsBulkInput.split("\n");
    const parsed = lines.map((l) => l.trim()).filter(Boolean);
    if (parsed.length === 0) return;
    setDraftOptions((current) => [...current, ...parsed]);
    setOptionsBulkInput("");
    setShowBulkOptions(false);
  }

  async function saveQuestionTemplate() {
    const name = question.trim();
    if (!name) return;
    if (settings.savedQuestions?.includes(name)) {
      setMessage("มีQuestionนี้ในระบบแล้ว");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const nextQuestions = [...(settings.savedQuestions || []), name];
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedQuestions: nextQuestions })
      });
      setSettings(data);
      setMessage(`SaveQuestion Templatessuccessfully`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "SaveQuestion Templatesไม่successfully");
    } finally {
      setLoading(false);
    }
  }

  async function removeQuestionTemplate(name: string) {
    const confirmed = window.confirm(`DeleteQuestion Templates "${name}"?`);
    if (!confirmed) return;
    setLoading(true);
    setMessage("");
    try {
      const nextQuestions = (settings.savedQuestions || []).filter((q) => q !== name);
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedQuestions: nextQuestions })
      });
      setSettings(data);
      setMessage(`DeleteQuestion Templatessuccessfully`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "DeleteQuestion Templatesไม่successfully");
    } finally {
      setLoading(false);
    }
  }

  async function renameQuestionTemplate(oldName: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (trimmed === oldName) {
      setEditingTemplate(null);
      return;
    }
    if (settings.savedQuestions?.includes(trimmed)) {
      setMessage("มีชื่อQuestionนี้ในระบบแล้ว");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const nextQuestions = (settings.savedQuestions || []).map((q) => (q === oldName ? trimmed : q));
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedQuestions: nextQuestions })
      });
      setSettings(data);
      setEditingTemplate(null);
      setMessage("EditQuestion Templatessuccessfully");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "EditQuestion Templatesไม่successfully");
    } finally {
      setLoading(false);
    }
  }

  async function saveRoundTemplate() {
    const name = round.trim();
    if (!name) return;
    if (settings.savedRounds?.includes(name)) {
      setMessage("This round already exists");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const nextRounds = [...(settings.savedRounds || []), name];
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedRounds: nextRounds })
      });
      setSettings(data);
      setMessage("SaveRound Templatessuccessfully");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "SaveRound Templatesไม่successfully");
    } finally {
      setLoading(false);
    }
  }

  async function removeRoundTemplate(name: string) {
    const confirmed = window.confirm(`DeleteRound Templates "${name}"?`);
    if (!confirmed) return;
    setLoading(true);
    setMessage("");
    try {
      const nextRounds = (settings.savedRounds || []).filter((r) => r !== name);
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedRounds: nextRounds })
      });
      setSettings(data);
      setMessage("DeleteRound Templatessuccessfully");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "DeleteRound Templatesไม่successfully");
    } finally {
      setLoading(false);
    }
  }

  const [editingRound, setEditingRound] = useState<string | null>(null);
  const [editRoundInput, setEditRoundInput] = useState("");

  async function renameRoundTemplate(oldName: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (trimmed === oldName) {
      setEditingRound(null);
      return;
    }
    if (settings.savedRounds?.includes(trimmed)) {
      setMessage("มีชื่อรอบนี้ในระบบแล้ว");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const nextRounds = (settings.savedRounds || []).map((r) => (r === oldName ? trimmed : r));
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedRounds: nextRounds })
      });
      setSettings(data);
      setEditingRound(null);
      setMessage("EditRound Templatessuccessfully");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "EditRound Templatesไม่successfully");
    } finally {
      setLoading(false);
    }
  }

  async function saveInfoSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ info: settings.info })
      });
      setSettings(data);
      setMessage("Saveข้อความ Info successfully");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save Info ไม่successfully");
    } finally {
      setLoading(false);
    }
  }

  function moveLocalOrder(id: string, direction: "up" | "down") {
    const arr = [...localOrder];
    const idx = arr.indexOf(id);
    if (idx === -1) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= arr.length) return;
    const temp = arr[idx];
    arr[idx] = arr[targetIdx];
    arr[targetIdx] = temp;
    setLocalOrder(arr);
  }

  async function savePredictionOrder() {
    setLoading(true);
    setMessage("");
    try {
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ predictionOrder: localOrder, announcement: settings.announcement })
      });
      setSettings(data);
      setMessage("SaveลำดับQuestionเข้าสู่ระบบsuccessfully");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "SaveลำดับQuestionไม่successfully");
    } finally {
      setLoading(false);
    }
  }

  async function savePredictionEdits(id: string) {
    const newTime = editClosesAt[id];
    const newQuestion = editQuestions[id];
    const newTournament = editTournamentNames[id];

    const updatedOptionsMap = editOptionsInputs[id] || {};
    const updatedOptionsList = Object.entries(updatedOptionsMap).map(([optId, label]) => ({
      id: optId,
      label
    }));

    setLoading(true);
    setMessage("");
    try {
      await requestJson<{ ok: boolean }>(`/api/admin/predictions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(newTournament !== undefined && { tournamentName: newTournament }),
          closesAt: newTime,
          question: newQuestion,
          options: updatedOptionsList
        })
      });
      setMessage("อัปเดตDetailsQuestionและคำตอบsuccessfully");
      setEditingId(null);
      await reloadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "อัปเดตไม่successfully");
    } finally {
      setLoading(false);
    }
  }

  async function saveAnnouncementSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          announcement: settings.announcement
        })
      });
      setSettings(data);
      setMessage("Saveข้อความประกาศวิ่งหน้าแรกsuccessfully");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Saveข้อความประกาศไม่successfully");
    } finally {
      setLoading(false);
    }
  }

  async function removeAdmin(email: string) {
    const confirmed = window.confirm(`Remove admin rights of ${email}?`);
    if (!confirmed) return;
    setLoading(true);
    setMessage("");
    try {
      await requestJson<{ email: string; role: string }>("/api/admin/users/remove-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      setMessage(`Removed ${email} from admin`);
      await loadAdmins();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "RemovedAdminsไม่successfully");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, nextStatus: string) {
    setLoading(true);
    setMessage("");
    try {
      await requestJson<unknown>(`/api/admin/predictions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      setMessage(`Status changed to ${statusLabel(nextStatus)} แล้ว`);
      setPredictions((current) => current.map((item) => item.id === id ? { ...item, status: nextStatus } : item));
      await loadPredictions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "อัปเดตไม่successfully");
    } finally {
      setLoading(false);
    }
  }

  async function deletePrediction(id: string) {
    const confirmed = window.confirm("DeleteQuestionนี้ถาวรออกจากระบบ? (Answer OptionsและentriesทายผลของQuestionนี้ทั้งหมดจะถูกDeleteออกไปด้วย และไม่สามารถย้อนคืนได้)");
    if (!confirmed) return;
    setLoading(true);
    setMessage("");
    try {
      await requestJson<unknown>(`/api/admin/predictions/${id}`, { method: "DELETE" });
      setMessage("DeleteQuestionถาวรเรียบร้อยแล้ว");
      await loadPredictions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "DeleteQuestionไม่successfully");
    } finally {
      setLoading(false);
    }
  }

  async function resolvePrediction(item: AdminPrediction) {
    const winningOptionId = winningOptions[item.id];
    if (!winningOptionId) {
      setMessage("Select winning answerก่อน");
      return;
    }
    const winningLabel = item.options.find((option) => option.id === winningOptionId)?.label || "";
    const confirmed = window.confirm(`ยืนยันResolve?\n\nQuestion: ${item.question}\nWinning answer: ${winningLabel}\n\nAfter confirmation, payout is final and cannot be undone`);
    if (!confirmed) return;

    setLoading(true);
    setMessage("");
    try {
      const data = await requestJson<{ winnersCount: number; totalLosersCount: number; totalPaid: number }>(`/api/admin/predictions/${item.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winningOptionId })
      });
      setMessage(`Resolved: Won ${data.winnersCount || 0}, Lost ${data.totalLosersCount || 0}, Paid ${data.totalPaid || 0}`);
      setPredictions((current) => current.map((row) => row.id === item.id ? { ...row, status: "resolved" } : row));
      await loadPredictions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Resolveไม่successfully");
    } finally {
      setLoading(false);
    }
  }

  async function refundPrediction(item: AdminPrediction) {
    const confirmed = window.confirm(`ยืนยันCancelและคืนcoins?\n\nQuestion: ${item.question}`);
    if (!confirmed) return;

    setLoading(true);
    setMessage("");
    try {
      const data = await requestJson<{ refundedEntries: number; totalRefunded: number }>(`/api/admin/predictions/${item.id}/refund`, { method: "POST" });
      setMessage(`Refunded: ${data.refundedEntries || 0} entries, ${data.totalRefunded || 0} coins`);
      setPredictions((current) => current.map((row) => row.id === item.id ? { ...row, status: "canceled" } : row));
      await loadPredictions();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "คืนcoinsไม่successfully";
      if (msg.includes("No running entries")) {
        setMessage("ไม่มีentriesทายผลที่ต้องคืนcoins (อาจไม่มีผู้เล่นทาย หรือถูกคืนไปแล้ว)");
      } else {
        setMessage(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  function renderPredictionControls(item: AdminPrediction) {
    const disabled = loading || item.status === "resolved" || item.status === "canceled";
    const hasEntries = (item.entryCount || 0) > 0;
    return (
      <div className="admin-actions">
        {item.status !== "open" && item.status !== "resolved" && item.status !== "canceled" && (
          <button className="button gold" disabled={loading} onClick={() => updateStatus(item.id, "open")}>Open for predictions</button>
        )}
        {item.status === "open" && (
          <button className="button" disabled={loading} onClick={() => updateStatus(item.id, "closed")}>Close now</button>
        )}
        {!disabled && (
          <>
            <select className="button" value={winningOptions[item.id] || ""} onChange={(event) => setWinningOptions((current) => ({ ...current, [item.id]: event.target.value }))}>
              <option value="">Select winning answer</option>
              {item.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            <button className="button primary" disabled={disabled} onClick={() => resolvePrediction(item)}>Resolve</button>
            {hasEntries ? (
              <button className="button" disabled={disabled || !hasEntries} onClick={() => refundPrediction(item)}>Cancel + Refund</button>
            ) : (
              <button className="button" type="button" disabled={loading} onClick={() => deletePrediction(item.id)} style={{ color: "#ff4d4f", borderColor: "#ff4d4f", background: "transparent" }}>
                🗑️ Delete Permanently
              </button>
            )}
          </>
        )}
        {(item.status === "resolved" || item.status === "canceled") && (
          <button className="button" type="button" disabled={loading} onClick={() => deletePrediction(item.id)} style={{ color: "#ff4d4f", borderColor: "#ff4d4f", background: "transparent" }}>
            🗑️ Delete Permanently
          </button>
        )}
      </div>
    );
  }

  function renderPayoutBreakdown(item: AdminPrediction) {
    if (item.status !== "resolved") return null;
    const data = payoutDetails[item.id];
    const isLoading = payoutLoading[item.id];
    const isExpanded = expandedPayoutId === item.id;

    return (
      <div style={{ marginTop: "8px" }}>
        <button
          className="button"
          type="button"
          onClick={() => togglePayoutDetails(item.id)}
          style={{
            width: "100%",
            height: "28px",
            fontSize: "10px",
            background: isExpanded ? "rgba(255,225,0,0.08)" : "transparent",
            border: "1px solid var(--hairline)",
            borderRadius: "6px",
            color: "var(--yellow)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "4px"
          }}
        >
          {isExpanded ? "▼" : "▶"} 📊 entriesPaidเงิน ({item.entryCount || 0} people)
        </button>

        {isExpanded && (
          <div style={{
            marginTop: "8px",
            padding: "12px",
            background: "var(--bg)",
            border: "1px solid var(--hairline)",
            borderRadius: "8px",
            display: "grid",
            gap: "10px"
          }}>
            {isLoading && (
              <div style={{ textAlign: "center", color: "var(--muted)", fontSize: "11px", padding: "12px" }}>Loading...</div>
            )}

            {!isLoading && !data && (
              <div style={{ textAlign: "center", color: "var(--muted)", fontSize: "11px", padding: "8px" }}>Unable to load data</div>
            )}

            {!isLoading && data && (
              <>
                {/* ── Summary Bar ── */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                  gap: "8px",
                  padding: "10px",
                  background: "rgba(255,255,255,0.02)",
                  borderRadius: "6px",
                  border: "1px solid var(--hairline)"
                }}>
                  <div style={{ textAlign: "center" }}>
                    <div className="meta" style={{ fontSize: "9px", color: "var(--muted)" }}>Total Pool</div>
                    <strong style={{ fontSize: "13px", color: "var(--yellow)" }}>{data.summary.totalPool.toLocaleString()}</strong>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div className="meta" style={{ fontSize: "9px", color: "var(--muted)" }}>Fee ({Math.round(data.summary.feeRate * 100)}%)</div>
                    <strong style={{ fontSize: "13px", color: "var(--red)" }}>-{data.summary.feeTaken.toLocaleString()}</strong>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div className="meta" style={{ fontSize: "9px", color: "var(--muted)" }}>Paid</div>
                    <strong style={{ fontSize: "13px", color: "var(--green)" }}>{data.summary.totalDistributed.toLocaleString()}</strong>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div className="meta" style={{ fontSize: "9px", color: "var(--muted)" }}>Diff (FLOOR)</div>
                    <strong style={{ fontSize: "11px", color: data.summary.roundingDifference === 0 ? "var(--green)" : "var(--yellow)" }}>
                      {data.summary.roundingDifference === 0 ? "0 ✅" : `${data.summary.roundingDifference > 0 ? "+" : ""}${data.summary.roundingDifference}`}
                    </strong>
                  </div>
                </div>

                {/* ── Verification ── */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 12px",
                  background: data.summary.verificationOk ? "rgba(14,203,129,0.06)" : "rgba(240,84,84,0.06)",
                  border: `1px solid ${data.summary.verificationOk ? "rgba(14,203,129,0.3)" : "rgba(240,84,84,0.3)"}`,
                  borderRadius: "6px",
                  fontSize: "11px"
                }}>
                  <span style={{ fontSize: "16px" }}>{data.summary.verificationOk ? "✅" : "⚠️"}</span>
                  <span style={{ color: data.summary.verificationOk ? "var(--green)" : "var(--red)", fontWeight: "bold" }}>
                    {data.summary.verificationOk
                      ? `แจกPaidถูกต้อง — Paidทั้งหมด ${data.summary.totalDistributed.toLocaleString()} coins จาก pool ${data.summary.totalPool.toLocaleString()} (${Math.round(data.summary.feeRate * 100)}% fee = ${data.summary.feeTaken.toLocaleString()})`
                      : `⚠️ Diff ${Math.abs(data.summary.roundingDifference)} coins — ตรวจสอบอีกครั้ง`
                    }
                  </span>
                </div>

                {/* ── Participant List ── */}
                <div style={{ fontSize: "10px", color: "var(--muted)", fontWeight: "bold" }}>
                  ▸ Participants ({data.participants.length} people) — Won {data.summary.winnersCount} · Lost {data.summary.losersCount}
                </div>
                <div style={{
                  display: "grid",
                  gap: "4px",
                  maxHeight: "200px",
                  overflowY: "auto"
                }}>
                  {/* Header */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 80px 120px 70px 70px",
                    gap: "6px",
                    padding: "4px 8px",
                    fontSize: "9px",
                    color: "var(--muted)",
                    fontWeight: "bold",
                    borderBottom: "1px solid var(--hairline)"
                  }}>
                    <span>User</span>
                    <span>Pick</span>
                    <span>Option</span>
                    <span style={{ textAlign: "right" }}>Bet</span>
                    <span style={{ textAlign: "right" }}>Result</span>
                  </div>

                  {/* Rows - sort by won first, then by amount desc */}
                  {[...data.participants]
                    .sort((a, b) => {
                      if (a.status === "won" && b.status !== "won") return -1;
                      if (a.status !== "won" && b.status === "won") return 1;
                      return b.betAmount - a.betAmount;
                    })
                    .map((p) => (
                    <div key={p.userId} style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 80px 120px 70px 70px",
                      gap: "6px",
                      padding: "5px 8px",
                      fontSize: "10px",
                      background: p.status === "won" ? "rgba(14,203,129,0.04)" : "transparent",
                      borderRadius: "4px",
                      alignItems: "center",
                      borderBottom: "1px solid rgba(255,255,255,0.03)"
                    }}>
                      <span style={{ fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.userName}
                        {p.hasInsurance && <span title="Has insurance">🛡️</span>}
                      </span>
                      <span className="meta" style={{ fontSize: "9px", color: p.optionLabel === data.prediction.winningOptionLabel ? "var(--green)" : "var(--muted)" }}>
                        {p.optionLabel === data.prediction.winningOptionLabel ? "✅" : ""} {p.optionLabel}
                      </span>
                      <span className="meta">{p.status === "won" ? "Won" : p.hasInsurance && p.insuranceRefund > 0 ? "Lost+คืนประกัน" : "Lost"}</span>
                      <span style={{ textAlign: "right" }}>{p.betAmount.toLocaleString()}</span>
                      <span style={{
                        textAlign: "right",
                        fontWeight: "bold",
                        color: (() => {
                          const net = p.status === "won"
                            ? p.payoutAmount - p.betAmount
                            : p.hasInsurance && p.insuranceRefund > 0
                              ? p.insuranceRefund - p.betAmount  // Use actual refund
                              : -p.betAmount;
                          return net >= 0 ? "var(--green)" : "var(--red)";
                        })()
                      }}>
                        {p.status === "won"
                          ? `${(p.payoutAmount - p.betAmount).toLocaleString()}`
                          : p.hasInsurance && p.insuranceRefund > 0
                            ? `${(p.insuranceRefund - p.betAmount).toLocaleString()}`
                            : `-${p.betAmount.toLocaleString()}`
                        }
                      </span>
                    </div>
                  ))}
                </div>
                {data.prediction.winningOptionLabel && (
                  <div className="meta" style={{ fontSize: "9px", textAlign: "center", paddingTop: "4px" }}>
                    Winning answer: <strong style={{ color: "var(--green)" }}>{data.prediction.winningOptionLabel}</strong>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <main className="page admin-page" style={{ padding: "10px 16px" }}>
      <div className="app admin-app" style={{ maxWidth: "1000px" }}>
        <header className="topbar" style={{ marginBottom: "8px" }}>
          <div className="brand-text">
            <h1>SUPERWIN Admin Panel</h1>
            <span>{adminEmail} · Admin</span>
          </div>
          <div className="actions" style={{ gap: "6px" }}>
            <Link className="button gold" href="/">Back to Site</Link>
          </div>
        </header>

        {message && <div className="admin-message" style={{ marginBottom: "12px" }}>{message}</div>}

        <div className="filter-row" style={{ justifyContent: "center", gap: "8px", marginBottom: "16px" }}>
          <button className={`button ${activeTab === "dashboard" ? "active" : ""}`} onClick={() => { setActiveTab("dashboard"); loadDashboardData().catch(() => undefined); }} style={{ borderRadius: "999px" }}>Dashboard</button>
          <button className={`button ${activeTab === "tournaments" ? "active" : ""}`} onClick={() => setActiveTab("tournaments")} style={{ borderRadius: "999px" }}>Manageทัวร์นาเมนต์</button>
          <button className={`button ${activeTab === "questions" ? "active" : ""}`} onClick={() => setActiveTab("questions")} style={{ borderRadius: "999px" }}>สร้างQuestionใหม่</button>
          <button className={`button ${activeTab === "running" ? "active" : ""}`} onClick={() => setActiveTab("running")} style={{ borderRadius: "999px" }}>ManageQuestion</button>
          <button className={`button ${activeTab === "settings" ? "active" : ""}`} onClick={() => setActiveTab("settings")} style={{ borderRadius: "999px" }}>Site Settings</button>
          <button className={`button ${activeTab === "admins" ? "active" : ""}`} onClick={() => setActiveTab("admins")} style={{ borderRadius: "999px" }}>Admins ({admins.length})</button>
          <button className={`button ${activeTab === "reports" ? "active" : ""}`} onClick={() => { setActiveTab("reports"); loadReports().catch(() => undefined); }} style={{ borderRadius: "999px" }}>Reports ({reports.length})</button>
          <button className={`button ${activeTab === "users" ? "active" : ""}`} onClick={() => setActiveTab("users")} style={{ borderRadius: "999px" }}>ManageUser ({users.length})</button>
          <button className={`button ${activeTab === "contests" ? "active" : ""}`} onClick={() => { setActiveTab("contests"); loadContests().catch(() => undefined); }} style={{ borderRadius: "999px" }}>Prize Contests ({contests.length})</button>
          <button className={`button ${activeTab === "chat" ? "active" : ""}`} onClick={() => { setActiveTab("chat"); loadChatMessages(); }} style={{ borderRadius: "999px" }}>💬 Chat ({chatMessages.length})</button>
        </div>

        <section className="admin-content" style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px", width: "100%", maxWidth: "100%", justifyItems: "center", alignContent: "start", margin: "0 auto" }}>
          
          {activeTab === "dashboard" && (
            <>

              <section className="panel" style={{ width: "100%", maxWidth: "900px", display: "grid", gap: "20px", margin: "0 auto" }}>
                <div className="panel-head" style={{ padding: "0 0 4px 0", borderBottom: "1px solid var(--hairline)" }}>
                  <h2>แดชบอรดภาพรวม</h2>
                  <span className="micro">มองปุ๊บเขามาใจ ทุกสถิติในหน้าเดียว</span>
                </div>

                {/* ── Tournament Selector ── */}
                <div style={{ display: "grid", gap: "4px" }}>
                  <label className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>Pickทัวร์นาเมนต์</label>
                  <select className="button" value={selectedDashboardTournament} onChange={(e) => setSelectedDashboardTournament(e.target.value)} style={{ width: "100%", height: "40px", fontSize: "13px", fontWeight: "600" }}>
                    <option value="">-- Select Tournament --</option>
                    {Array.from(new Set(dashboardData.map((d) => d.tournamentName)))
                      .sort((a, b) => {
                        const aInfo = (settings.tournaments || []).find((t) => getTournamentInfo(t).name.toLowerCase() === a.toLowerCase());
                        const bInfo = (settings.tournaments || []).find((t) => getTournamentInfo(t).name.toLowerCase() === b.toLowerCase());
                        const aArchived = aInfo ? getTournamentInfo(aInfo).archived : false;
                        const bArchived = bInfo ? getTournamentInfo(bInfo).archived : false;
                        if (aArchived !== bArchived) return aArchived ? 1 : -1;
                        return a.localeCompare(b);
                      })
                      .map((tour) => {
                        const info = (settings.tournaments || []).find((t) => getTournamentInfo(t).name.toLowerCase() === tour.toLowerCase());
                        const isArchived = info ? getTournamentInfo(info).archived : false;
                        return (
                          <option key={tour} value={tour}>
                            {isArchived ? "📦 " : ""}{tour}
                          </option>
                        );
                      })}
                  </select>
                </div>

                {(() => {
                  if (!selectedDashboardTournament) {
                    return (
                      <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--muted)" }}>
                        <div style={{ fontSize: "40px", marginBottom: "12px" }}>👆</div>
                        <p style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)" }}>Pickทัวร์นาเมนต์เพื่อดูสถิติ</p>
                        <p style={{ fontSize: "12px", marginTop: "4px" }}>กราฟและข้อมูลจะปรากฏขึ้นเมื่อPickทัวร์นาเมนต์</p>
                      </div>
                    );
                  }

                  const tournamentQuestions = dashboardData.filter((d) => d.tournamentName === selectedDashboardTournament);
                  if (tournamentQuestions.length === 0) {
                    return <div className="question"><span>ไม่พบข้อมูลQuestionในทัวร์นาเมนต์นี้</span></div>;
                  }

                  // Sort: open questions first (by closesAt ascending), then resolved (by closesAt descending)
                  const sortedQuestions = [...tournamentQuestions].sort((a, b) => {
                    // Open questions come before resolved
                    if (a.status === "open" && b.status !== "open") return -1;
                    if (a.status !== "open" && b.status === "open") return 1;
                    // Within same status: sort by closesAt
                    const aTime = new Date(a.closesAt || a.createdAt || 0).getTime();
                    const bTime = new Date(b.closesAt || b.createdAt || 0).getTime();
                    // Open: soonest first; Resolved: most recent first
                    return a.status === "open" ? aTime - bTime : bTime - aTime;
                  });

                  const totalTourCoins = sortedQuestions.reduce((sum, q) => sum + q.totalPoolCoins, 0);
                  const totalTourPlayers = new Set(sortedQuestions.flatMap((q) => q.playerBets.map((b) => b.email))).size;
                  const totalBets = sortedQuestions.reduce((sum, q) => sum + q.playerBets.length, 0);
                  const openCount = sortedQuestions.filter((q) => q.status === "open").length;
                  const resolvedCount = sortedQuestions.filter((q) => q.status === "resolved").length;

                  // Colors for charts and UI
                  const colors = {
                    gold: "#FFD700",
                    goldDim: "rgba(255, 215, 0, 0.12)",
                    green: "#0ECB81",
                    greenDim: "rgba(14, 203, 129, 0.12)",
                    red: "#F05454",
                    blue: "#4DABF7",
                    blueDim: "rgba(77, 171, 247, 0.12)",
                    purple: "#B197FC",
                    purpleDim: "rgba(177, 151, 252, 0.12)",
                    teal: "#63E6BE",
                    tealDim: "rgba(99, 230, 190, 0.12)",
                    orange: "#FFA94D",
                    orangeDim: "rgba(255, 169, 77, 0.12)",
                    pink: "#F783AC",
                    pinkDim: "rgba(247, 131, 172, 0.12)",
                  };
                  const chartColors = [colors.gold, colors.blue, colors.green, colors.purple, colors.orange, colors.teal, colors.pink, colors.red];

                  return (
                    <div style={{ display: "grid", gap: "24px" }}>

                      {/* ── Summary Stat Cards (4 cards) ── */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
                        <div style={{ background: colors.goldDim, border: `1px solid ${colors.gold}`, borderRadius: "12px", padding: "14px", textAlign: "center" }}>
                          <div style={{ fontSize: "22px", marginBottom: "4px" }}>💰</div>
                          <div className="meta" style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Total Coins (Tournament)</div>
                          <strong style={{ fontSize: "24px", color: colors.gold, display: "block", marginTop: "2px" }}>{totalTourCoins.toLocaleString()}</strong>
                          <span style={{ fontSize: "10px", color: "var(--muted)" }}>Coins</span>
                        </div>
                        <div style={{ background: colors.blueDim, border: `1px solid ${colors.blue}`, borderRadius: "12px", padding: "14px", textAlign: "center" }}>
                          <div style={{ fontSize: "22px", marginBottom: "4px" }}>👥</div>
                          <div className="meta" style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Total Players</div>
                          <strong style={{ fontSize: "24px", color: colors.blue, display: "block", marginTop: "2px" }}>{totalTourPlayers}</strong>
                          <span style={{ fontSize: "10px", color: "var(--muted)" }}>players</span>
                        </div>
                        <div style={{ background: colors.purpleDim, border: `1px solid ${colors.purple}`, borderRadius: "12px", padding: "14px", textAlign: "center" }}>
                          <div style={{ fontSize: "22px", marginBottom: "4px" }}>❓</div>
                          <div className="meta" style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Total Questions</div>
                          <strong style={{ fontSize: "24px", color: colors.purple, display: "block", marginTop: "2px" }}>{tournamentQuestions.length}</strong>
                          <span style={{ fontSize: "10px", color: "var(--muted)" }}>questions</span>
                        </div>
                        <div style={{ background: colors.greenDim, border: `1px solid ${colors.green}`, borderRadius: "12px", padding: "14px", textAlign: "center" }}>
                          <div style={{ fontSize: "22px", marginBottom: "4px" }}>🎯</div>
                          <div className="meta" style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Total Predictions</div>
                          <strong style={{ fontSize: "24px", color: colors.green, display: "block", marginTop: "2px" }}>{totalBets}</strong>
                          <span style={{ fontSize: "10px", color: "var(--muted)" }}>times</span>
                        </div>
                      </div>

                      {/* ── Status Overview (3 boxes) ── */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                        <div style={{ background: "rgba(255, 225, 0, 0.06)", border: "1px solid rgba(255, 225, 0, 0.2)", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
                          <div style={{ fontSize: "16px" }}>🔴</div>
                          <strong style={{ fontSize: "16px", color: "var(--yellow)" }}>{openCount}</strong>
                          <div className="meta" style={{ fontSize: "9px" }}>Open for predictions</div>
                        </div>
                        <div style={{ background: "rgba(14, 203, 129, 0.06)", border: "1px solid rgba(14, 203, 129, 0.2)", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
                          <div style={{ fontSize: "16px" }}>✅</div>
                          <strong style={{ fontSize: "16px", color: "var(--green)" }}>{resolvedCount}</strong>
                          <div className="meta" style={{ fontSize: "9px" }}>Resolved</div>
                        </div>
                        <div style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid var(--hairline)", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
                          <div style={{ fontSize: "16px" }}>📈</div>
                          <strong style={{ fontSize: "16px", color: "#fff" }}>{sortedQuestions.length > 0 ? Math.round(totalTourCoins / sortedQuestions.length).toLocaleString() : 0}</strong>
                          <div className="meta" style={{ fontSize: "9px" }}>Avg/Question (Coins)</div>
                        </div>
                      </div>
                      {/* ── Question Details ── */}
                      <div style={{ display: "grid", gap: "14px" }}>
                        <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--text)", padding: "8px 4px", borderBottom: "1px solid var(--hairline)" }}>
                          📋 Question Details ({sortedQuestions.length} ข้อ)
                        </div>
                        {sortedQuestions.map((q, qIdx) => (
                          <div key={q.id} style={{ border: "1px solid var(--hairline)", borderRadius: "12px", background: "var(--bg)", padding: "14px", display: "grid", gap: "10px" }}>
                            {/* Header with icon, question, status badge */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span style={{ fontSize: "16px" }}>{["🎮","🏆","⚔️","🎯","🔥","💎","🌟","👑"][qIdx % 8]}</span>
                                <strong style={{ fontSize: "14px", color: "#fff" }}>{q.question}</strong>
                              </div>
                              <span className="pill" style={{ 
                                fontSize: "10px", 
                                height: "22px", 
                                padding: "0 10px",
                                borderRadius: "999px",
                                border: 0,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                background: q.status === "open" ? "rgba(255, 225, 0, 0.12)" : q.status === "resolved" ? "rgba(14, 203, 129, 0.12)" : "rgba(255, 255, 255, 0.06)", 
                                color: q.status === "open" ? "var(--yellow)" : q.status === "resolved" ? "var(--green)" : "var(--text)" 
                              }}>
                                {q.status === "open" ? "🔴" : q.status === "resolved" ? "✅" : "⏸️"} {statusLabel(q.status)}
                              </span>
                            </div>

                            {/* Quick Stats Row */}
                            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "11px", color: "var(--muted)" }}>
                              <span>💰 Pool: <strong style={{ color: "var(--yellow)" }}>{q.totalPoolCoins.toLocaleString()} Coins</strong></span>
                              <span>👥 Predictors: <strong style={{ color: "#fff" }}>{q.uniquePlayers} people</strong></span>
                              <span>📝 Total Bets: <strong style={{ color: colors.blue }}>{q.playerBets.length} ครั้ง</strong></span>
                              {q.totalPoolCoins > 0 && q.playerBets.length > 0 && (
                                <span>📊 เฉลี่ย/people: <strong style={{ color: colors.purple }}>{Math.round(q.totalPoolCoins / q.uniquePlayers).toLocaleString()}</strong></span>
                              )}
                            </div>

                            {/* Visual Odds Bars (colored progress bars) */}
                            <div style={{ display: "grid", gap: "6px", marginTop: "2px" }}>
                              <span className="meta" style={{ color: "var(--yellow)", fontSize: "10px", fontWeight: "600" }}>📊 Betting Distribution (Odds)</span>
                              <div style={{ display: "grid", gap: "6px" }}>
                                {q.optionStats.map((stat, si) => {
                                  const pct = q.totalPoolCoins > 0 ? ((stat.totalCoins / q.totalPoolCoins) * 100).toFixed(1) : "0";
                                  const barColor = chartColors[si % chartColors.length];
                                  return (
                                    <div key={stat.id} style={{ display: "grid", gap: "3px" }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: "500" }}>
                                        <span style={{ color: "#fff" }}>{stat.label}</span>
                                        <span>
                                          <strong style={{ color: barColor }}>{pct}%</strong>
                                          <span style={{ color: "var(--muted)", marginLeft: "8px" }}>~ {stat.multiplier > 0 ? `~${stat.multiplier}x` : "--"}</span>
                                        </span>
                                      </div>
                                      <div style={{ width: "100%", height: "8px", background: "var(--bg)", borderRadius: "4px", overflow: "hidden" }}>
                                        <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: "4px", transition: "width 0.5s ease" }} />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Player List - same format as Manage Questions tab */}
                            <div style={{ marginTop: "4px" }}>
                              <details style={{ cursor: "pointer" }}>
                                <summary style={{ fontSize: "11px", color: "var(--yellow)", outline: "none", fontWeight: "500", padding: "4px 0" }}>
                                  ▸ Participants ({q.playerBets.length} people){q.status === "resolved" ? ` — Won ${q.playerBets.filter(b => b.optionLabel === q.optionStats.reduce((max, s) => s.totalCoins > max.totalCoins ? s : max).label).length} · Lost ${q.playerBets.length - q.playerBets.filter(b => b.optionLabel === q.optionStats.reduce((max, s) => s.totalCoins > max.totalCoins ? s : max).label).length}` : ""}
                                </summary>
                                <div style={{ display: "grid", gap: "5px", marginTop: "8px", maxHeight: "200px", overflowY: "auto", padding: "4px", background: "var(--card)", borderRadius: "8px", border: "1px solid var(--hairline)" }}>
                                  {/* Header */}
                                  <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 120px 70px 70px", gap: "6px", padding: "4px 8px", fontSize: "9px", color: "var(--muted)", fontWeight: "bold", borderBottom: "1px solid var(--hairline)" }}>
                                    <span>User</span>
                                    <span>Pick</span>
                                    <span>Option</span>
                                    <span style={{ textAlign: "right" }}>Bet</span>
                                    <span style={{ textAlign: "right" }}>Result</span>
                                  </div>
                                  {/* Rows */}
                                  {[...q.playerBets]
                                    .sort((a, b) => {
                                      // If resolved: sort winners first, then by amount desc
                                      if (q.status === "resolved") {
                                        const winningLabel = q.optionStats.reduce((max, s) => s.totalCoins > max.totalCoins ? s : max).label;
                                        const aWon = a.optionLabel === winningLabel;
                                        const bWon = b.optionLabel === winningLabel;
                                        if (aWon && !bWon) return -1;
                                        if (!aWon && bWon) return 1;
                                      }
                                      return b.amount - a.amount;
                                    })
                                    .map((bet) => {
                                      const winningLabel = q.status === "resolved" ? q.optionStats.reduce((max, s) => s.totalCoins > max.totalCoins ? s : max).label : null;
                                      const isWinner = q.status === "resolved" && bet.optionLabel === winningLabel;
                                      return (
                                        <div key={bet.id} style={{ display: "grid", gridTemplateColumns: "1fr 80px 120px 70px 70px", gap: "6px", padding: "5px 8px", fontSize: "10px", background: isWinner ? "rgba(14,203,129,0.04)" : "transparent", borderRadius: "4px", alignItems: "center" }}>
                                          <span style={{ fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#fff" }}>
                                            {bet.displayName || bet.email || bet.userId || "Userไม่ทราบ"}
                                          </span>
                                          <span className="meta" style={{ fontSize: "9px", color: isWinner ? "var(--green)" : "var(--muted)" }}>
                                            {isWinner ? "✅ " : ""}{bet.optionLabel}
                                          </span>
                                          <span className="meta" style={{ fontSize: "10px" }}>{q.status === "resolved" ? (isWinner ? "Won" : "Lost") : "--"}</span>
                                          <span style={{ textAlign: "right", color: "var(--yellow)", fontWeight: "600" }}>{bet.amount.toLocaleString()}</span>
                                          <span style={{ textAlign: "right", fontWeight: "bold", color: q.status === "resolved" ? (isWinner ? "var(--green)" : "var(--red)") : "var(--muted)" }}>
                                            {q.status === "resolved" ? (isWinner ? `${Math.round(bet.amount * 0.63).toLocaleString()}` : `-${bet.amount.toLocaleString()}`) : "--"}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  {!q.playerBets.length && <div style={{ fontSize: "11px", color: "var(--muted)", textAlign: "center", padding: "8px" }}>ยังไม่มีentriesทายผล</div>}
                                </div>
                              </details>
                            </div>
                          </div>
                        ))}
                      </div>

                    </div>
                  );
                })()}
              </section>
            </>
          )}


          {activeTab === "questions" && (
            <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px", maxWidth: "600px", width: "100%", margin: "0 auto" }}>
              <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}><h2>Create New Question</h2><span className="micro">เClose nowหลังสร้าง</span></div>
              <form className="modal-body" onSubmit={createPrediction} style={{ padding: "12px 0 0 0" }}>
                <div style={{ display: "grid", gap: "4px" }}>
                  <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>Tournament</span>
                  <select
                    className="button"
                    value={tournamentName}
                    onChange={(event) => setTournamentName(event.target.value)}
                    style={{
                      width: "100%",
                      height: "38px",
                      textAlign: "left",
                      fontSize: "13px",
                      fontWeight: 600,
                      border: tournamentName.trim()
                        ? "2px solid var(--green)"
                        : "2px dashed var(--red)",
                      background: tournamentName.trim()
                        ? "rgba(14, 203, 129, 0.08)"
                        : "rgba(255, 60, 60, 0.06)",
                      color: tournamentName.trim()
                        ? "var(--green)"
                        : "var(--muted)",
                    }}
                  >
                    <option value="">⚠️ -- Must select tournament first --</option>
                    {(settings.tournaments || [])
                      .map((t) => {
                        const name = getTournamentInfo(t).name;
                        const info = getTournamentInfo(t);
                        // Skip hidden (archived) tournaments
                        if (info.archived) return null;
                        // Find latest question createdAt for this tournament
                        const latestQuestion = dashboardData
                          .filter((d) => d.tournamentName === name)
                          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
                        return { name, latestCreatedAt: latestQuestion ? latestQuestion.createdAt : null };
                      })
                      .filter(Boolean)
                      .sort((a: any, b: any) => {
                        if (a.latestCreatedAt && b.latestCreatedAt) {
                          return new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime();
                        }
                        if (a.latestCreatedAt && !b.latestCreatedAt) return -1;
                        if (!a.latestCreatedAt && b.latestCreatedAt) return 1;
                        return 0;
                      })
                      .map((t: any) => (
                        <option key={t.name} value={t.name}>
                          {t.name}{t.latestCreatedAt ? " ★" : ""}
                        </option>
                      ))}
                  </select>
                </div>

                <div style={{ display: "grid", gap: "4px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>Round</span>
                    <button className="button" type="button" disabled={!round.trim()} onClick={saveRoundTemplate} style={{ height: "18px", fontSize: "9px", padding: "0 6px", background: "transparent", border: "1px solid var(--yellow)", color: "var(--yellow)", borderRadius: "4px" }}>
                      💾 Save Round
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "6px", alignItems: "center" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-strong)", whiteSpace: "nowrap" }}>รอบ</span>
                    <input value={round} onChange={(event) => setRound(event.target.value)} placeholder="เช่น แบ่งกลุ่ม, รอบ 16 ทีม" style={{ height: "34px" }} />
                    <select className="button" value="" onChange={(event) => { if (event.target.value) setRound(event.target.value); }} style={{ height: "34px", width: "auto", minWidth: "140px", maxWidth: "200px" }}>
                      <option value="">-- รอบ --</option>
                      {(settings.savedRounds || []).map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  {settings.savedRounds && settings.savedRounds.length > 0 && (
                    <details style={{ marginTop: "4px", cursor: "pointer" }}>
                      <summary className="meta" style={{ fontSize: "10px", color: "var(--muted)" }}>✏️ Manageรอบที่Saveไว้</summary>
                      <div style={{ display: "grid", gap: "4px", marginTop: "4px", maxHeight: "120px", overflowY: "auto", padding: "4px", background: "var(--bg)", borderRadius: "6px", border: "1px solid var(--hairline)" }}>
                        {settings.savedRounds.map((r) => (
                          <div key={r} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", padding: "4px 8px", background: "var(--card)", borderRadius: "4px" }}>
                            {editingRound === r ? (
                              <>
                                <input value={editRoundInput} onChange={(event) => setEditRoundInput(event.target.value)} style={{ flex: 1, height: "26px", fontSize: "11px" }} autoFocus />
                                <div style={{ display: "flex", gap: "4px" }}>
                                  <button className="button" type="button" onClick={() => renameRoundTemplate(r, editRoundInput)} style={{ height: "20px", fontSize: "9px", padding: "0 6px", background: "rgba(14, 203, 129, 0.1)", border: "1px solid var(--green)", color: "var(--green)" }}>Save</button>
                                  <button className="button" type="button" onClick={() => setEditingRound(null)} style={{ height: "20px", fontSize: "9px", padding: "0 6px", background: "transparent", border: "1px solid var(--muted)", color: "var(--muted)" }}>Cancel</button>
                                </div>
                              </>
                            ) : (
                              <>
                                <span style={{ fontSize: "11px", color: "var(--text)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{r}</span>
                                <div style={{ display: "flex", gap: "4px" }}>
                                  <button className="button" type="button" onClick={() => { setEditingRound(r); setEditRoundInput(r); }} style={{ height: "20px", fontSize: "9px", padding: "0 6px", background: "rgba(59, 130, 246, 0.1)", border: "1px solid var(--info)", color: "var(--info)" }}>Edit</button>
                                  <button className="button" type="button" onClick={() => removeRoundTemplate(r)} style={{ height: "20px", fontSize: "9px", padding: "0 6px", background: "rgba(240, 84, 84, 0.1)", border: "1px solid #ef4444", color: "#ef4444" }}>Delete</button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>

                <div style={{ display: "grid", gap: "4px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>Question</span>
                    <button className="button" type="button" disabled={!question.trim()} onClick={saveQuestionTemplate} style={{ height: "18px", fontSize: "9px", padding: "0 6px", background: "transparent", border: "1px solid var(--yellow)", color: "var(--yellow)", borderRadius: "4px" }}>
                      💾 Save Question Template
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px" }}>
                    <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="คีย์Question หรือPickจากแม่แบบขวา" style={{ height: "34px" }} />
                    <select className="button" value="" onChange={(event) => { if (event.target.value) setQuestion(event.target.value); }} style={{ height: "34px", width: "auto", minWidth: "260px", maxWidth: "400px" }}>
                      <option value="">-- Question Templates --</option>
                      {(settings.savedQuestions || []).map((q) => (
                        <option key={q} value={q}>{q}</option>
                      ))}
                    </select>
                  </div>
                  {settings.savedQuestions && settings.savedQuestions.length > 0 && (
                    <details style={{ marginTop: "6px", cursor: "pointer" }}>
                      <summary className="meta" style={{ fontSize: "10px", color: "var(--muted)" }}>✏️ ManageQuestion Templatesที่Saveไว้</summary>
                      <div style={{ display: "grid", gap: "4px", marginTop: "6px", maxHeight: "120px", overflowY: "auto", padding: "4px", background: "var(--bg)", borderRadius: "6px", border: "1px solid var(--hairline)" }}>
                        {settings.savedQuestions.map((q) => (
                          <div key={q} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", padding: "4px 8px", background: "var(--card)", borderRadius: "4px" }}>
                            {editingTemplate === q ? (
                              <>
                                <input value={editTemplateInput} onChange={(event) => setEditTemplateInput(event.target.value)} style={{ flex: 1, height: "26px", fontSize: "11px" }} autoFocus />
                                <div style={{ display: "flex", gap: "4px" }}>
                                  <button className="button" type="button" onClick={() => renameQuestionTemplate(q, editTemplateInput)} style={{ height: "20px", fontSize: "9px", padding: "0 6px", background: "rgba(14, 203, 129, 0.1)", border: "1px solid var(--green)", color: "var(--green)" }}>Save</button>
                                  <button className="button" type="button" onClick={() => setEditingTemplate(null)} style={{ height: "20px", fontSize: "9px", padding: "0 6px", background: "transparent", border: "1px solid var(--muted)", color: "var(--muted)" }}>Cancel</button>
                                </div>
                              </>
                            ) : (
                              <>
                                <span style={{ fontSize: "11px", color: "var(--text)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{q}</span>
                                <div style={{ display: "flex", gap: "4px" }}>
                                  <button className="button" type="button" onClick={() => { setEditingTemplate(q); setEditTemplateInput(q); }} style={{ height: "20px", fontSize: "9px", padding: "0 6px", background: "rgba(59, 130, 246, 0.1)", border: "1px solid var(--info)", color: "var(--info)" }}>Edit</button>
                                  <button className="button" type="button" onClick={() => removeQuestionTemplate(q)} style={{ height: "20px", fontSize: "9px", padding: "0 6px", background: "rgba(240, 84, 84, 0.1)", border: "1px solid #ef4444", color: "#ef4444" }}>Delete</button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>

                <div className="filter-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", margin: "4px 0" }}>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>Open Time</span>
                      <button className="button" type="button" onClick={() => setOpensAt(toDateTimeLocal(new Date()))} style={{ height: "18px", fontSize: "9px", padding: "0 6px", background: "transparent", border: "1px solid var(--yellow)", color: "var(--yellow)", borderRadius: "4px" }}>
                        ⚡ เปิดทายทันที
                      </button>
                    </div>
                    <label className="pill" style={{ display: "grid", gridTemplateColumns: "auto 1fr", height: "34px", padding: "0 10px" }}>เปิด <input type="datetime-local" value={opensAt} onChange={(event) => setOpensAt(event.target.value)} style={{ border: 0, padding: 0, height: "100%", background: "transparent", color: "var(--text)" }} /></label>
                  </div>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)", height: "18px", display: "flex", alignItems: "center" }}>Close Time</span>
                    <label className="pill" style={{ display: "grid", gridTemplateColumns: "auto 1fr", height: "34px", padding: "0 10px" }}>ปิด <input type="datetime-local" value={closesAt} onChange={(event) => setClosesAt(event.target.value)} style={{ border: 0, padding: 0, height: "100%", background: "transparent", color: "var(--text)" }} /></label>
                  </div>
                </div>
                <div className="filter-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", margin: "4px 0" }}>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>Fee Rate (Fee)</span>
                    <input value={feeRate} onChange={(event) => setFeeRate(event.target.value)} placeholder="Fee เช่น 0.03" style={{ height: "34px" }} />
                  </div>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>Status (สถานะแรกเริ่ม)</span>
                    <span className="pill gold" style={{ height: "34px", justifyContent: "center" }}>Create and open immediately</span>
                  </div>
                </div>

                <div className="admin-box" style={{ marginTop: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                    <strong>Answer Options</strong>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <button type="button" onClick={usePreviousOptions} style={{ fontSize: "10px", color: "var(--green)", background: "transparent", border: "0", cursor: "pointer", textDecoration: "underline" }}>
                        ใช้ตัวPickจากข้อที่แล้ว
                      </button>
                      <button type="button" onClick={() => setShowBulkOptions(!showBulkOptions)} style={{ fontSize: "10px", color: "var(--yellow)", background: "transparent", border: "0", cursor: "pointer", textDecoration: "underline" }}>
                        {showBulkOptions ? "ใส่ทีละข้อ" : "ใส่ทีละหลายคำตอบ (เว้นบรรทัด)"}
                      </button>
                    </div>
                  </div>

                  {!showBulkOptions ? (
                    <div className="filter-row" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px" }}>
                      <input value={optionInput} onChange={(event) => setOptionInput(event.target.value)} placeholder="Addedคำตอบทีละข้อ" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addOption(); } }} style={{ border: "1px solid var(--hairline)", height: "34px" }} />
                      <button className="button gold" type="button" onClick={addOption}>Addedคำตอบ</button>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: "6px" }}>
                      <textarea rows={3} value={optionsBulkInput} onChange={(event) => setOptionsBulkInput(event.target.value)} placeholder="วางรายชื่อตัวPickที่นี่ แยกบรรทัดกัน เช่น&#10;ทีม A&#10;ทีม B&#10;ทีม C" style={{ border: "1px solid var(--hairline)", borderRadius: "8px", background: "var(--bg)", color: "var(--text)", padding: "8px" }} />
                      <button className="button gold" type="button" onClick={addBulkOptions} style={{ width: "100%", height: "34px" }}>ดึงคำตอบทั้งหมดกระจายเป็นตัวPickด่วน</button>
                    </div>
                  )}

                  <div className="admin-option-list" style={{ marginTop: "6px" }}>
                    {draftOptions.map((option, index) => (
                      <div key={`${option}-${index}`} className="reward-line">
                        <span>{index + 1}. {option}</span>
                        <button className="button" type="button" onClick={() => removeOption(index)}>Delete</button>
                      </div>
                    ))}
                  </div>

                  {/* ── ชุดตัวPickที่Saveไว้ ── */}
                  <div style={{ marginTop: "10px", borderTop: "1px solid var(--hairline)", paddingTop: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                      <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>ชุดตัวPickที่Saveไว้ ({savedOptionSets.length})</span>
                      {draftOptions.length >= 2 && (
                        <button
                          type="button"
                          className="button gold"
                          style={{ height: "28px", fontSize: "11px", padding: "0 10px" }}
                          onClick={() => setShowSaveOptionSet(!showSaveOptionSet)}
                        >
                          {showSaveOptionSet ? "Cancel" : "💾 SaveชุดตัวPick"}
                        </button>
                      )}
                    </div>

                    {showSaveOptionSet && (
                      <div style={{ display: "flex", gap: "8px", marginTop: "8px", alignItems: "center" }}>
                        <input
                          value={optionSetNameInput}
                          onChange={(e) => setOptionSetNameInput(e.target.value)}
                          placeholder="ชื่อชุดตัวPick เช่น ทีม 16 ทีม"
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveOptionSet(); } }}
                          style={{ border: "1px solid var(--hairline)", height: "34px", flex: 1 }}
                        />
                        <button type="button" className="button gold" onClick={saveOptionSet} style={{ height: "34px", fontSize: "12px", padding: "0 14px" }}>
                          Save
                        </button>
                      </div>
                    )}

                    {savedOptionSets.length > 0 && (
                      <div style={{ display: "grid", gap: "6px", marginTop: "8px" }}>
                        {savedOptionSets.map((set) => (
                          <div
                            key={set.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              padding: "8px 10px",
                              background: "var(--bg)",
                              borderRadius: "8px",
                              border: "1px solid var(--hairline)"
                            }}
                          >
                            {editingOptionSetId === set.id ? (
                              <>
                                <input
                                  value={editOptionSetNameInput}
                                  onChange={(e) => setEditOptionSetNameInput(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); updateOptionSetName(set.id); } }}
                                  style={{ border: "1px solid var(--hairline)", height: "28px", flex: 1, fontSize: "12px" }}
                                  autoFocus
                                />
                                <button type="button" className="button gold" onClick={() => updateOptionSetName(set.id)} style={{ height: "28px", fontSize: "11px", padding: "0 8px" }}>OK</button>
                                <button type="button" className="button" onClick={() => { setEditingOptionSetId(null); setEditOptionSetNameInput(""); }} style={{ height: "28px", fontSize: "11px", padding: "0 8px" }}>Cancel</button>
                              </>
                            ) : (
                              <>
                                <span style={{ flex: 1, fontSize: "13px" }}>
                                  <strong>{set.name}</strong>
                                  <span className="meta" style={{ fontSize: "11px", marginLeft: "6px", color: "var(--muted)" }}>({set.options.length} ตัวPick)</span>
                                </span>
                                <button
                                  type="button"
                                  className="button gold"
                                  onClick={() => loadOptionSet(set.id)}
                                  style={{ height: "28px", fontSize: "11px", padding: "0 10px" }}
                                  title="Loaded setตัวPickนี้"
                                >
                                  โหลด
                                </button>
                                <button
                                  type="button"
                                  className="button"
                                  onClick={() => {
                                    setEditingOptionSetId(set.id);
                                    setEditOptionSetNameInput(set.name);
                                  }}
                                  style={{ height: "28px", fontSize: "11px", padding: "0 8px" }}
                                  title="Editชื่อ"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="button"
                                  onClick={() => overwriteOptionSet(set.id)}
                                  style={{ height: "28px", fontSize: "11px", padding: "0 8px" }}
                                  title="Saveทับด้วยตัวPickปัจจุบัน"
                                >
                                  ทับ
                                </button>
                                <button
                                  type="button"
                                  className="button"
                                  onClick={() => deleteOptionSet(set.id)}
                                  style={{ height: "28px", fontSize: "11px", padding: "0 8px", color: "var(--red)" }}
                                  title="Deleteชุดนี้"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>

                {/* Tournament Confirmation Banner */}
                {tournamentName.trim() ? (
                  <div style={{
                    marginTop: "12px",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    background: "rgba(14, 203, 129, 0.1)",
                    border: "1px solid var(--green)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}>
                    <span style={{ fontSize: "16px" }}>✅</span>
                    <span style={{ fontSize: "12px", color: "var(--text)" }}>
                      Questionนี้จะถูกสร้างภายใต้: <strong style={{ color: "var(--green)", fontSize: "13px" }}>{tournamentName}</strong>
                    </span>
                  </div>
                ) : (
                  <div style={{
                    marginTop: "12px",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    background: "rgba(255, 60, 60, 0.08)",
                    border: "1px dashed var(--red)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}>
                    <span style={{ fontSize: "16px" }}>⚠️</span>
                    <span style={{ fontSize: "12px", color: "var(--red)" }}>
                      ยังไม่ได้Pickทัวร์นาเมนต์ — ปุ่มสร้างจะปิดใช้งาน
                    </span>
                  </div>
                )}

                <button
                  className="button primary"
                  disabled={loading || !tournamentName.trim() || !question.trim() || draftOptions.filter(Boolean).length < 2 || !closesAt || !feeRate}
                  type="submit"
                  style={{ width: "100%", marginTop: "12px" }}
                >
                  สร้างQuestionและเปิดรับทาย
                </button>
              </form>
            </section>
          )}

          {activeTab === "running" && (
            <section className="panel" style={{ width: "100%", maxWidth: "760px", display: "grid", gap: "16px", margin: "0 auto" }}>
              <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3>Questionที่กำลังรัน</h3>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    {runningTournamentFilter && filteredRunningPredictions.length > 1 && (
                      <button className="button gold" type="button" disabled={loading} onClick={savePredictionOrder} style={{ height: "24px", fontSize: "10px", padding: "0 10px" }}>
                        💾 SaveลำดับQuestion
                      </button>
                    )}
                    <span className="micro">{runningTournamentFilter ? `${filteredRunningPredictions.length} Question` : `${runningPredictions.length} entries`}</span>
                  </div>
                </div>
                <div className="admin-help" style={{ padding: "8px 0", margin: "4px 0" }}>
                  <span>Close now = หยุดรับคำทาย (Questionจะย้ายไปเก็บที่ตารางด้านล่างเพื่อรอResolve)</span>
                  <span>Resolve = Select winning answerและPaidผลcoins</span>
                  <span>Cancel + Refund = CancelQuestionและคืนcoinsเต็มจำนวน</span>
                </div>

                {/* Tournament Selector */}
                <div style={{ display: "grid", gap: "4px", marginBottom: "12px" }}>
                  <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>Pickทัวร์นาเมนต์เพื่อManageQuestion</span>
                  <select 
                    className="button" 
                    value={runningTournamentFilter} 
                    onChange={(e) => setRunningTournamentFilter(e.target.value)} 
                    style={{ width: "100%", height: "38px" }}
                  >
                    <option value="">-- Select Tournament --</option>
                    {settings.tournaments
                      ?.map((t) => {
                        const info = getTournamentInfo(t);
                        return { name: info.name, archived: info.archived };
                      })
                      .sort((a, b) => {
                        if (a.archived !== b.archived) return a.archived ? 1 : -1;
                        return a.name.localeCompare(b.name);
                      })
                      .map((t) => (
                        <option key={t.name} value={t.name}>
                          {t.archived ? "📦 " : ""}{t.name}
                        </option>
                      ))}
                  </select>
                </div>
                
                <div className="leaderboard-body" style={{ gap: "10px", padding: "12px 0 0 0" }}>
                  {!runningTournamentFilter ? (
                    <div className="question"><strong>กรุณาPickทัวร์นาเมนต์</strong><span className="meta">Pickทัวร์นาเมนต์จาก dropdown ด้านบนเพื่อดูและManageQuestion</span></div>
                  ) : (
                    currentRunning.length > 0 ? currentRunning.map((item) => {
                    const globalIdx = localOrder.indexOf(item.id);
                    return (
                      <div key={item.id} className="question running" style={{ padding: "12px", display: "grid", gridTemplateColumns: "auto 1fr", gap: "12px", alignItems: "center" }}>
                        {/* แฮมเบอร์เกอร์ & เลื่อนลำดับQuestion */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", paddingRight: "8px", borderRight: "1px solid var(--hairline)", alignSelf: "stretch", justifyContent: "center" }}>
                          <span style={{ fontSize: "14px", color: "var(--muted)", cursor: "grab", lineHeight: "1" }} title="ลากหรือเลื่อนQuestion">☰</span>
                          <div style={{ display: "flex", gap: "2px" }}>
                            <button className="button" type="button" disabled={globalIdx <= 0} onClick={() => moveLocalOrder(item.id, "up")} style={{ width: "18px", height: "18px", padding: 0, fontSize: "8px", background: "transparent" }}>▲</button>
                            <button className="button" type="button" disabled={globalIdx === -1 || globalIdx >= localOrder.length - 1} onClick={() => moveLocalOrder(item.id, "down")} style={{ width: "18px", height: "18px", padding: 0, fontSize: "8px", background: "transparent" }}>▼</button>
                          </div>
                        </div>

                        <div style={{ display: "grid", gap: "6px", width: "100%" }}>
                          <div className="question-main">
                            <strong>{item.question}</strong>
                            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", marginTop: "2px", marginBottom: "4px" }}>
                              <span className="meta">{item.tournamentName} · ปิด {displayDate(item.closesAt)} UTC+7 · {item.options.length} คำตอบ</span>
                              {editingId !== item.id ? (
                                <button 
                                  className="button" 
                                  type="button" 
                                  onClick={() => {
                                    setEditingId(item.id);
                                    setEditClosesAt((current) => ({ ...current, [item.id]: toDateTimeLocal(new Date(item.closesAt || "")) }));
                                    setEditQuestions((current) => ({ ...current, [item.id]: item.question }));
                                    setEditTournamentNames((current) => ({ ...current, [item.id]: item.tournamentName }));

                                    const initialOpts: Record<string, string> = {};
                                    item.options.forEach(o => {
                                      initialOpts[o.id] = o.label;
                                    });
                                    setEditOptionsInputs((current) => ({ ...current, [item.id]: initialOpts }));
                                  }} 
                                  style={{ height: "18px", fontSize: "9px", padding: "0 6px", background: "transparent", border: "1px solid var(--yellow)", color: "var(--yellow)", borderRadius: "4px", cursor: "pointer" }}
                                >
                                  ✏️ EditQuestion & คำตอบ
                                </button>
                              ) : (
                                <button 
                                  className="button" 
                                  type="button" 
                                  onClick={() => setEditingId(null)} 
                                  style={{ height: "18px", fontSize: "9px", padding: "0 6px", background: "transparent", border: "1px solid var(--muted)", color: "var(--muted)", borderRadius: "4px", cursor: "pointer" }}
                                >
                                  Cancel
                                </button>
                              )}
                            </div>

                            {/* กล่องEditQuestion & คำตอบ สไลด์เปิดแบบฟอร์มครบชุด */}
                            {editingId === item.id && (
                              <div style={{ display: "grid", gap: "10px", marginTop: "10px", marginBottom: "10px", background: "rgba(255,225,0,0.03)", padding: "12px", borderRadius: "8px", border: "1px solid var(--hairline)", width: "100%", textAlign: "left" }}>
                                <div style={{ display: "grid", gap: "4px" }}>
                                  <span className="meta" style={{ fontSize: "10px", color: "var(--yellow)" }}>🔄 ย้ายทัวร์นาเมนต์:</span>
                                  <select
                                    value={editTournamentNames[item.id] || item.tournamentName}
                                    onChange={(e) => setEditTournamentNames((current) => ({ ...current, [item.id]: e.target.value }))}
                                    style={{ height: "30px", fontSize: "11px", padding: "0 8px", background: "var(--card)", width: "100%", color: editTournamentNames[item.id] !== item.tournamentName ? "var(--yellow)" : "var(--text)" }}
                                  >
                                    {(settings.tournaments || []).map((t) => {
                                      const info = getTournamentInfo(t);
                                      return <option key={info.name} value={info.name}>{info.archived ? `📦 ${info.name}` : info.name}</option>;
                                    })}
                                  </select>
                                  {editTournamentNames[item.id] && editTournamentNames[item.id] !== item.tournamentName && (
                                    <span className="meta" style={{ fontSize: "9px", color: "var(--yellow)" }}>⚠️ จะย้ายจาก "{item.tournamentName}" → "{editTournamentNames[item.id]}"</span>
                                  )}
                                </div>

                                <div style={{ display: "grid", gap: "4px" }}>
                                  <span className="meta" style={{ fontSize: "10px", color: "var(--yellow)" }}>Editข้อความQuestion:</span>
                                  <input 
                                    type="text" 
                                    value={editQuestions[item.id] !== undefined ? editQuestions[item.id] : item.question} 
                                    onChange={(e) => setEditQuestions((current) => ({ ...current, [item.id]: e.target.value }))} 
                                    placeholder="กรอกข้อความQuestionใหม่..." 
                                    style={{ height: "30px", fontSize: "11px", padding: "0 8px", background: "var(--card)", width: "100%" }} 
                                  />
                                </div>

                                <div style={{ display: "grid", gap: "4px" }}>
                                  <span className="meta" style={{ fontSize: "10px", color: "var(--yellow)" }}>Editเวลาปิดทายผล (UTC+7):</span>
                                  <input 
                                    type="datetime-local" 
                                    value={editClosesAt[item.id] || ""} 
                                    onChange={(event) => setEditClosesAt((current) => ({ ...current, [item.id]: event.target.value }))} 
                                    style={{ height: "30px", fontSize: "11px", padding: "0 8px", width: "100%", background: "var(--card)" }} 
                                  />
                                </div>

                                <div style={{ display: "grid", gap: "6px" }}>
                                  <span className="meta" style={{ fontSize: "10px", color: "var(--yellow)" }}>Editข้อความคำตอบ (ทีมต่าง ๆ):</span>
                                  <div style={{ display: "grid", gap: "6px", maxHeight: "150px", overflowY: "auto", paddingRight: "4px" }}>
                                    {item.options.map((option) => {
                                      const currentVal = editOptionsInputs[item.id]?.[option.id] !== undefined 
                                        ? editOptionsInputs[item.id][option.id] 
                                        : option.label;
                                      return (
                                        <div key={option.id} style={{ display: "grid", gridTemplateColumns: "30px 1fr", alignItems: "center", gap: "8px" }}>
                                          <span style={{ fontSize: "10px", color: "var(--muted)" }}>#{option.sortOrder + 1}</span>
                                          <input 
                                            type="text" 
                                            value={currentVal} 
                                            onChange={(e) => setEditOptionsInputs((current) => ({
                                              ...current,
                                              [item.id]: {
                                                ...(current[item.id] || {}),
                                                [option.id]: e.target.value
                                              }
                                            }))} 
                                            style={{ height: "26px", fontSize: "11px", padding: "0 8px", background: "var(--card)", width: "100%" }} 
                                          />
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                <button 
                                  className="button gold" 
                                  type="button" 
                                  disabled={loading} 
                                  onClick={() => savePredictionEdits(item.id)} 
                                  style={{ height: "32px", fontSize: "11px", fontWeight: "bold", marginTop: "4px" }}
                                >
                                  💾 SaveการEditQuestion & คำตอบ
                                </button>
                              </div>
                            )}
                          </div>
                          {renderPredictionControls(item)}
                          {renderPayoutBreakdown(item)}
                        </div>
                      </div>
                    );
                    }
                  ) : <div className="question"><strong>ไม่มีQuestionในทัวร์นาเมนต์นี้</strong></div>
                )}
                </div>
                {runningTournamentFilter && runningTotalPages > 1 && (
                  <div className="history-footer" style={{ marginTop: "16px" }}>
                    <button className="button" disabled={runningPage <= 1} onClick={() => setRunningPage(runningPage - 1)}>ก่อนหน้า</button>
                    <span className="micro">หน้า {runningPage} / {runningTotalPages}</span>
                    <button className="button" disabled={runningPage >= runningTotalPages} onClick={() => setRunningPage(runningPage + 1)}>ถัดไป</button>
                  </div>
                )}
              </section>

              <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}><h3>Questionที่หมดเวลา รอคำตอบ</h3><span className="micro">{filteredPendingPredictions.length} entries</span></div>
                <div className="leaderboard-body" style={{ gap: "10px", padding: "12px 0 0 0" }}>
                  {currentPending.length ? currentPending.map((item) => (
                    <div key={item.id} className="question closed" style={{ padding: "12px" }}>
                      <div className="question-main">
                        <strong>{item.question}</strong>
                        <span className="meta">{item.tournamentName} · ปิดเมื่อ {displayDate(item.closesAt)} UTC+7 · {item.options.length} คำตอบ</span>
                      </div>
                      {renderPredictionControls(item)}
                      {renderPayoutBreakdown(item)}
                    </div>
                  )) : <div className="question"><strong>ไม่มีQuestionที่หมดเวลาและค้างรอคำตอบในขณะนี้</strong></div>}
                </div>
                {pendingTotalPages > 1 && (
                  <div className="history-footer" style={{ marginTop: "16px" }}>
                    <button className="button" disabled={pendingPage <= 1} onClick={() => setPendingPage(pendingPage - 1)}>ก่อนหน้า</button>
                    <span className="micro">หน้า {pendingPage} / {pendingTotalPages}</span>
                    <button className="button" disabled={pendingPage >= pendingTotalPages} onClick={() => setPendingPage(pendingPage + 1)}>ถัดไป</button>
                  </div>
                )}
              </section>

              <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}><h3>Questionที่Resolved</h3><span className="micro">{filteredResolvedPredictions.length} entries</span></div>
                <div className="leaderboard-body" style={{ gap: "10px", padding: "12px 0 0 0" }}>
                  {currentResolved.length ? currentResolved.map((item) => (
                    <div key={item.id} className="question resolved" style={{ padding: "12px", display: "grid", gridTemplateColumns: "auto 1fr", gap: "12px", alignItems: "center" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", paddingRight: "8px", borderRight: "1px solid var(--hairline)", alignSelf: "stretch", justifyContent: "center" }}>
                        <span style={{ fontSize: "14px", color: "var(--green)" }}>✅</span>
                      </div>
                      <div style={{ display: "grid", gap: "6px", width: "100%" }}>
                        <div className="question-main">
                          <strong>{item.question}</strong>
                          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", marginTop: "2px", marginBottom: "4px" }}>
                            <span className="meta">{item.tournamentName} · ปิด {displayDate(item.closesAt)} UTC+7 · {item.options.length} คำตอบ · {item.entryCount || 0} peopleแทง</span>
                            <span className="pill" style={{ background: "rgba(14,203,129,0.12)", color: "var(--green)", fontSize: "9px" }}>Resolved</span>
                          </div>
                        </div>
                        {renderPredictionControls(item)}
                        {renderPayoutBreakdown(item)}
                      </div>
                    </div>
                  )) : <div className="question"><strong>ยังไม่มีQuestionที่Resolved</strong></div>}
                </div>
                {resolvedTotalPages > 1 && (
                  <div className="history-footer" style={{ marginTop: "16px" }}>
                    <button className="button" disabled={resolvedPage <= 1} onClick={() => setResolvedPage(resolvedPage - 1)}>ก่อนหน้า</button>
                    <span className="micro">หน้า {resolvedPage} / {resolvedTotalPages}</span>
                    <button className="button" disabled={resolvedPage >= resolvedTotalPages} onClick={() => setResolvedPage(resolvedPage + 1)}>ถัดไป</button>
                  </div>
                )}
              </section>
            </section>
          )}

          {activeTab === "settings" && (
            <section className="panel" style={{ width: "100%", maxWidth: "600px", display: "grid", gap: "16px", margin: "0 auto" }}>

              {/* ส่วนพิเศษ: ตั้งค่าข้อความประกาศวิ่งหน้าแรก (Standalone Announcement Ticker Card) */}
              <div className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}>
                  <h2>📢 ตั้งค่าข้อความประกาศวิ่งหน้าแรก (Announcement Ticker)</h2>
                </div>
                <form className="modal-body" onSubmit={saveAnnouncementSettings} style={{ padding: "12px 0 0 0", display: "grid", gap: "10px" }}>
                  <span className="meta" style={{ textTransform: "none", color: "var(--muted)", lineHeight: "1.4" }}>
                    *ตั้งค่าข้อความประกาศข่าวสารวิ่งเคลื่อนไหวช้า ๆ จากขวาไปซ้ายด้านล่างเมนูหลักหน้าแรก (แยกSaveและมีปุ่มเซฟเป็นอิสระ)
                  </span>
                  
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>ข้อความประกาศหน้าแรก (ยาวแถวเดียวไหลช้า ๆ)</span>
                    <input 
                      value={settings.announcement || ""} 
                      onChange={(event) => setSettings((current) => ({ ...current, announcement: event.target.value }))} 
                      placeholder='เช่น ยินดีต้อนรับเข้าสู่ SUPERWIN HUB! ปล่อยตัวทายผลซีซั่น 2 แล้ววันนี้...' 
                      style={{ height: "34px" }} 
                    />
                  </div>

                  <button className="button primary" disabled={loading} type="submit" style={{ width: "100%", height: "34px", fontWeight: "bold" }}>📢 💾 Saveข้อความประกาศหน้าแรก</button>
                </form>
              </div>

              {/* ── Frontpage Features (เปิด/ปิด ฟีเจอร์หน้าแรก) ── */}
              <div className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}>
                  <h2>🎯 Frontpage Features</h2>
                </div>
                <form className="modal-body" onSubmit={(e) => { e.preventDefault(); saveFrontendSettings(); }} style={{ padding: "12px 0 0 0", display: "grid", gap: "12px" }}>
                  
                  {/* Enable/Disable Toggle */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--text)" }}>Enable Frontpage Features</div>
                      <div style={{ fontSize: "10px", color: "var(--muted)" }}>Show YouTube embed + Special Claim on homepage</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFrontendEnabled(v => !v)}
                      style={{
                        width: "48px",
                        height: "26px",
                        borderRadius: "13px",
                        border: "none",
                        cursor: "pointer",
                        transition: "all 0.2s",
                        background: frontendEnabled ? "var(--green)" : "var(--hairline)",
                        position: "relative",
                      }}
                    >
                      <div style={{
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        background: "#fff",
                        position: "absolute",
                        top: "3px",
                        left: frontendEnabled ? "24px" : "3px",
                        transition: "left 0.2s",
                      }} />
                    </button>
                  </div>

                  {/* YouTube Embed */}
                  <div style={{ display: "grid", gap: "8px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>YouTube URL</span>
                    <input 
                      type="text"
                      value={youtubeUrl} 
                      onChange={(event) => setYoutubeUrl(event.target.value)} 
                      placeholder="https://www.youtube.com/watch?v=VIDEO_ID หรือ https://youtu.be/VIDEO_ID"
                      style={{ fontFamily: "monospace", fontSize: "11px", background: "rgba(0,0,0,0.2)", border: "1px solid var(--hairline)", borderRadius: "6px", padding: "8px", color: "var(--text)" }}
                    />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                      <div>
                        <span className="meta" style={{ fontSize: "10px", color: "var(--muted)" }}>Start Time (GMT+7)</span>
                        <input 
                          type="datetime-local"
                          value={youtubeScheduleStart} 
                          onChange={(event) => setYoutubeScheduleStart(event.target.value)} 
                          style={{ width: "100%", boxSizing: "border-box", fontFamily: "monospace", fontSize: "11px", background: "rgba(0,0,0,0.2)", border: "1px solid var(--hairline)", borderRadius: "6px", padding: "6px", color: "var(--text)", marginTop: "2px" }}
                        />
                      </div>
                      <div>
                        <span className="meta" style={{ fontSize: "10px", color: "var(--muted)" }}>End Time (GMT+7)</span>
                        <input 
                          type="datetime-local"
                          value={youtubeScheduleEnd} 
                          onChange={(event) => setYoutubeScheduleEnd(event.target.value)} 
                          style={{ width: "100%", boxSizing: "border-box", fontFamily: "monospace", fontSize: "11px", background: "rgba(0,0,0,0.2)", border: "1px solid var(--hairline)", borderRadius: "6px", padding: "6px", color: "var(--text)", marginTop: "2px" }}
                        />
                      </div>
                    </div>
                    <span className="meta" style={{ fontSize: "9px", color: "var(--muted)" }}>ปลอย่ างว่างเวลาเปิด/ปิด ถาตองการใหShowตลอด</span>
                  </div>

                  <button className="button primary" disabled={loading} type="submit" style={{ width: "100%", height: "36px", fontWeight: "bold", marginTop: "4px" }}>💾 Save Frontpage Settings</button>
                </form>
              </div>

              <div className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}><h2>ข้อความ Info หน้าเว็บ (วิธีเล่น/รางวัล)</h2></div>
                <form className="modal-body" onSubmit={saveInfoSettings} style={{ padding: "12px 0 0 0" }}>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>How to Play (วิธีเล่น)</span>
                    <textarea rows={3} value={settings.info.howToPlay} onChange={(event) => setSettings((current) => ({ ...current, info: { ...current.info, howToPlay: event.target.value } }))} placeholder="How to Play" />
                  </div>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>Question Time (เวลากับการทาย)</span>
                    <textarea rows={3} value={settings.info.questionTime} onChange={(event) => setSettings((current) => ({ ...current, info: { ...current.info, questionTime: event.target.value } }))} placeholder="Question Time" />
                  </div>
                  <button className="button primary" disabled={loading} type="submit" style={{ marginTop: "12px", width: "100%" }}>Saveข้อความ Info ทั่วไป</button>
                </form>
              </div>
            </section>
          )}

          {activeTab === "tournaments" && (
            <section className="panel" style={{ width: "100%", maxWidth: "600px", display: "grid", gap: "16px", margin: "0 auto" }}>
              <div className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}><h2>Manage Tournaments</h2></div>
                <div className="modal-body" style={{ padding: "12px 0 0 0" }}>
                  <div style={{ display: "grid", gap: "10px", marginBottom: "12px" }}>
                    <div style={{ display: "grid", gap: "4px" }}>
                      <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>Tournament Name (Tournament Name)</span>
                      <input value={newTournamentInput} onChange={(event) => setNewTournamentInput(event.target.value)} placeholder="เช่น PUBG Mobile Pro League" style={{ height: "34px", border: "1px solid var(--hairline)" }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTournament(); } }} />
                    </div>
                    
                    <div style={{ display: "grid", gap: "4px" }}>
                      <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>รูปโลโก้ทัวร์นาเมนต์ (Tournament Logo - รูปสี่เหลี่ยมจัตุรัสขนาดเล็ก)</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <input type="file" accept="image/*" onChange={(event) => handleTournamentLogo(event.target.files?.[0])} style={{ flex: 1 }} />
                        {newTournamentLogoUrl && (
                          <img src={newTournamentLogoUrl} alt="Preview" style={{ width: "32px", height: "32px", borderRadius: "6px", objectFit: "contain", background: "transparent" }} />
                        )}
                      </div>
                    </div>
                    
                    <button className="button gold" disabled={loading || !newTournamentInput.trim()} type="button" onClick={addTournament} style={{ height: "34px", marginTop: "4px" }}>Addedทัวร์นาเมนต์ใหม่</button>
                  </div>
                  
                  <div className="admin-option-list">
                    {!(settings.tournaments && settings.tournaments.length > 0) ? (
                      <div className="reward-line"><span>ไม่มีรายTournament Nameในขณะนี้</span></div>
                    ) : (
                      (() => {
                        const all = (settings.tournaments || []).map((t, i) => ({ ...getTournamentInfo(t), originalIndex: i }));
                        const active = all.filter((t) => !t.archived);
                        const archived = all.filter((t) => t.archived);
                        return (
                          <>
                            {/* Active tournaments */}
                            {active.map((tInfo, idx) => {
                              const tName = tInfo.name;
                              const tLogo = tInfo.logoUrl;
                              const realIdx = tInfo.originalIndex;
                              return (
                                <div key={tName} className="reward-line" style={{ padding: "8px 0", borderBottom: "1px solid var(--hairline-soft)", display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "8px", alignItems: "center" }}>
                                  {/* Move up/down buttons */}
                                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                                    <button className="button" type="button" disabled={idx <= 0} onClick={() => {
                                      const arr = [...(settings.tournaments || [])];
                                      if (realIdx > 0) {
                                        [arr[realIdx - 1], arr[realIdx]] = [arr[realIdx], arr[realIdx - 1]];
                                        setSettings(current => ({ ...current, tournaments: arr }));
                                      }
                                    }} style={{ width: "20px", height: "18px", padding: 0, fontSize: "8px", background: "transparent" }}>▲</button>
                                    <button className="button" type="button" disabled={idx >= active.length - 1} onClick={() => {
                                      const arr = [...(settings.tournaments || [])];
                                      if (realIdx >= 0 && realIdx < arr.length - 1) {
                                        [arr[realIdx], arr[realIdx + 1]] = [arr[realIdx + 1], arr[realIdx]];
                                        setSettings(current => ({ ...current, tournaments: arr }));
                                      }
                                    }} style={{ width: "20px", height: "18px", padding: 0, fontSize: "8px", background: "transparent" }}>▼</button>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    {tLogo ? (
                                      <img src={tLogo} alt="" style={{ width: "20px", height: "20px", borderRadius: "4px", objectFit: "contain", background: "transparent" }} />
                                    ) : (
                                      <span style={{ fontSize: "12px" }}>🏆</span>
                                    )}
                                    <span>{tName}</span>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <label style={{ cursor: "pointer" }}>
                                      <span className="button gold" style={{ height: "24px", fontSize: "10px", padding: "0 8px", display: "inline-flex", alignItems: "center" }}>
                                        🖼️ {tLogo ? "เปลี่ยนโลโก้" : "อัปภาพโลโก้"}
                                      </span>
                                      <input 
                                        type="file" 
                                        accept="image/*" 
                                        onChange={(event) => updateTournamentLogo(tName, event.target.files?.[0])} 
                                        style={{ display: "none" }} 
                                      />
                                    </label>
                                    <button className="button" type="button" disabled={loading} onClick={() => toggleArchiveTournament(tName)} style={{ height: "24px", fontSize: "10px", padding: "0 8px" }}>Hide</button>
                                    <button className="button" type="button" disabled={loading} onClick={() => removeTournament(tName)} style={{ height: "24px", fontSize: "10px", padding: "0 8px" }}>Delete</button>
                                  </div>
                                </div>
                              );
                            })}
                            {/* Archived tournaments (compact, collapsible) */}
                            {archived.length > 0 && (
                              <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px dashed var(--hairline)" }}>
                                <button
                                  type="button"
                                  onClick={() => setShowArchived((v) => !v)}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    width: "100%",
                                    background: "transparent",
                                    border: "none",
                                    color: "var(--muted)",
                                    fontSize: "10px",
                                    padding: "4px",
                                    cursor: "pointer",
                                    textAlign: "left"
                                  }}
                                >
                                  <span style={{ fontSize: "10px", display: "inline-block", width: "12px" }}>
                                    {showArchived ? "▼" : "▶"}
                                  </span>
                                  <span>ทัวร์นาเมนต์ที่Hide ({archived.length})</span>
                                </button>
                                {showArchived && (
                                  <div style={{ marginTop: "4px" }}>
                                    {archived.map((tInfo) => {
                                      const tName = tInfo.name;
                                      return (
                                        <div key={tName} className="reward-line" style={{ padding: "4px 0", borderBottom: "1px solid var(--hairline-soft)", display: "grid", gridTemplateColumns: "1fr auto", gap: "8px", alignItems: "center", opacity: 0.5 }}>
                                          <span style={{ fontSize: "12px", textDecoration: "line-through" }}>{tName}</span>
                                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                            <button className="button" type="button" disabled={loading} onClick={() => toggleArchiveTournament(tName)} style={{ height: "20px", fontSize: "10px", padding: "0 6px" }}>Show</button>
                                            <button className="button" type="button" disabled={loading} onClick={() => removeTournament(tName)} style={{ height: "20px", fontSize: "10px", padding: "0 6px" }}>Delete</button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        );
                      })()
                    )}
                    {(settings.tournaments || []).length > 1 && (
                      <button className="button gold" type="button" disabled={loading} onClick={async () => {
                        try {
                          setLoading(true);
                          const res = await fetch("/api/admin/settings", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ tournaments: settings.tournaments })
                          });
                          const payload = await res.json();
                          if (payload.ok) {
                            setSettings(current => ({ ...current, tournaments: payload.data?.tournaments || current.tournaments }));
                            alert("Saveลำดับทัวร์นาเมนต์successfully");
                          }
                        } catch (e) {
                          alert("An error occurred");
                        } finally {
                          setLoading(false);
                        }
                      }} style={{ height: "34px", fontSize: "12px", padding: "0 16px", marginTop: "12px", width: "100%" }}>
                        💾 Saveลำดับทัวร์นาเมนต์
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === "admins" && (
            <section className="panel" style={{ width: "100%", maxWidth: "600px", display: "grid", gap: "16px", margin: "0 auto" }}>
              <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}><h3>รายชื่อAdminsระบบ</h3><span className="micro">{admins.length} players</span></div>
                <form className="modal-body" onSubmit={makeAdmin} style={{ padding: "12px 0 0 0" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px", marginBottom: "12px" }}>
                    <input value={adminEmailInput} onChange={(event) => setAdminEmailInput(event.target.value)} placeholder="ใส่EmailUserที่นี่" style={{ height: "34px", border: "1px solid var(--hairline)" }} />
                    <button className="button gold" disabled={loading} type="submit">AddedAdminsใหม่</button>
                  </div>
                  <div className="admin-option-list">
                    {admins.map((admin) => (
                      <div key={admin.id} className="reward-line" style={{ padding: "8px 0", borderBottom: "1px solid var(--hairline-soft)" }}>
                        <span>{admin.displayName || admin.email} ({admin.email})</span>
                        {admin.email.toLowerCase() === adminEmail.toLowerCase() ? (
                          <b className="accent-gold">คุณ (Adminsหลัก)</b>
                        ) : (
                          <button className="button" type="button" disabled={loading} onClick={() => removeAdmin(admin.email)}>Removedสิทธิ์Admins</button>
                        )}
                      </div>
                    ))}
                  </div>
                  <span className="meta" style={{ display: "block", marginTop: "12px", lineHeight: "1.4" }}>หมายเหตุ: Adminsใหม่ต้องเคยลงชื่อสมัครใช้บริการ (Sign Up / Sign In) ในหน้าหลักมาก่อนอย่างน้อย 1 ครั้ง เพื่อให้ข้อมูลสร้างขึ้นในฐานข้อมูล Supabase ถึงจะกดAddedรายชื่อจากตรงนี้ได้successfully</span>
                </form>
              </section>
            </section>
          )}

          {activeTab === "users" && (
            <section className="panel" style={{ width: "100%", maxWidth: "900px", display: "grid", gap: "16px", margin: "0 auto" }}>
              <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3>ManageUser ({users.length} people)</h3>
                  <button className="button gold" onClick={loadUsers} disabled={usersLoading} style={{ height: "26px", fontSize: "11px", padding: "0 10px" }}>
                    🔄 Refresh
                  </button>
                </div>

                {usersLoading ? (
                  <div style={{ textAlign: "center", padding: "20px", color: "var(--text-weak)" }}>กำลังโหลดข้อมูลUser...</div>
                ) : (
                  <div style={{ overflowX: "auto", marginTop: "12px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                      <thead>
                        <tr style={{ color: "var(--muted)", textAlign: "left", borderBottom: "1px solid var(--hairline)" }}>
                          <th style={{ padding: "6px 8px", cursor: "pointer", whiteSpace: "nowrap" }} onClick={() => { setUserPage(1); setUserSort(s => ({ key: "name", dir: s.key === "name" && s.dir === "asc" ? "desc" : "asc" })); }}>ชื่อUser ⬍</th>
                          <th style={{ padding: "6px 8px", cursor: "pointer", whiteSpace: "nowrap" }} onClick={() => { setUserPage(1); setUserSort(s => ({ key: "email", dir: s.key === "email" && s.dir === "asc" ? "desc" : "asc" })); }}>Email ⬍</th>
                          <th style={{ padding: "6px 8px", cursor: "pointer", textAlign: "right", whiteSpace: "nowrap" }} onClick={() => { setUserPage(1); setUserSort(s => ({ key: "coinBalance", dir: s.key === "coinBalance" && s.dir === "asc" ? "desc" : "asc" })); }}>Coin Balance ⬍</th>
                          <th style={{ padding: "6px 8px", textAlign: "center", whiteSpace: "nowrap" }}>Admin</th>
                          <th style={{ padding: "6px 8px", cursor: "pointer", whiteSpace: "nowrap" }} onClick={() => { setUserPage(1); setUserSort(s => ({ key: "createdAt", dir: s.key === "createdAt" && s.dir === "asc" ? "desc" : "asc" })); }}>สร้างเมื่อ ⬍</th>
                          <th style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>ที่อยู่</th>
                          <th style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>Claim ล่าสุด</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const sorted = [...users].sort((a, b) => {
                            const dir = userSort.dir === "asc" ? 1 : -1;
                            const key = userSort.key;
                            if (key === "name") return dir * (a.name || "").localeCompare(b.name || "");
                            if (key === "email") return dir * (a.email || "").localeCompare(b.email || "");
                            if (key === "coinBalance") return dir * ((a.coinBalance || 0) - (b.coinBalance || 0));
                            if (key === "createdAt") return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                            return 0;
                          });
                          const userPageSize = 20;
                          const totalPages = Math.max(1, Math.ceil(sorted.length / userPageSize));
                          const safePage = Math.min(userPage, totalPages);
                          const start = (safePage - 1) * userPageSize;
                          const paged = sorted.slice(start, start + userPageSize);
                          return paged.map((u) => (
                            <tr key={u.id} style={{ borderBottom: "1px solid var(--hairline-soft)", transition: "background 120ms" }} onMouseEnter={(e) => (e.currentTarget.style.background = "var(--card-2)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                              <td style={{ padding: "8px", fontWeight: 600, color: "var(--text-strong)", whiteSpace: "nowrap" }}>{u.name || "-"}</td>
                              <td style={{ padding: "8px", color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "180px" }}>{u.email || "-"}</td>
                              <td style={{ padding: "8px", textAlign: "right", fontFamily: "var(--mono)", fontWeight: 600 }}>{Number(u.coinBalance || 0).toLocaleString()}</td>
                              <td style={{ padding: "8px", textAlign: "center" }}>{u.isAdmin ? "✅" : "-"}</td>
                              <td style={{ padding: "8px", color: "var(--muted)", fontSize: "10px", whiteSpace: "nowrap" }}>{u.createdAt ? new Date(u.createdAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "-"}</td>
                              <td style={{ padding: "8px", color: "var(--text)", fontSize: "10px", whiteSpace: "nowrap", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }} title={u.shippingAddress || u.shippingName || undefined}>
                                {u.shippingName ? `${u.shippingName}${u.shippingAddress ? ', ' + u.shippingAddress.slice(0, 30) + '...' : ''}` : (u.shippingAddress ? u.shippingAddress.slice(0, 30) + '...' : '-')}
                              </td>
                              <td style={{ padding: "8px", color: "var(--muted)", fontSize: "10px", whiteSpace: "nowrap" }}>{u.lastClaimAt ? new Date(u.lastClaimAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "-"}</td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>

                    {users.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px", paddingTop: "8px", borderTop: "1px solid var(--hairline-soft)" }}>
                        <span style={{ color: "var(--muted)", fontSize: "11px" }}>
                          Show {Math.min((userPage - 1) * 20 + 1, users.length)}–{Math.min(userPage * 20, users.length)} จาก {users.length} people
                        </span>
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          <button className="button" disabled={userPage <= 1} onClick={() => setUserPage(p => Math.max(1, p - 1))} style={{ height: "26px", fontSize: "11px", padding: "0 10px" }}>◀ ก่อนหน้า</button>
                          <span style={{ color: "var(--text)", fontSize: "11px", fontWeight: 600, minWidth: "40px", textAlign: "center" }}>หน้า {userPage}</span>
                          <button className="button" disabled={userPage >= Math.max(1, Math.ceil(users.length / 20))} onClick={() => setUserPage(p => p + 1)} style={{ height: "26px", fontSize: "11px", padding: "0 10px" }}>ถัดไป ▶</button>
                        </div>
                      </div>
                    )}

                    {users.length === 0 && (
                      <div style={{ textAlign: "center", padding: "30px", color: "var(--text-weak)", border: "1px dashed var(--hairline)", borderRadius: "8px" }}>
                        <strong>ไม่มีUserในระบบ</strong>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </section>
          )}

          {activeTab === "contests" && (
            <section className="panel" style={{ width: "100%", maxWidth: "900px", margin: "0 auto", background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3>Prize Contests</h3>
                <div>
                  <button className="button gold" onClick={() => setShowNewContestForm(true)} style={{ height: "26px", fontSize: "11px", padding: "0 10px" }}>
                    + Create Contest
                  </button>
                </div>
              </div>

              {/* New Contest Form */}
              {showNewContestForm && (
                <section style={{ border: "1px solid var(--yellow)", background: "rgba(255,225,0,0.05)", borderRadius: "8px", padding: "12px", marginBottom: "16px" }}>
                  <h4 style={{ color: "var(--yellow)", marginBottom: "12px", fontSize: "12px" }}>+ Create New Contest</h4>
                  <div style={{ display: "grid", gap: "10px" }}>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>ชื่อกิจกรรม *</label>
                      <input
                        type="text"
                        className="button"
                        placeholder="เช่น: แข่งขันเดือนกรกฎาคม"
                        value={newContestName}
                        onChange={(e) => setNewContestName(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>Details</label>
                      <input
                        type="text"
                        className="button"
                        placeholder="DetailsAddedเติม ( facultative)"
                        value={newContestDescription}
                        onChange={(e) => setNewContestDescription(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>🏆 1st Prize *</label>
                      <input
                        type="text"
                        className="button"
                        placeholder="เช่น: ตั๋ว concert, เสื้อ, ถ้วย..."
                        value={newContestPrize1}
                        onChange={(e) => setNewContestPrize1(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>🎁 2nd Prize</label>
                      <input
                        type="text"
                        className="button"
                        placeholder=" facultative"
                        value={newContestPrize2}
                        onChange={(e) => setNewContestPrize2(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>🎁 3rd Prize</label>
                      <input
                        type="text"
                        className="button"
                        placeholder=" facultative"
                        value={newContestPrize3}
                        onChange={(e) => setNewContestPrize3(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>🎁 4th Prize</label>
                      <input
                        type="text"
                        className="button"
                        placeholder=" facultative"
                        value={newContestPrize4}
                        onChange={(e) => setNewContestPrize4(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>🎁 5th Prize</label>
                      <input
                        type="text"
                        className="button"
                        placeholder=" facultative"
                        value={newContestPrize5}
                        onChange={(e) => setNewContestPrize5(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div style={{ color: "var(--yellow)", fontSize: "10px", padding: "4px 8px", background: "rgba(255,225,0,0.05)", borderRadius: "4px" }}>
                      ⚠️ ผู้Won (Top 1) จะได้รับรางวัลทั้งหมด 5 อย่าง
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>End Time * (GMT+7)</label>
                      <input
                        type="datetime-local"
                        className="button"
                        value={newContestEndTime}
                        onChange={(e) => setNewContestEndTime(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                      <button type="button" className="button" onClick={() => {
                        setShowNewContestForm(false);
                        setShowEditContestForm(false);
                        setEditingContestId(null);
                      }} style={{ flex: 1, height: "30px", fontSize: "11px" }}>
                        Cancel
                      </button>
                      {editingContestId ? (
                        <button type="button" className="button gold" onClick={handleEditContest} style={{ flex: 1, height: "30px", fontSize: "11px" }}>
                          Save
                        </button>
                      ) : (
                        <button type="button" className="button gold" onClick={handleCreateContest} style={{ flex: 1, height: "30px", fontSize: "11px" }}>
                          สร้าง
                        </button>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {/* Edit Contest Modal */}
              {showEditContestForm && editingContestId && (
                <section style={{ border: "1px solid var(--yellow)", background: "rgba(255,225,0,0.05)", borderRadius: "8px", padding: "12px", marginBottom: "16px" }}>
                  <h4 style={{ color: "var(--yellow)", marginBottom: "12px", fontSize: "12px" }}>✏️ Editกิจกรรม</h4>
                  <div style={{ display: "grid", gap: "10px" }}>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>ชื่อกิจกรรม *</label>
                      <input
                        type="text"
                        className="button"
                        placeholder="ชื่อกิจกรรม"
                        value={newContestName}
                        onChange={(e) => setNewContestName(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>Details</label>
                      <input
                        type="text"
                        className="button"
                        placeholder="Details ( facultative)"
                        value={newContestDescription}
                        onChange={(e) => setNewContestDescription(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>🏆 1st Prize *</label>
                      <input
                        type="text"
                        className="button"
                        placeholder="เช่น: ตั๋ว concert, เสื้อ, ถ้วย..."
                        value={newContestPrize1}
                        onChange={(e) => setNewContestPrize1(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>🎁 2nd Prize</label>
                      <input
                        type="text"
                        className="button"
                        placeholder=" facultative"
                        value={newContestPrize2}
                        onChange={(e) => setNewContestPrize2(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>🎁 3rd Prize</label>
                      <input
                        type="text"
                        className="button"
                        placeholder=" facultative"
                        value={newContestPrize3}
                        onChange={(e) => setNewContestPrize3(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>🎁 4th Prize</label>
                      <input
                        type="text"
                        className="button"
                        placeholder=" facultative"
                        value={newContestPrize4}
                        onChange={(e) => setNewContestPrize4(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>🎁 5th Prize</label>
                      <input
                        type="text"
                        className="button"
                        placeholder=" facultative"
                        value={newContestPrize5}
                        onChange={(e) => setNewContestPrize5(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div style={{ color: "var(--yellow)", fontSize: "10px", padding: "4px 8px", background: "rgba(255,225,0,0.05)", borderRadius: "4px" }}>
                      ⚠️ ผู้Won (Top 1) จะได้รับรางวัลทั้งหมด 5 อย่าง
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>End Time * (GMT+7)</label>
                      <input
                        type="datetime-local"
                        className="button"
                        value={newContestEndTime}
                        onChange={(e) => setNewContestEndTime(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                      <button type="button" className="button" onClick={() => {
                        setShowEditContestForm(false);
                        setEditingContestId(null);
                      }} style={{ flex: 1, height: "30px", fontSize: "11px" }}>
                        Cancel
                      </button>
                      <button type="button" className="button gold" onClick={handleEditContest} style={{ flex: 1, height: "30px", fontSize: "11px" }}>
                        Save
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {contestsLoading ? (
                <div style={{ textAlign: "center", padding: "20px", color: "var(--text-weak)" }}>Loading...</div>
              ) : contests.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px", color: "var(--text-weak)", border: "1px dashed var(--hairline)", borderRadius: "8px" }}>
                  <strong>ยังไม่มีPrize Contests</strong>
                </div>
              ) : (
                <div style={{ display: "grid", gap: "12px" }}>
                  {contests.map((contest) => (
                    <div key={contest.id} style={{ border: "1px solid var(--hairline)", borderRadius: "8px", padding: "12px", background: "var(--bg)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "8px" }}>
                        <div>
                          <strong style={{ color: "var(--yellow)", fontSize: "14px" }}>{contest.name}</strong>
                          {contest.status === "active" && (
                            <span style={{ marginLeft: "8px", fontSize: "10px", padding: "2px 6px", background: "var(--green)", color: "white", borderRadius: "4px" }}>กำลังจัด</span>
                          )}
                          {contest.status === "ended" && (
                            <span style={{ marginLeft: "8px", fontSize: "10px", padding: "2px 6px", background: "var(--muted)", color: "white", borderRadius: "4px" }}>สิ้นสุดแล้ว</span>
                          )}
                          {contest.status === "cancelled" && (
                            <span style={{ marginLeft: "8px", fontSize: "10px", padding: "2px 6px", background: "var(--red)", color: "white", borderRadius: "4px" }}>Cancel</span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: "6px" }}>
                          {contest.status === "active" && (
                            <>
                              <button className="button" onClick={() => {
                                // Open edit modal
                                setEditingContestId(contest.id);
                                setNewContestName(contest.name || "");
                                setNewContestDescription(contest.description || "");
                                // Convert UTC to GMT+7 for datetime-local
                                const localDate = new Date(new Date(contest.end_time).getTime() + 7 * 60 * 60 * 1000);
                                setNewContestEndTime(localDate.toISOString().slice(0, 16));
                                setNewContestPrize1(contest.prize_1 || "");
                                setNewContestPrize2(contest.prize_2 || "");
                                setNewContestPrize3(contest.prize_3 || "");
                                setNewContestPrize4(contest.prize_4 || "");
                                setNewContestPrize5(contest.prize_5 || "");
                                setShowEditContestForm(true);
                              }} style={{ fontSize: "10px", padding: "4px 8px", height: "24px" }}>
                                ✏️ Edit
                              </button>
                              <button className="button gold" onClick={async () => {
                                if (confirm(`ยืนยันสิ้นสุดกิจกรรมนี้?\nระบบจะตรวจสอบ Rank 1 ใน Leaderboard ณ ขณะนี้ และตั้งเป็นผู้Won\nผู้Wonจะได้รับรางวัลทั้งหมด ${[contest.prize_1, contest.prize_2, contest.prize_3, contest.prize_4, contest.prize_5].filter(Boolean).length} อย่าง`)) {
                                  try {
                                    const updateRes = await fetch(`/api/admin/contests/${contest.id}`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ action: "end_contest", status: "ended" }),
                                    });
                                    const updatePayload = await updateRes.json();
                                    if (updatePayload.ok) {
                                      loadContests();
                                      const winner = updatePayload.winner;
                                      if (winner) {
                                        alert(`สิ้นสุดกิจกรรมแล้ว!\n\n🏆 ผู้Won: ${winner.display_name || winner.shipping_name || winner.id}\n\n${winner.shipping_address ? '✅ ที่อยู่สำหรับจัดส่ง:\n' + winner.shipping_name + '\n' + winner.shipping_address + '\n' + winner.shipping_zipcode + '\n' + winner.shipping_phone : '⚠️ ผู้Wonยังไม่ได้กรอกที่อยู่!'}`);
                                      } else {
                                        alert("สิ้นสุดกิจกรรมแล้ว! ผู้Won (Top 1) จะได้รับรางวัลทั้งหมด");
                                      }
                                    } else {
                                      alert("ไม่successfully: " + updatePayload.error);
                                    }
                                  } catch (e) {
                                    alert("ไม่successfully");
                                  }
                                }
                              }} style={{ fontSize: "10px", padding: "4px 8px", height: "24px" }}>
                                🏆 สิ้นสุดกิจกรรม (Top 1 ได้รางวัลทั้งหมด)
                              </button>
                              <button className="button" onClick={async () => {
                                if (confirm("ยืนยันCancelกิจกรรมนี้?")) {
                                  try {
                                    const updateRes = await fetch(`/api/admin/contests/${contest.id}`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ status: "cancelled" }),
                                    });
                                    const updatePayload = await updateRes.json();
                                    if (updatePayload.ok) {
                                      loadContests();
                                    }
                                  } catch (e) {
                                    // Ignored
                                  }
                                }
                              }} style={{ fontSize: "10px", padding: "4px 8px", height: "24px", color: "#ff4d4f", borderColor: "#ff4d4f" }}>
                                ❌ Cancel
                              </button>
                            </>
                          )}
                          {contest.status === "ended" && (
                            <>
                              <button className="button" onClick={async () => {
                                const newWinnerId = prompt("กรอก User ID ใหม่ของผู้Won:");
                                if (!newWinnerId) return;
                                try {
                                  const updateRes = await fetch(`/api/admin/contests/${contest.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ winner_user_id: newWinnerId }),
                                  });
                                  const updatePayload = await updateRes.json();
                                  if (updatePayload.ok) {
                                    loadContests();
                                    alert("อัปเดตผู้Wonแล้ว");
                                  } else {
                                    alert("ไม่successfully: " + updatePayload.error);
                                  }
                                } catch (e) {
                                  alert("ไม่successfully");
                                }
                              }} style={{ fontSize: "10px", padding: "4px 8px", height: "24px" }}>
                                🔄 เปลี่ยนผู้Won
                              </button>
                              <button className="button" onClick={async () => {
                                if (confirm("ยืนยันDeleteกิจกรรมนี้?")) {
                                  try {
                                    const updateRes = await fetch(`/api/admin/contests/${contest.id}`, {
                                      method: "DELETE",
                                    });
                                    const updatePayload = await updateRes.json();
                                    if (updatePayload.ok) {
                                      loadContests();
                                    }
                                  } catch (e) {
                                    // Ignored
                                  }
                                }
                              }} style={{ fontSize: "10px", padding: "4px 8px", height: "24px", color: "#ff4d4f", borderColor: "#ff4d4f" }}>
                                🗑️ Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {contest.description && (
                        <div style={{ fontSize: "11px", color: "var(--text)", marginBottom: "8px" }}>
                          {contest.description}
                        </div>
                      )}

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "11px" }}>
                        <div>
                          <span style={{ color: "var(--muted)" }}>End Time:</span>
                          <strong style={{ marginLeft: "4px", color: "var(--text-strong)" }}>
                            {new Date(contest.end_time).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}
                          </strong>
                        </div>
                        <div>
                          <span style={{ color: "var(--muted)" }}>🏆 รางวัลทั้งหมด (Top 1 ได้ทั้งหมด):</span>
                          <div style={{ marginLeft: "4px", marginTop: "4px" }}>
                            {contest.prize_1 && <div style={{ color: "var(--yellow)", fontSize: "11px" }}>🎁 {contest.prize_1}</div>}
                            {contest.prize_2 && <div style={{ color: "var(--text)", fontSize: "11px" }}>🎁 {contest.prize_2}</div>}
                            {contest.prize_3 && <div style={{ color: "var(--text)", fontSize: "11px" }}>🎁 {contest.prize_3}</div>}
                            {contest.prize_4 && <div style={{ color: "var(--muted)", fontSize: "11px" }}>🎁 {contest.prize_4}</div>}
                            {contest.prize_5 && <div style={{ color: "var(--muted)", fontSize: "11px" }}>🎁 {contest.prize_5}</div>}
                            {!contest.prize_1 && !contest.prize_2 && !contest.prize_3 && !contest.prize_4 && !contest.prize_5 && <strong style={{ color: "var(--yellow)" }}>ไม่มีรางวัล</strong>}
                          </div>
                        </div>
                      </div>

                      {contest.winner_user_id && (
                        <div style={{ marginTop: "12px", padding: "8px", background: "rgba(255, 225, 0, 0.1)", borderRadius: "6px", border: "1px solid rgba(255, 225, 0, 0.3)" }}>
                          <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "4px" }}>
                            🏆 ผู้Won:
                            <strong style={{ color: "var(--yellow)", marginLeft: "4px" }}>
                              {contest.winner?.display_name || contest.winner?.shipping_name || "Unknown"}
                            </strong>
                          </div>
                          {contest.winner && contest.winner.shipping_address ? (
                            <div style={{ fontSize: "10px", color: "var(--text)", whiteSpace: "pre-wrap" }}>
                              ✅ ที่อยู่สำหรับจัดส่ง:
                              <div style={{ marginTop: "4px", color: "var(--text-strong)" }}>
                                {contest.winner.shipping_name}<br />
                                {contest.winner.shipping_address}<br />
                                {contest.winner.shipping_zipcode}<br />
                                {contest.winner.shipping_phone}
                              </div>
                            </div>
                          ) : (
                            <div style={{ fontSize: "10px", color: "var(--red)" }}>
                              ⚠️ ผู้Wonยังไม่ได้กรอกที่อยู่!
                              <button className="button" style={{ marginLeft: "6px", fontSize: "9px", padding: "2px 6px", height: "20px" }} onClick={() => {
                                if (confirm("ส่งข้อความแจ้งเตือนให้ผู้Wonกรอกที่อยู่?")) {
                                  // Just show alert for now
                                  alert("ข้อความแจ้งเตือนจะถูกส่งให้ผู้Won");
                                }
                              }}>
                                แจ้งเตือน
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeTab === "chat" && (
            <section className="panel" style={{ width: "100%", maxWidth: "900px", display: "grid", gap: "16px", margin: "0 auto" }}>
              <div className="panel-head">
                <h2>💬 ManageChat</h2>
                <span className="micro">ตรวจสอบและDeleteข้อความท่ีไม่เหมาะสม</span>
              </div>

              <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                <button className="button" onClick={() => loadChatMessages()} disabled={chatLoading} style={{ fontSize: "11px", padding: "4px 12px" }}>
                  {chatLoading ? 'Loading...' : 'Refresh'}
                </button>
                <span style={{ fontSize: "11px", color: "var(--muted)", alignSelf: "center" }}>
                  ทั้งหมด {chatMessages.length} ข้อความ · {chatMessages.filter(m => !m.isDeleted).length} ยังไม่Delete
                </span>
              </div>

              <div style={{ display: "grid", gap: "6px", maxHeight: "500px", overflowY: "auto" }}>
                {chatMessages.length === 0 && !chatLoading && (
                  <div style={{ padding: "20px", textAlign: "center", color: "var(--muted)", fontSize: "12px" }}>
                    ยังไม่มี่ข้อความChat
                  </div>
                )}
                {chatMessages.filter(m => !m.isDeleted).map((msg) => (
                  <div key={msg.id} style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    gap: "12px",
                    alignItems: "center",
                    padding: "10px 14px",
                    background: "var(--bg)",
                    border: "1px solid var(--hairline)",
                    borderRadius: "8px",
                  }}>
                    <div style={{ display: "grid", gap: "2px" }}>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <span style={{ fontSize: "12px", fontWeight: "700", color: msg.userRole === "admin" ? "var(--yellow)" : "var(--info)" }}>
                          {msg.displayName || "นิรนาม"}
                        </span>
                        <span style={{ fontSize: "9px", color: "var(--muted)" }}>
                          @{msg.userEmail?.split("@")[0] || "?"}
                        </span>
                        
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text)", lineHeight: "1.4" }}>
                        {msg.message}
                      </div>
                      <div style={{ fontSize: "9px", color: "var(--muted)" }}>
                        🕐 {new Date(msg.createdAt).toLocaleString("th-TH")}
                      </div>
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--muted)" }}>
                      ID: {msg.id.slice(0, 8)}
                    </div>
                    <button
                        onClick={() => deleteChatMessage(msg.id)}
                        style={{
                          background: "transparent",
                          border: "1px solid var(--red)",
                          color: "var(--red)",
                          borderRadius: "6px",
                          padding: "4px 10px",
                          fontSize: "10px",
                          cursor: "pointer",
                          fontWeight: "600",
                        }}
                      >
                        Delete
                      </button>
                  </div>
                ))}
              </div>
            </section>
          )}


          {activeTab === "reports" && (
            <section className="panel" style={{ width: "100%", maxWidth: "900px", display: "grid", gap: "16px", margin: "0 auto" }}>
              <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3>entriesReports ({reports.length} entries)</h3>
                  <button className="button gold" onClick={loadReports} disabled={reportsLoading} style={{ height: "26px", fontSize: "11px", padding: "0 10px" }}>
                    🔄 Refresh
                  </button>
                </div>

                {reportsLoading ? (
                  <div style={{ textAlign: "center", padding: "20px", color: "var(--text-weak)" }}>กำลังโหลดข้อมูล...</div>
                ) : (
                  <div style={{ overflowX: "auto", marginTop: "12px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                      <thead>
                        <tr style={{ color: "var(--muted)", textAlign: "left", borderBottom: "1px solid var(--hairline)" }}>
                          <th style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>Email</th>
                          <th style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>ข้อความ</th>
                          <th style={{ padding: "6px 8px", textAlign: "center", whiteSpace: "nowrap" }}>สถานะ</th>
                          <th style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>วันที่</th>
                          <th style={{ padding: "6px 8px", textAlign: "center", whiteSpace: "nowrap" }}>Manage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reports.map((r) => (
                          <tr key={r.id} style={{ borderBottom: "1px solid var(--hairline-soft)", transition: "background 120ms" }} onMouseEnter={(e) => (e.currentTarget.style.background = "var(--card-2)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                            <td style={{ padding: "8px", color: "var(--text)", whiteSpace: "nowrap" }}>{r.email || "-"}</td>
                            <td style={{ padding: "8px", color: "var(--text-strong)", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.message || "-"}</td>
                            <td style={{ padding: "8px", textAlign: "center" }}>
                              {r.status === "pending" ? (
                                <span style={{ color: "var(--yellow)", fontWeight: 700, fontSize: "10px" }}>⏳ รอดำเนินการ</span>
                              ) : (
                                <span style={{ color: "var(--green)", fontWeight: 700, fontSize: "10px" }}>✅ เสร็จสิ้น</span>
                              )}
                            </td>
                            <td style={{ padding: "8px", color: "var(--muted)", fontSize: "10px", whiteSpace: "nowrap" }}>
                              {r.created_at ? new Date(r.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "-"}
                            </td>
                            <td style={{ padding: "8px", textAlign: "center", whiteSpace: "nowrap" }}>
                              {r.status === "pending" && (
                                <button className="button gold" style={{ height: "22px", fontSize: "10px", padding: "0 8px" }} onClick={() => handleUpdateReport(r.id, "resolved")}>
                                  ทำเครื่องหมายเสร็จสิ้น
                                </button>
                              )}
                              <button className="button" style={{ height: "22px", fontSize: "10px", padding: "0 8px", marginLeft: "4px", color: "#ff4d4f", borderColor: "#ff4d4f", background: "transparent" }} onClick={() => handleUpdateReport(r.id, r.status, true)}>
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {reports.length === 0 && (
                      <div style={{ textAlign: "center", padding: "30px", color: "var(--text-weak)", border: "1px dashed var(--hairline)", borderRadius: "8px" }}>
                        <strong>ไม่มีentriesReports</strong>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </section>
          )}

        </section>
      </div>
    </main>
  );
}
