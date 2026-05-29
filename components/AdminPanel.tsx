"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type AdminPrediction = {
  id: string;
  tournamentName: string;
  question: string;
  status: string;
  opensAt: string | null;
  closesAt: string | null;
  feeRate: number;
  options: { id: string; label: string; sortOrder: number }[];
};

type AdminUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: "admin";
  createdAt: string;
};

type WinnerClaim = {
  id: string;
  month: string;
  rewardName: string;
  winnerName: string;
  winnerEmail: string;
  receiverName: string;
  phone: string;
  address: string;
  note: string;
  status: "pending" | "contacting" | "completed";
  trackingNumber: string;
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
    optionLabel: string;
    amount: number;
    createdAt: string;
  }[];
};

type TournamentItem = {
  name: string;
  logoUrl: string;
};

type SiteSettings = {
  info: {
    howToPlay: string;
    reward: string;
    questionTime: string;
  };
  reward: {
    name: string;
    winnerBy: string;
    month: string;
    approved: boolean;
  };
  tournaments: (string | TournamentItem)[];
  savedQuestions: string[];
  season?: {
    startAt: string;
    endAt: string;
    status: "active" | "ended";
  };
  historySeasons?: string[];
  predictionOrder?: string[];
};

type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
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
  if (status === "open") return "กำลังเปิด";
  if (status === "closed") return "ปิดรับแล้ว";
  if (status === "resolved") return "สรุปผลแล้ว";
  if (status === "canceled") return "ยกเลิกแล้ว";
  if (status === "draft") return "ฉบับร่าง";
  return status;
}

const defaultSettings: SiteSettings = {
  info: {
    howToPlay: "Login, claim free coins, choose a question, select an answer, choose coins, then confirm prediction.",
    reward: "Season Top 10 is based on season profit. The season winner receives a reward after admin confirmation.",
    questionTime: "Each question has its own close time. When it closes, predictions stop and admin resolves the result."
  },
  reward: {
    name: "Season Prize",
    winnerBy: "Season Profit",
    month: "Season 1",
    approved: false
  },
  tournaments: [{ name: "Super League", logoUrl: "" }],
  savedQuestions: [
    "Which team will win the championship?",
    "Which team will get the Chicken Dinner?",
    "Who will get the most kills in this match?"
  ],
  season: {
    startAt: "2026-05-01T00:00",
    endAt: "2026-05-31T23:59",
    status: "active"
  }
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
    throw new Error(`API ${url}: ${payload.error || "คำสั่งไม่สำเร็จ"}`);
  }
  return payload.data;
}

export default function AdminPanel({ adminEmail }: { adminEmail: string }) {
  const [predictions, setPredictions] = useState<AdminPrediction[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [tournamentName, setTournamentName] = useState("Super League");
  const [question, setQuestion] = useState("");
  const [opensAt, setOpensAt] = useState(toDateTimeLocal(new Date()));
  const [closesAt, setClosesAt] = useState(toDateTimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [feeRate, setFeeRate] = useState("0.03");
  const [optionInput, setOptionInput] = useState("");
  const [adminEmailInput, setAdminEmailInput] = useState("");
  const [newTournamentInput, setNewTournamentInput] = useState("");
  const [newTournamentLogoUrl, setNewTournamentLogoUrl] = useState("");
  const [showQuickTournament, setShowQuickTournament] = useState(false);
  const [quickTournamentInput, setQuickTournamentInput] = useState("");
  const [optionsBulkInput, setOptionsBulkInput] = useState("");
  const [showBulkOptions, setShowBulkOptions] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardPrediction[]>([]);
  const [selectedDashboardId, setSelectedDashboardId] = useState<string | null>(null);
  const [selectedDashboardTournament, setSelectedDashboardTournament] = useState("");
  const [draftOptions, setDraftOptions] = useState<string[]>(["Alpha", "Bravo", "Charlie", "Delta"]);
  const [winningOptions, setWinningOptions] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  const [historySeasons, setHistorySeasons] = useState<string[]>([]);
  const [topUsers, setTopUsers] = useState<Array<{ id: string; email: string; displayName: string; monthlyProfit?: number }>>([]);
  const [claims, setClaims] = useState<WinnerClaim[]>([]);
  const [trackingInputs, setTrackingInputs] = useState<Record<string, string>>({});
  const [editClosesAt, setEditClosesAt] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // แท็บเมนูหลังบ้าน
  const [activeTab, setActiveTab] = useState<"questions" | "running" | "settings" | "admins" | "tournaments" | "claims" | "dashboard" | "reports">("dashboard");
  const [reports, setReports] = useState<any[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);

  const [localOrder, setLocalOrder] = useState<string[]>([]);

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

  // การแบ่งหน้าสำหรับคำถามที่กำลังรัน
  const [runningPage, setRunningPage] = useState(1);
  const runningPageSize = 5;
  const runningTotalPages = Math.max(1, Math.ceil(runningPredictions.length / runningPageSize));
  const currentRunning = useMemo(() => {
    const start = (runningPage - 1) * runningPageSize;
    return sortedRunningPredictions.slice(start, start + runningPageSize);
  }, [sortedRunningPredictions, runningPage]);

  // การแบ่งหน้าสำหรับคำถามที่หมดเวลา รอคำตอบ
  const [pendingPage, setPendingPage] = useState(1);
  const pendingPageSize = 5;
  const pendingTotalPages = Math.max(1, Math.ceil(pendingPredictions.length / pendingPageSize));
  const currentPending = useMemo(() => {
    const start = (pendingPage - 1) * pendingPageSize;
    return pendingPredictions.slice(start, start + pendingPageSize);
  }, [pendingPredictions, pendingPage]);

  // การแบ่งหน้าสำหรับคำถามทั้งหมด
  const [allPage, setAllPage] = useState(1);
  const allPageSize = 5;
  const allTotalPages = Math.max(1, Math.ceil(predictions.length / allPageSize));
  const currentAll = useMemo(() => {
    const start = (allPage - 1) * allPageSize;
    return predictions.slice(start, start + allPageSize);
  }, [predictions, allPage]);

  // การแบ่งหน้าสำหรับรายการเคลมพัสดุรางวัล
  const [claimsPage, setClaimsPage] = useState(1);
  const claimsPageSize = 5;
  const claimsTotalPages = Math.max(1, Math.ceil(claims.length / claimsPageSize));
  const currentClaims = useMemo(() => {
    const start = (claimsPage - 1) * claimsPageSize;
    return claims.slice(start, start + claimsPageSize);
  }, [claims, claimsPage]);

  async function loadPredictions() {
    const data = await requestJson<AdminPrediction[]>("/api/admin/predictions");
    setPredictions(data);
  }

  async function loadAdmins() {
    const data = await requestJson<AdminUser[]>("/api/admin/users");
    setAdmins(data);
  }

  async function loadSettings() {
    const data = await requestJson<SiteSettings & { historySeasons?: string[] }>("/api/admin/settings");
    setSettings(data);
    if (data.historySeasons) {
      setHistorySeasons(data.historySeasons);
    }
    if (data.tournaments && data.tournaments.length > 0) {
      const first = data.tournaments[0];
      const firstName = typeof first === "string" ? first : first.name;
      setTournamentName(firstName);
    }
  }

  async function loadTopUsers() {
    const data = await requestJson<Array<{ id: string; email: string; displayName: string }>>("/api/admin/leaderboard");
    setTopUsers(data);
  }

  async function loadClaims() {
    const data = await requestJson<WinnerClaim[]>("/api/admin/claims");
    setClaims(data);
    const initialTracking: Record<string, string> = {};
    data.forEach((claim) => {
      initialTracking[claim.id] = claim.trackingNumber || "";
    });
    setTrackingInputs(initialTracking);
  }

  async function loadDashboardData() {
    const data = await requestJson<DashboardPrediction[]>("/api/admin/dashboard");
    setDashboardData(data);
    if (data.length > 0) {
      if (!selectedDashboardTournament) {
        setSelectedDashboardTournament(data[0].tournamentName);
      }
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
        alert(payload.error || "ทำรายการไม่สำเร็จ");
      }
    } catch {
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อเครือข่าย");
    }
  }

  async function reloadAll() {
    await Promise.all([loadPredictions(), loadAdmins(), loadSettings(), loadTopUsers(), loadClaims(), loadDashboardData()]);
  }

  useEffect(() => {
    reloadAll().catch((error) => setMessage(error.message));
  }, []);

  function addOption() {
    const next = optionInput.trim();
    if (!next) return;
    setDraftOptions((current) => [...current, next]);
    setOptionInput("");
  }

  function removeOption(index: number) {
    setDraftOptions((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function createPrediction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const options = draftOptions.map((item) => item.trim()).filter(Boolean);
      await requestJson<AdminPrediction>("/api/admin/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentName, question, opensAt, closesAt, feeRate: Number(feeRate), status: "open", options })
      });
      setMessage("สร้างคำถามแล้ว");
      setQuestion("");
      setDraftOptions(["Alpha", "Bravo", "Charlie", "Delta"]);
      await loadPredictions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "สร้างคำถามไม่สำเร็จ");
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
      setMessage(`เพิ่ม ${data.email} เป็นแอดมินแล้ว`);
      setAdminEmailInput("");
      await loadAdmins();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เพิ่มแอดมินไม่สำเร็จ");
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
      setMessage("มีชื่อทัวร์นาเมนต์นี้อยู่แล้ว");
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
      setMessage(`เพิ่มทัวร์นาเมนต์ ${name} สำเร็จ`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เพิ่มทัวร์นาเมนต์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function removeTournament(name: string) {
    const confirmed = window.confirm(`ลบทัวร์นาเมนต์ "${name}"? (คำถามที่มีอยู่จะไม่ถูกลบ แต่ทัวร์นาเมนต์นี้จะไม่แสดงในตัวเลือกสร้างคำถามใหม่)`);
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
      setMessage(`ลบทัวร์นาเมนต์ ${name} สำเร็จ`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ลบทัวร์นาเมนต์ไม่สำเร็จ");
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
        setMessage(`อัปเดตโลโก้ทัวร์นาเมนต์ "${tName}" สำเร็จ`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "อัปเดตโลโก้ไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    });
  }

  async function saveQuickTournament() {
    const name = quickTournamentInput.trim();
    if (!name) return;
    const exists = (settings.tournaments || []).some((t) => {
      const tName = typeof t === "string" ? t : t.name;
      return tName.toLowerCase() === name.toLowerCase();
    });
    if (exists) {
      setTournamentName(name);
      setQuickTournamentInput("");
      setShowQuickTournament(false);
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const newTour: TournamentItem = { name, logoUrl: "" };
      const nextTournaments = [...(settings.tournaments || []), newTour];
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournaments: nextTournaments })
      });
      setSettings(data);
      setTournamentName(name);
      setQuickTournamentInput("");
      setShowQuickTournament(false);
      setMessage(`เพิ่มและเลือกทัวร์นาเมนต์ ${name} แล้ว`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เพิ่มทัวร์นาเมนต์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
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
      setMessage("มีคำถามนี้ในระบบแล้ว");
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
      setMessage(`บันทึกแม่แบบคำถามสำเร็จ`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึกแม่แบบคำถามไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function removeQuestionTemplate(name: string) {
    const confirmed = window.confirm(`ลบแม่แบบคำถาม "${name}"?`);
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
      setMessage(`ลบแม่แบบคำถามสำเร็จ`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ลบแม่แบบคำถามไม่สำเร็จ");
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
      setMessage("บันทึกข้อความ Info สำเร็จ");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึก Info ไม่สำเร็จ");
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
        body: JSON.stringify({ predictionOrder: localOrder })
      });
      setSettings(data);
      setMessage("บันทึกลำดับคำถามเข้าสู่ระบบสำเร็จ");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึกลำดับคำถามไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function saveNewCloseTime(id: string) {
    const newTime = editClosesAt[id];
    if (!newTime) return;
    setLoading(true);
    setMessage("");
    try {
      await requestJson<{ ok: boolean }>(`/api/admin/predictions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closesAt: newTime })
      });
      setMessage("อัปเดตกำหนดเวลาปิดทายผลสำเร็จ");
      setEditingId(null);
      await reloadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "อัปเดตเวลาไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function saveCurrentSeasonSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    if (settings.season?.startAt && settings.season?.endAt) {
      if (new Date(settings.season.startAt).getTime() > new Date(settings.season.endAt).getTime()) {
        setMessage("⚠️ ข้อผิดพลาด: วันเวลาเริ่มต้น ต้องมาก่อน วันหมดเขตซีซั่น");
        setLoading(false);
        return;
      }
    }

    try {
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          season: settings.season,
          reward: settings.reward
        })
      });
      setSettings(data);
      setMessage("บันทึกข้อมูลเวลาและรางวัลประจำฤดูกาลสำเร็จ");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึกข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function savePreviousWinnerSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          reward: settings.reward 
        })
      });
      setSettings(data);
      setMessage("บันทึกข้อมูลผู้ชนะประจำฤดูกาลและอนุมัติเคลมสำเร็จ");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึกข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function finalizeLeaderboard() {
    const confirmed = window.confirm(`⚠️ คำเตือนสำคัญ:\n\nคุณกำลังจะสรุปคะแนนและรีเซ็ตแต้มกระดานของฤดูกาล "${settings.reward.month || "Season 1"}"\n\nระบบจะทำการ:\n1. คัดลอกและบันทึกสถิติ Top 20 ของผู้เล่นประจำซีซั่นนี้เก็บเข้าประวัติเกียรติยศถาวร\n2. รีเซ็ตคะแนนกำไรประจำซีซั่น (Season Profit) ของผู้เล่นทุกคนกลับเป็น 0 เพื่อเริ่มซีซั่นใหม่\n\nการกระทำนี้จะล้างกระดานอันดับคะแนนทันที ยืนยันปิดซีซั่นและเคลียร์คะแนน?`);
    if (!confirmed) return;
    setLoading(true);
    setMessage("");
    try {
      const data = await requestJson<{ month: string; snapshotCount: number }>("/api/admin/leaderboard/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: settings.reward.month })
      });
      setMessage(`ล้างกระดานเริ่มฤดูกาลใหม่เรียบร้อย! (บันทึกรายชื่อ Top 20 ของฤดูกาล ${data.month} เข้าระบบจำนวน ${data.snapshotCount} คน)`);
      await reloadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "สรุปปิดซีซั่นไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function removeAdmin(email: string) {
    const confirmed = window.confirm(`ถอดสิทธิ์แอดมินของ ${email}?`);
    if (!confirmed) return;
    setLoading(true);
    setMessage("");
    try {
      await requestJson<{ email: string; role: string }>("/api/admin/users/remove-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      setMessage(`ถอด ${email} ออกจากแอดมินแล้ว`);
      await loadAdmins();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ถอดแอดมินไม่สำเร็จ");
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
      setMessage(`เปลี่ยนสถานะเป็น ${statusLabel(nextStatus)} แล้ว`);
      setPredictions((current) => current.map((item) => item.id === id ? { ...item, status: nextStatus } : item));
      await loadPredictions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "อัปเดตไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function deletePrediction(id: string) {
    const confirmed = window.confirm("ลบคำถามนี้ถาวรออกจากระบบ? (ตัวเลือกคำตอบและรายการทายผลของคำถามนี้ทั้งหมดจะถูกลบออกไปด้วย และไม่สามารถย้อนคืนได้)");
    if (!confirmed) return;
    setLoading(true);
    setMessage("");
    try {
      await requestJson<unknown>(`/api/admin/predictions/${id}`, { method: "DELETE" });
      setMessage("ลบคำถามถาวรเรียบร้อยแล้ว");
      await loadPredictions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ลบคำถามไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function updateClaimStatus(id: string, status: string, trackingNumber?: string) {
    setLoading(true);
    setMessage("");
    try {
      await requestJson<unknown>("/api/admin/claims", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status,
          trackingNumber
        })
      });
      setMessage("อัปเดตสถานะการเคลมและจัดส่งพัสดุเรียบร้อยแล้ว");
      await loadClaims();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "อัปเดตสถานะเคลมไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function resolvePrediction(item: AdminPrediction) {
    const winningOptionId = winningOptions[item.id];
    if (!winningOptionId) {
      setMessage("เลือกคำตอบที่ชนะก่อน");
      return;
    }
    const winningLabel = item.options.find((option) => option.id === winningOptionId)?.label || "";
    const confirmed = window.confirm(`ยืนยันสรุปผล?\n\nคำถาม: ${item.question}\nคำตอบที่ชนะ: ${winningLabel}\n\nหลังยืนยัน ระบบจะจ่ายผลและแก้กลับเองไม่ได้ในหน้านี้`);
    if (!confirmed) return;

    setLoading(true);
    setMessage("");
    try {
      const data = await requestJson<{ winners: number; losers: number; totalPaid: number }>(`/api/admin/predictions/${item.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winningOptionId })
      });
      setMessage(`สรุปผลแล้ว: ชนะ ${data.winners || 0}, แพ้ ${data.losers || 0}, จ่าย ${data.totalPaid || 0}`);
      setPredictions((current) => current.map((row) => row.id === item.id ? { ...row, status: "resolved" } : row));
      await loadPredictions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "สรุปผลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function refundPrediction(item: AdminPrediction) {
    const confirmed = window.confirm(`ยืนยันยกเลิกและคืนเหรียญ?\n\nคำถาม: ${item.question}`);
    if (!confirmed) return;

    setLoading(true);
    setMessage("");
    try {
      const data = await requestJson<{ refundedEntries: number; totalRefunded: number }>(`/api/admin/predictions/${item.id}/refund`, { method: "POST" });
      setMessage(`คืนเหรียญแล้ว: ${data.refundedEntries || 0} รายการ, ${data.totalRefunded || 0} เหรียญ`);
      setPredictions((current) => current.map((row) => row.id === item.id ? { ...row, status: "canceled" } : row));
      await loadPredictions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "คืนเหรียญไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  function renderPredictionControls(item: AdminPrediction) {
    const disabled = loading || item.status === "resolved" || item.status === "canceled";
    return (
      <div className="admin-actions">
        {item.status !== "open" && item.status !== "resolved" && item.status !== "canceled" && (
          <button className="button gold" disabled={loading} onClick={() => updateStatus(item.id, "open")}>เปิดรับคำทาย</button>
        )}
        {item.status === "open" && (
          <button className="button" disabled={loading} onClick={() => updateStatus(item.id, "closed")}>ปิดทันที</button>
        )}
        {!disabled && (
          <>
            <select className="button" value={winningOptions[item.id] || ""} onChange={(event) => setWinningOptions((current) => ({ ...current, [item.id]: event.target.value }))}>
              <option value="">เลือกคำตอบที่ชนะ</option>
              {item.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            <button className="button primary" disabled={disabled} onClick={() => resolvePrediction(item)}>สรุปผล</button>
            <button className="button" disabled={disabled} onClick={() => refundPrediction(item)}>ยกเลิก + คืนเหรียญ</button>
          </>
        )}
        {(item.status === "resolved" || item.status === "canceled") && (
          <button className="button" type="button" disabled={loading} onClick={() => deletePrediction(item.id)} style={{ color: "#ff4d4f", borderColor: "#ff4d4f", background: "transparent" }}>
            🗑️ ลบคำถามถาวร
          </button>
        )}
      </div>
    );
  }

  return (
    <main className="page admin-page" style={{ padding: "10px 16px" }}>
      <div className="app admin-app" style={{ maxWidth: "1000px" }}>
        <header className="topbar" style={{ marginBottom: "8px" }}>
          <div className="brand-text">
            <h1>หลังบ้าน SUPERWIN</h1>
            <span>{adminEmail} · แอดมิน</span>
          </div>
          <div className="actions" style={{ gap: "6px" }}>
            <Link className="button gold" href="/">กลับหน้าเว็บ</Link>
          </div>
        </header>

        {message && <div className="admin-message" style={{ marginBottom: "12px" }}>{message}</div>}

        <div className="filter-row" style={{ justifyContent: "center", gap: "8px", marginBottom: "16px" }}>
          <button className={`button ${activeTab === "dashboard" ? "active" : ""}`} onClick={() => { setActiveTab("dashboard"); loadDashboardData().catch(() => undefined); }} style={{ borderRadius: "999px" }}>แดชบอร์ด</button>
          <button className={`button ${activeTab === "tournaments" ? "active" : ""}`} onClick={() => setActiveTab("tournaments")} style={{ borderRadius: "999px" }}>จัดการทัวร์นาเมนต์</button>
          <button className={`button ${activeTab === "questions" ? "active" : ""}`} onClick={() => setActiveTab("questions")} style={{ borderRadius: "999px" }}>สร้างคำถามใหม่</button>
          <button className={`button ${activeTab === "running" ? "active" : ""}`} onClick={() => setActiveTab("running")} style={{ borderRadius: "999px" }}>จัดการคำถาม</button>
          <button className={`button ${activeTab === "claims" ? "active" : ""}`} onClick={() => { setActiveTab("claims"); loadClaims().catch(() => undefined); }} style={{ borderRadius: "999px" }}>จัดส่งรางวัล</button>
          <button className={`button ${activeTab === "settings" ? "active" : ""}`} onClick={() => setActiveTab("settings")} style={{ borderRadius: "999px" }}>ตั้งค่าหน้าเว็บ & รางวัล</button>
          <button className={`button ${activeTab === "admins" ? "active" : ""}`} onClick={() => setActiveTab("admins")} style={{ borderRadius: "999px" }}>แอดมิน ({admins.length})</button>
          <button className={`button ${activeTab === "reports" ? "active" : ""}`} onClick={() => { setActiveTab("reports"); loadReports().catch(() => undefined); }} style={{ borderRadius: "999px" }}>แจ้งปัญหา ({reports.length})</button>
        </div>

        <section className="admin-content" style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px", maxWidth: "100%", justifyItems: "center", margin: "0 auto" }}>
          
          {activeTab === "dashboard" && (
            <section className="panel" style={{ width: "100%", maxWidth: "760px", display: "grid", gap: "16px", margin: "0 auto" }}>
              <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}>
                  <h2>กระดานวิเคราะห์ข้อมูล (Esports Pool Dashboard)</h2>
                  <span className="micro">ดูยอดทายแบบเรียลไทม์</span>
                </div>
                <div className="modal-body" style={{ padding: "12px 0 0 0", gap: "14px" }}>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>เลือกทัวร์นาเมนต์เพื่อวิเคราะห์สถิติทั้งหมด</span>
                    <select className="button" value={selectedDashboardTournament} onChange={(e) => setSelectedDashboardTournament(e.target.value)} style={{ width: "100%", height: "38px" }}>
                      <option value="">-- เลือกทัวร์นาเมนต์ --</option>
                      {Array.from(new Set(dashboardData.map((d) => d.tournamentName))).map((tour) => (
                        <option key={tour} value={tour}>{tour}</option>
                      ))}
                    </select>
                  </div>

                  {(() => {
                    if (!selectedDashboardTournament) {
                      return <div className="question"><span>กรุณาเลือกทัวร์นาเมนต์ที่ต้องการดูวิเคราะห์ข้อมูลสถิติ</span></div>;
                    }

                    const tournamentQuestions = dashboardData.filter((d) => d.tournamentName === selectedDashboardTournament);
                    if (tournamentQuestions.length === 0) {
                      return <div className="question"><span>ไม่พบข้อมูลคำถามในทัวร์นาเมนต์นี้</span></div>;
                    }

                    const totalTourCoins = tournamentQuestions.reduce((sum, q) => sum + q.totalPoolCoins, 0);
                    const totalTourPlayers = new Set(tournamentQuestions.flatMap((q) => q.playerBets.map((b) => b.email))).size;

                    return (
                      <div style={{ display: "grid", gap: "16px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                          <div className="info-block" style={{ background: "var(--bg)", textAlign: "center", padding: "10px" }}>
                            <span className="meta" style={{ fontSize: "9px" }}>จำนวนคำถามทั้งหมด</span>
                            <strong style={{ fontSize: "18px", color: "#fff", display: "block", marginTop: "4px" }}>{tournamentQuestions.length} คำถาม</strong>
                          </div>
                          <div className="info-block" style={{ background: "var(--bg)", textAlign: "center", padding: "10px" }}>
                            <span className="meta" style={{ fontSize: "9px" }}>ยอดรวมเหรียญทั้งทัวร์</span>
                            <strong style={{ fontSize: "18px", color: "var(--yellow)", display: "block", marginTop: "4px" }}>{totalTourCoins} Coins</strong>
                          </div>
                          <div className="info-block" style={{ background: "var(--bg)", textAlign: "center", padding: "10px" }}>
                            <span className="meta" style={{ fontSize: "9px" }}>ผู้เล่นร่วมสนุกทั้งทัวร์</span>
                            <strong style={{ fontSize: "18px", color: "#fff", display: "block", marginTop: "4px" }}>{totalTourPlayers} คน</strong>
                          </div>
                        </div>

                        <div style={{ display: "grid", gap: "14px" }}>
                          {tournamentQuestions.map((q) => (
                            <div key={q.id} style={{ border: "1px solid var(--hairline)", borderRadius: "12px", background: "var(--bg)", padding: "12px", display: "grid", gap: "8px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--hairline-soft)", paddingBottom: "6px" }}>
                                <strong style={{ fontSize: "13px", color: "#fff" }}>Q: {q.question}</strong>
                                <span className="pill" style={{ 
                                  fontSize: "10px", 
                                  height: "20px", 
                                  border: 0,
                                  background: q.status === "open" ? "rgba(255, 225, 0, 0.12)" : "rgba(255, 255, 255, 0.08)", 
                                  color: q.status === "open" ? "var(--yellow)" : "var(--text)" 
                                }}>
                                  {statusLabel(q.status)}
                                </span>
                              </div>

                              <div style={{ display: "flex", gap: "12px", fontSize: "11px", color: "var(--muted)" }}>
                                <span>ยอดรวมเหรียญพูล: <strong style={{ color: "var(--yellow)" }}>{q.totalPoolCoins} Coins</strong></span>
                                <span>ผู้เล่นร่วมทาย: <strong style={{ color: "#fff" }}>{q.uniquePlayers} คน</strong></span>
                              </div>

                              <div style={{ display: "grid", gap: "8px", marginTop: "4px" }}>
                                <span className="meta" style={{ color: "var(--yellow)", fontSize: "10px" }}>สัดส่วนและอัตราคูณ (Odds)</span>
                                {q.optionStats.map((stat) => {
                                  const pct = q.totalPoolCoins > 0 ? ((stat.totalCoins / q.totalPoolCoins) * 100).toFixed(1) : "0";
                                  return (
                                    <div key={stat.id} style={{ display: "grid", gap: "2px", padding: "6px 8px", background: "var(--card)", borderRadius: "6px" }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                                        <span style={{ color: "#fff" }}>{stat.label}</span>
                                        <strong style={{ color: "var(--yellow)" }}>คูณ {stat.multiplier > 0 ? `~${stat.multiplier}x` : "--"}</strong>
                                      </div>
                                      <div style={{ width: "100%", height: "3px", background: "var(--bg)", borderRadius: "1px", overflow: "hidden" }}>
                                        <div style={{ width: `${pct}%`, height: "100%", background: "var(--yellow)" }} />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              <div style={{ marginTop: "6px" }}>
                                <details style={{ cursor: "pointer" }}>
                                  <summary style={{ fontSize: "11px", color: "var(--yellow)", outline: "none" }}>ดูรายละเอียดผู้เล่นที่ทายข้อนี้ ({q.playerBets.length} รายการ)</summary>
                                  <div style={{ display: "grid", gap: "5px", marginTop: "6px", maxHeight: "150px", overflowY: "auto" }}>
                                    {q.playerBets.length ? q.playerBets.map((bet) => (
                                      <div key={bet.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 8px", background: "var(--card)", borderRadius: "4px", fontSize: "11px" }}>
                                        <span style={{ color: "var(--muted)" }}>{bet.displayName} ({bet.email}) ➔ {bet.optionLabel}</span>
                                        <strong className="accent-gold">-{bet.amount} Coins</strong>
                                      </div>
                                    )) : <div style={{ fontSize: "11px", color: "var(--muted)", textAlign: "center", padding: "6px" }}>ยังไม่มีรายการทายผล</div>}
                                  </div>
                                </details>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </section>
            </section>
          )}

          {activeTab === "questions" && (
            <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px", maxWidth: "600px", width: "100%", margin: "0 auto" }}>
              <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}><h2>สร้างคำถามใหม่</h2><span className="micro">เปิดทันทีหลังสร้าง</span></div>
              <form className="modal-body" onSubmit={createPrediction} style={{ padding: "12px 0 0 0" }}>
                <div style={{ display: "grid", gap: "4px" }}>
                  <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>Tournament (ชื่อทัวร์นาเมนต์)</span>
                    <button type="button" onClick={() => setShowQuickTournament(!showQuickTournament)} style={{ fontSize: "10px", color: "var(--yellow)", background: "transparent", border: "0", cursor: "pointer", textDecoration: "underline", padding: 0 }}>
                      {showQuickTournament ? "ปิด" : "+ เพิ่มทัวร์นาเมนต์ใหม่"}
                    </button>
                  </span>
                  {!showQuickTournament ? (
                    <select className="button" value={tournamentName} onChange={(event) => setTournamentName(event.target.value)} style={{ width: "100%", height: "34px", textAlign: "left" }}>
                      {!(settings.tournaments && settings.tournaments.length > 0) && (
                        <option value="">-- กรุณาเพิ่มชื่อทัวร์นาเมนต์ก่อน --</option>
                      )}
                      {(settings.tournaments || []).map((t) => {
                        const name = typeof t === "string" ? t : t.name;
                        return <option key={name} value={name}>{name}</option>;
                      })}
                    </select>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px" }}>
                      <input value={quickTournamentInput} onChange={(event) => setQuickTournamentInput(event.target.value)} placeholder="พิมพ์ชื่อทัวร์นาเมนต์ใหม่" style={{ height: "34px", border: "1px solid var(--hairline)" }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveQuickTournament(); } }} />
                      <button className="button gold" type="button" onClick={saveQuickTournament}>เพิ่มและเลือก</button>
                    </div>
                  )}
                </div>

                <div style={{ display: "grid", gap: "4px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>Question (คำถาม)</span>
                    <button className="button" type="button" disabled={!question.trim()} onClick={saveQuestionTemplate} style={{ height: "18px", fontSize: "9px", padding: "0 6px", background: "transparent", border: "1px solid var(--yellow)", color: "var(--yellow)", borderRadius: "4px" }}>
                      💾 บันทึกแม่แบบคำถามนี้
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px" }}>
                    <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="คีย์คำถาม หรือเลือกจากแม่แบบขวา" style={{ height: "34px" }} />
                    <select className="button" value="" onChange={(event) => { if (event.target.value) setQuestion(event.target.value); }} style={{ height: "34px", width: "160px" }}>
                      <option value="">-- แม่แบบคำถาม --</option>
                      {(settings.savedQuestions || []).map((q) => (
                        <option key={q} value={q}>{q.slice(0, 20)}...</option>
                      ))}
                    </select>
                  </div>
                  {settings.savedQuestions && settings.savedQuestions.length > 0 && (
                    <details style={{ marginTop: "6px", cursor: "pointer" }}>
                      <summary className="meta" style={{ fontSize: "10px", color: "var(--muted)" }}>✏️ จัดการลบแม่แบบคำถามที่บันทึกไว้</summary>
                      <div style={{ display: "grid", gap: "4px", marginTop: "6px", maxHeight: "120px", overflowY: "auto", padding: "4px", background: "var(--bg)", borderRadius: "6px", border: "1px solid var(--hairline)" }}>
                        {settings.savedQuestions.map((q) => (
                          <div key={q} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", padding: "4px 8px", background: "var(--card)", borderRadius: "4px" }}>
                            <span style={{ fontSize: "11px", color: "var(--text)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{q}</span>
                            <button className="button" type="button" onClick={() => removeQuestionTemplate(q)} style={{ height: "20px", fontSize: "9px", padding: "0 6px", background: "rgba(240, 84, 84, 0.1)", border: "1px solid #ef4444", color: "#ef4444" }}>ลบ</button>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>

                <div className="filter-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", margin: "4px 0" }}>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>Open Time (เวลาเริ่มทาย)</span>
                      <button className="button" type="button" onClick={() => setOpensAt(toDateTimeLocal(new Date()))} style={{ height: "18px", fontSize: "9px", padding: "0 6px", background: "transparent", border: "1px solid var(--yellow)", color: "var(--yellow)", borderRadius: "4px" }}>
                        ⚡ เปิดทายทันที
                      </button>
                    </div>
                    <label className="pill" style={{ display: "grid", gridTemplateColumns: "auto 1fr", height: "34px", padding: "0 10px" }}>เปิด <input type="datetime-local" value={opensAt} onChange={(event) => setOpensAt(event.target.value)} style={{ border: 0, padding: 0, height: "100%", background: "transparent", color: "var(--text)" }} /></label>
                  </div>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)", height: "18px", display: "flex", alignItems: "center" }}>Close Time (เวลาปิดทาย)</span>
                    <label className="pill" style={{ display: "grid", gridTemplateColumns: "auto 1fr", height: "34px", padding: "0 10px" }}>ปิด <input type="datetime-local" value={closesAt} onChange={(event) => setClosesAt(event.target.value)} style={{ border: 0, padding: 0, height: "100%", background: "transparent", color: "var(--text)" }} /></label>
                  </div>
                </div>
                <div className="filter-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", margin: "4px 0" }}>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>Fee Rate (ค่าธรรมเนียม)</span>
                    <input value={feeRate} onChange={(event) => setFeeRate(event.target.value)} placeholder="ค่าธรรมเนียม เช่น 0.03" style={{ height: "34px" }} />
                  </div>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>Status (สถานะแรกเริ่ม)</span>
                    <span className="pill gold" style={{ height: "34px", justifyContent: "center" }}>สร้างแล้วเปิดทันที</span>
                  </div>
                </div>

                <div className="admin-box" style={{ marginTop: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong>ตัวเลือกคำตอบ</strong>
                    <button type="button" onClick={() => setShowBulkOptions(!showBulkOptions)} style={{ fontSize: "10px", color: "var(--yellow)", background: "transparent", border: "0", cursor: "pointer", textDecoration: "underline" }}>
                      {showBulkOptions ? "ใส่ทีละข้อ" : "ใส่ทีละหลายคำตอบ (เว้นบรรทัด)"}
                    </button>
                  </div>

                  {!showBulkOptions ? (
                    <div className="filter-row" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px" }}>
                      <input value={optionInput} onChange={(event) => setOptionInput(event.target.value)} placeholder="เพิ่มคำตอบทีละข้อ" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addOption(); } }} style={{ border: "1px solid var(--hairline)", height: "34px" }} />
                      <button className="button gold" type="button" onClick={addOption}>เพิ่มคำตอบ</button>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: "6px" }}>
                      <textarea rows={3} value={optionsBulkInput} onChange={(event) => setOptionsBulkInput(event.target.value)} placeholder="วางรายชื่อตัวเลือกที่นี่ แยกบรรทัดกัน เช่น&#10;ทีม A&#10;ทีม B&#10;ทีม C" style={{ border: "1px solid var(--hairline)", borderRadius: "8px", background: "var(--bg)", color: "var(--text)", padding: "8px" }} />
                      <button className="button gold" type="button" onClick={addBulkOptions} style={{ width: "100%", height: "34px" }}>ดึงคำตอบทั้งหมดกระจายเป็นตัวเลือกด่วน</button>
                    </div>
                  )}

                  <div className="admin-option-list" style={{ marginTop: "6px" }}>
                    {draftOptions.map((option, index) => (
                      <div key={`${option}-${index}`} className="reward-line">
                        <span>{index + 1}. {option}</span>
                        <button className="button" type="button" onClick={() => removeOption(index)}>ลบ</button>
                      </div>
                    ))}
                  </div>
                </div>

                <button className="button primary" disabled={loading} type="submit" style={{ width: "100%", marginTop: "12px" }}>สร้างคำถามและเปิดรับทาย</button>
              </form>
            </section>
          )}

          {activeTab === "running" && (
            <section className="panel" style={{ width: "100%", maxWidth: "760px", display: "grid", gap: "16px", margin: "0 auto" }}>
              <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3>คำถามที่กำลังรัน</h3>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    {runningPredictions.length > 1 && (
                      <button className="button gold" type="button" disabled={loading} onClick={savePredictionOrder} style={{ height: "24px", fontSize: "10px", padding: "0 10px" }}>
                        💾 บันทึกลำดับคำถาม
                      </button>
                    )}
                    <span className="micro">{runningPredictions.length} รายการ</span>
                  </div>
                </div>
                <div className="admin-help" style={{ padding: "8px 0", margin: "4px 0" }}>
                  <span>ปิดทันที = หยุดรับคำทาย (คำถามจะย้ายไปเก็บที่ตารางด้านล่างเพื่อรอสรุปผล)</span>
                  <span>สรุปผล = เลือกคำตอบที่ชนะและจ่ายผลเหรียญ</span>
                  <span>ยกเลิก + คืนเหรียญ = ยกเลิกคำถามและคืนเหรียญเต็มจำนวน</span>
                </div>
                <div className="leaderboard-body" style={{ gap: "10px", padding: "12px 0 0 0" }}>
                  {currentRunning.length ? currentRunning.map((item) => {
                    const globalIdx = localOrder.indexOf(item.id);
                    return (
                      <div key={item.id} className="question running" style={{ padding: "12px", display: "grid", gridTemplateColumns: "auto 1fr", gap: "12px", alignItems: "center" }}>
                        {/* แฮมเบอร์เกอร์ & เลื่อนลำดับคำถาม */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", paddingRight: "8px", borderRight: "1px solid var(--hairline)", alignSelf: "stretch", justifyContent: "center" }}>
                          <span style={{ fontSize: "14px", color: "var(--muted)", cursor: "grab", lineHeight: "1" }} title="ลากหรือเลื่อนคำถาม">☰</span>
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
                                  }} 
                                  style={{ height: "18px", fontSize: "9px", padding: "0 6px", background: "transparent", border: "1px solid var(--yellow)", color: "var(--yellow)", borderRadius: "4px", cursor: "pointer" }}
                                >
                                  ✏️ แก้ไขเวลาจบ
                                </button>
                              ) : (
                                <button 
                                  className="button" 
                                  type="button" 
                                  onClick={() => setEditingId(null)} 
                                  style={{ height: "18px", fontSize: "9px", padding: "0 6px", background: "transparent", border: "1px solid var(--muted)", color: "var(--muted)", borderRadius: "4px", cursor: "pointer" }}
                                >
                                  ยกเลิก
                                </button>
                              )}
                            </div>

                            {/* กล่องแก้ไขเวลาสไลด์เปิด */}
                            {editingId === item.id && (
                              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", marginTop: "6px", marginBottom: "6px", background: "rgba(255,225,0,0.03)", padding: "6px", borderRadius: "6px", border: "1px solid var(--hairline)" }}>
                                <span className="meta" style={{ fontSize: "10px", color: "var(--yellow)" }}>ตั้งเวลาปิดใหม่ (UTC+7):</span>
                                <input 
                                  type="datetime-local" 
                                  value={editClosesAt[item.id] || ""} 
                                  onChange={(event) => setEditClosesAt((current) => ({ ...current, [item.id]: event.target.value }))} 
                                  style={{ height: "26px", fontSize: "11px", padding: "0 6px", width: "160px", background: "var(--card)" }} 
                                />
                                <button 
                                  className="button gold" 
                                  type="button" 
                                  disabled={loading || !editClosesAt[item.id]} 
                                  onClick={() => saveNewCloseTime(item.id)} 
                                  style={{ height: "26px", fontSize: "10px", padding: "0 8px", fontWeight: "bold" }}
                                >
                                  💾 บันทึกเวลาใหม่
                                </button>
                              </div>
                            )}
                          </div>
                          {renderPredictionControls(item)}
                        </div>
                      </div>
                    );
                  }) : <div className="question"><strong>ไม่มีคำถามที่กำลังรันในขณะนี้</strong><span className="meta">ไปที่แท็บ "สร้างคำถามใหม่" เพื่อเปิดตลาดใหม่</span></div>}
                </div>
                {runningTotalPages > 1 && (
                  <div className="history-footer" style={{ marginTop: "16px" }}>
                    <button className="button" disabled={runningPage <= 1} onClick={() => setRunningPage(runningPage - 1)}>ก่อนหน้า</button>
                    <span className="micro">หน้า {runningPage} / {runningTotalPages}</span>
                    <button className="button" disabled={runningPage >= runningTotalPages} onClick={() => setRunningPage(runningPage + 1)}>ถัดไป</button>
                  </div>
                )}
              </section>

              <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}><h3>คำถามที่หมดเวลา รอคำตอบ</h3><span className="micro">{pendingPredictions.length} รายการ</span></div>
                <div className="leaderboard-body" style={{ gap: "10px", padding: "12px 0 0 0" }}>
                  {currentPending.length ? currentPending.map((item) => (
                    <div key={item.id} className="question closed" style={{ padding: "12px" }}>
                      <div className="question-main">
                        <strong>{item.question}</strong>
                        <span className="meta">{item.tournamentName} · ปิดเมื่อ {displayDate(item.closesAt)} UTC+7 · {item.options.length} คำตอบ</span>
                      </div>
                      {renderPredictionControls(item)}
                    </div>
                  )) : <div className="question"><strong>ไม่มีคำถามที่หมดเวลาและค้างรอคำตอบในขณะนี้</strong></div>}
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
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}><h3>คำถามทั้งหมดในระบบ</h3><span className="micro">{predictions.length} รายการ</span></div>
                <div className="leaderboard-body admin-list" style={{ gap: "10px", padding: "12px 0 0 0" }}>
                  {currentAll.length ? currentAll.map((item) => (
                    <div key={item.id} className="question active" style={{ padding: "12px" }}>
                      <div className="question-main">
                        <strong>{item.question}</strong>
                        <span className="meta">{item.tournamentName} · {statusLabel(item.status)} · ปิด {displayDate(item.closesAt)} UTC+7 · {item.options.length} คำตอบ</span>
                      </div>
                      {renderPredictionControls(item)}
                    </div>
                  )) : <div className="question"><strong>ไม่มีประวัติคำถาม</strong></div>}
                </div>
                {allTotalPages > 1 && (
                  <div className="history-footer" style={{ marginTop: "16px" }}>
                    <button className="button" disabled={allPage <= 1} onClick={() => setAllPage(allPage - 1)}>ก่อนหน้า</button>
                    <span className="micro">หน้า {allPage} / {allTotalPages}</span>
                    <button className="button" disabled={allPage >= allTotalPages} onClick={() => setAllPage(allPage + 1)}>ถัดไป</button>
                  </div>
                )}
              </section>
            </section>
          )}

          {activeTab === "settings" && (
            <section className="panel" style={{ width: "100%", maxWidth: "600px", display: "grid", gap: "16px", margin: "0 auto" }}>
              
              {/* ส่วนที่ 1: กำหนดระยะเวลาและของรางวัลของซีซั่นปัจจุบัน (Current Season & Current Prize) */}
              <div className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}>
                  <h2>📅 1. กำหนดช่วงเวลา & ของรางวัลรอบปัจจุบัน (ซีซั่นนี้)</h2>
                </div>
                <form className="modal-body" onSubmit={saveCurrentSeasonSettings} style={{ padding: "12px 0 0 0", display: "grid", gap: "10px" }}>
                  <span className="meta" style={{ textTransform: "none", color: "var(--muted)", lineHeight: "1.4" }}>
                    *ตั้งค่าปฏิทินช่วงเวลากิจกรรม และชื่อของรางวัลที่ผู้เล่นกำลังแย่งชิงกันขณะนี้ (แสดงนับถอยหลังที่หน้าแรกโดยตรง) สามารถเข้ามาเลื่อน ขยาย หรือเพิ่มลดวันได้อิสระตลอดเวลา
                  </span>
                  
                  <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "1fr 1fr" }}>
                    <div style={{ display: "grid", gap: "4px" }}>
                      <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>วันเริ่มต้นซีซั่นนี้</span>
                      <label className="pill" style={{ display: "grid", gridTemplateColumns: "auto 1fr", height: "34px", padding: "0 10px" }}>
                        เริ่ม <input type="datetime-local" value={settings.season?.startAt || ""} onChange={(event) => setSettings((current) => ({ ...current, season: { startAt: event.target.value, endAt: current.season?.endAt || "", status: current.season?.status || "active" } }))} style={{ border: 0, padding: 0, height: "100%", background: "transparent", color: "var(--text)" }} />
                      </label>
                    </div>
                    <div style={{ display: "grid", gap: "4px" }}>
                      <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>วันหมดเขตซีซั่นนี้</span>
                      <label className="pill" style={{ display: "grid", gridTemplateColumns: "auto 1fr", height: "34px", padding: "0 10px" }}>
                        จบ <input type="datetime-local" value={settings.season?.endAt || ""} onChange={(event) => setSettings((current) => ({ ...current, season: { startAt: current.season?.startAt || "", endAt: event.target.value, status: current.season?.status || "active" } }))} style={{ border: 0, padding: 0, height: "100%", background: "transparent", color: "var(--text)" }} />
                      </label>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>ฤดูกาลปัจจุบันนี้ (ระบบจะขยับซีซั่นใหม่ +1 อัตโนมัติเมื่อกดรีเซ็ตแต้มในส่วนที่ 3)</span>
                    <div style={{ height: "34px", display: "flex", alignItems: "center", padding: "0 10px", background: "var(--bg)", borderRadius: "6px", border: "1px solid var(--hairline)", fontWeight: "bold", color: "var(--yellow)" }}>
                      {settings.reward.month || "Season 1"}
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>ของรางวัลสำหรับผู้ชนะฤดูกาลนี้</span>
                    <input value={settings.reward.name} onChange={(event) => setSettings((current) => ({ ...current, reward: { ...current.reward, name: event.target.value } }))} placeholder='เช่น iPad Air 11" M2 หรือ ของรางวัลสุดเศษ' style={{ height: "34px" }} />
                  </div>

                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>สถานะซีซั่นนี้</span>
                    <select className="button" value={settings.season?.status || "active"} onChange={(event) => setSettings((current) => ({ ...current, season: { startAt: current.season?.startAt || "", endAt: current.season?.endAt || "", status: event.target.value as any } }))} style={{ width: "100%", height: "34px" }}>
                      <option value="active">Active (กำลังเปิดรับการแข่งขัน)</option>
                      <option value="ended">Ended (สิ้นสุดกิจกรรม/ปิดทายผลชั่วคราว)</option>
                    </select>
                  </div>

                  <button className="button primary" disabled={loading} type="submit" style={{ marginTop: "4px", width: "100%", height: "34px", fontWeight: "bold" }}>💾 บันทึกเวลา & รางวัลฤดูกาลนี้</button>
                </form>
              </div>

              {/* ส่วนที่ 2: ประกาศรางวัล & ให้สิทธิ์เคลมของผู้ชนะซีซั่นที่แล้ว (Previous Season Winner Claim) */}
              <div className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}>
                  <h2>🏆 2. ประกาศผล & เปิดระบบเคลมรางวัล (รอบซีซั่นที่จบไป)</h2>
                </div>
                <form className="modal-body" onSubmit={savePreviousWinnerSettings} style={{ padding: "12px 0 0 0", display: "grid", gap: "10px" }}>
                  <span className="meta" style={{ textTransform: "none", color: "var(--muted)", lineHeight: "1.4" }}>
                    *เมื่อจบรอบซีซั่นเก่าไปแล้ว แอดมินระบุชื่อซีซั่นและคนได้ที่ 1 เพื่อเปิดปุ่มกรอกที่อยู่จัดส่งของรางวัล (Claim Reward) บนหน้าแรกของเขาได้แยกเป็นเอกเทศจากรอบปัจจุบัน
                  </span>

                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>ฤดูกาลประจำรอบที่จบไป (บังคับเลือกจากตารางประวัติ)</span>
                    <select className="button" value={settings.reward.month} onChange={(event) => setSettings((current) => ({ ...current, reward: { ...current.reward, month: event.target.value } }))} style={{ width: "100%", height: "34px" }}>
                      <option value="">-- เลือกซีซั่นจากตารางประวัติ --</option>
                      {historySeasons.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>รายชื่อผู้โชคดี (ผู้ได้อันดับ 1 ของรอบที่พึ่งจบ)</span>
                    <select className="button" value={settings.reward.winnerBy} onChange={(event) => setSettings((current) => ({ ...current, reward: { ...current.reward, winnerBy: event.target.value } }))} style={{ width: "100%", height: "34px" }}>
                      <option value="">-- คลิกเลือกผู้ชนะจากตารางคะแนนสูงสุด --</option>
                      {topUsers.map((user) => (
                        <option key={user.id} value={user.displayName}>{user.displayName} ({user.email})</option>
                      ))}
                    </select>
                  </div>

                  {/* สิทธิ์การเคลม */}
                  <div className="admin-box" style={{ background: "rgba(255, 225, 0, 0.05)", border: "1px solid var(--hairline)", padding: "10px", borderRadius: "8px", display: "grid", gap: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong>ให้สิทธิ์ผู้ชนะคนนี้กดเคลมรางวัลหน้าเว็บแรก</strong>
                      <span className="pill" style={{ 
                        fontSize: "11px", 
                        height: "22px", 
                        background: settings.reward.approved ? "rgba(14, 203, 129, 0.12)" : "rgba(255, 225, 0, 0.12)", 
                        color: settings.reward.approved ? "var(--green)" : "var(--yellow)", 
                        border: 0 
                      }}>
                        {settings.reward.approved ? "เปิดสิทธิ์เคลมแล้ว" : "ปิดสิทธิ์เคลมอยู่"}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button className="button gold" type="button" disabled={loading} onClick={() => setSettings((current) => ({ ...current, reward: { ...current.reward, approved: !current.reward.approved } }))} style={{ height: "28px", fontSize: "10px" }}>
                        {settings.reward.approved ? "🔒 ปิดสิทธิ์เคลมหน้าแรก" : "🔓 เปิดสิทธิ์เคลมหน้าแรก"}
                      </button>
                    </div>
                  </div>

                  <button className="button primary" disabled={loading} type="submit" style={{ width: "100%", height: "34px", fontWeight: "bold" }}>💾 บันทึกผู้ชนะ & เปิดให้เคลมรางวัล</button>
                </form>
              </div>

              {/* ส่วนที่ 3: สรุปคะแนนล้างกระดานอันดับ (Reset Standings for New Month) */}
              <div className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}>
                  <h2>🏁 3. ปุ่มเคลียร์คะแนนกระดานเพื่อเริ่มซีซั่นใหม่ (Reset Standings)</h2>
                </div>
                <div className="modal-body" style={{ padding: "12px 0 0 0", display: "grid", gap: "10px" }}>
                  <span className="meta" style={{ textTransform: "none", color: "var(--muted)", lineHeight: "1.4" }}>
                    *กดเพื่อปิดบันทึกตารางอันดับ Top 20 ของฤดูกาล "{settings.reward.month}" นี้ลงฐานข้อมูลถาวร และรีเซ็ตแต้มสะสมกำไร (Season Profit) ของทุกคนกลับเหลือ 0 แต้มเพื่อเริ่มสะสมแต้มเก็บรอบใหม่ (ปุ่มแยกอิสระ กดเมื่อสิ้นสุดการแข่ง)
                  </span>
                  <button className="button gold" type="button" disabled={loading} onClick={finalizeLeaderboard} style={{ width: "100%", height: "38px", fontWeight: "bold" }}>
                    🏁 สรุปปิดประวัติคะแนน "{settings.reward.month}" & เคลียร์กระดานเป็น 0
                  </button>
                </div>
              </div>

              <div className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}><h2>ข้อความ Info หน้าเว็บ (วิธีเล่น/รางวัล)</h2></div>
                <form className="modal-body" onSubmit={saveInfoSettings} style={{ padding: "12px 0 0 0" }}>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>How to Play (วิธีเล่น)</span>
                    <textarea rows={3} value={settings.info.howToPlay} onChange={(event) => setSettings((current) => ({ ...current, info: { ...current.info, howToPlay: event.target.value } }))} placeholder="How to Play" />
                  </div>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>Reward (การแจกรางวัล)</span>
                    <textarea rows={3} value={settings.info.reward} onChange={(event) => setSettings((current) => ({ ...current, info: { ...current.info, reward: event.target.value } }))} placeholder="Reward" />
                  </div>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>Question Time (เวลากับการทาย)</span>
                    <textarea rows={3} value={settings.info.questionTime} onChange={(event) => setSettings((current) => ({ ...current, info: { ...current.info, questionTime: event.target.value } }))} placeholder="Question Time" />
                  </div>
                  <button className="button primary" disabled={loading} type="submit" style={{ marginTop: "12px", width: "100%" }}>บันทึกข้อความ Info ทั่วไป</button>
                </form>
              </div>
            </section>
          )}

          {activeTab === "tournaments" && (
            <section className="panel" style={{ width: "100%", maxWidth: "600px", display: "grid", gap: "16px", margin: "0 auto" }}>
              <div className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}><h2>จัดการทัวร์นาเมนต์ (Tournament List)</h2></div>
                <div className="modal-body" style={{ padding: "12px 0 0 0" }}>
                  <div style={{ display: "grid", gap: "10px", marginBottom: "12px" }}>
                    <div style={{ display: "grid", gap: "4px" }}>
                      <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>ชื่อทัวร์นาเมนต์ (Tournament Name)</span>
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
                    
                    <button className="button gold" disabled={loading || !newTournamentInput.trim()} type="button" onClick={addTournament} style={{ height: "34px", marginTop: "4px" }}>เพิ่มทัวร์นาเมนต์ใหม่</button>
                  </div>
                  
                  <div className="admin-option-list">
                    {!(settings.tournaments && settings.tournaments.length > 0) ? (
                      <div className="reward-line"><span>ไม่มีรายชื่อทัวร์นาเมนต์ในขณะนี้</span></div>
                    ) : (
                      (settings.tournaments || []).map((t, idx) => {
                        const tName = typeof t === "string" ? t : t.name;
                        const tLogo = typeof t === "string" ? "" : t.logoUrl;
                        return (
                          <div key={`${tName}-${idx}`} className="reward-line" style={{ padding: "8px 0", borderBottom: "1px solid var(--hairline-soft)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
                              <button className="button" type="button" disabled={loading} onClick={() => removeTournament(tName)} style={{ height: "24px", fontSize: "10px", padding: "0 8px" }}>ลบ</button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === "claims" && (
            <section className="panel" style={{ width: "100%", maxWidth: "760px", display: "grid", gap: "16px", margin: "0 auto" }}>
              <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}><h3>รายการจัดส่งของรางวัลประจำเดือน</h3><span className="micro">{claims.length} รายการ</span></div>
                <div className="leaderboard-body" style={{ gap: "12px", padding: "12px 0 0 0" }}>
                  {currentClaims.length ? currentClaims.map((item) => (
                    <div key={item.id} className="question active" style={{ padding: "14px", display: "grid", gap: "8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "14px", fontWeight: "bold", color: "var(--yellow)" }}>{item.month} · {item.rewardName}</span>
                        <b style={{ 
                          fontSize: "11px", 
                          color: item.status === "completed" ? "var(--green)" : "var(--yellow)", 
                          background: item.status === "completed" ? "rgba(14, 203, 129, 0.12)" : "var(--yellow-soft)", 
                          padding: "3px 8px", 
                          borderRadius: "999px" 
                        }}>
                          {item.status === "completed" ? "จัดส่งสำเร็จ" : "รอดำเนินการจัดส่ง"}
                        </b>
                      </div>
                      
                      <div className="info-block" style={{ background: "var(--bg)", gap: "4px" }}>
                        <span style={{ fontSize: "11px", color: "var(--text)" }}>แอคเคาท์ผู้ชนะ: <strong>{item.winnerName} ({item.winnerEmail})</strong></span>
                        <span style={{ fontSize: "11px", color: "var(--text)" }}>ชื่อจริงผู้รับพัสดุ: <strong style={{ color: "#fff" }}>{item.receiverName}</strong></span>
                        <span style={{ fontSize: "11px", color: "var(--text)" }}>เบอร์โทรศัพท์ติดต่อ: <strong style={{ color: "#fff" }}>{item.phone}</strong></span>
                        <span style={{ fontSize: "11px", color: "var(--text)", lineHeight: "1.4" }}>ที่อยู่จัดส่ง: <strong style={{ color: "#fff" }}>{item.address}</strong></span>
                        {item.note && <span style={{ fontSize: "11px", color: "var(--text)" }}>หมายเหตุเพิ่มเติม: <i>{item.note}</i></span>}
                      </div>

                      {item.status !== "completed" && (
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
                          <button 
                            className="button gold" 
                            disabled={loading} 
                            onClick={() => updateClaimStatus(item.id, "completed", "")}
                            style={{ height: "34px", width: "100%", fontWeight: "bold" }}
                          >
                            ✔️ แจ้งว่าจัดส่งสำเร็จ
                          </button>
                        </div>
                      )}
                    </div>
                  )) : <div className="question"><strong>ยังไม่มีผู้ชนะกรอกรายละเอียดจัดส่งรางวัลเข้ามาในขณะนี้</strong></div>}
                </div>
                {claimsTotalPages > 1 && (
                  <div className="history-footer" style={{ marginTop: "16px" }}>
                    <button className="button" disabled={claimsPage <= 1} onClick={() => setClaimsPage(claimsPage - 1)}>ก่อนหน้า</button>
                    <span className="micro">หน้า {claimsPage} / {claimsTotalPages}</span>
                    <button className="button" disabled={claimsPage >= claimsTotalPages} onClick={() => setClaimsPage(claimsPage + 1)}>ถัดไป</button>
                  </div>
                )}
              </section>
            </section>
          )}

          {activeTab === "admins" && (
            <section className="panel" style={{ width: "100%", maxWidth: "600px", display: "grid", gap: "16px", margin: "0 auto" }}>
              <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}><h3>รายชื่อแอดมินระบบ</h3><span className="micro">{admins.length} คน</span></div>
                <form className="modal-body" onSubmit={makeAdmin} style={{ padding: "12px 0 0 0" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px", marginBottom: "12px" }}>
                    <input value={adminEmailInput} onChange={(event) => setAdminEmailInput(event.target.value)} placeholder="ใส่อีเมลผู้ใช้ที่นี่" style={{ height: "34px", border: "1px solid var(--hairline)" }} />
                    <button className="button gold" disabled={loading} type="submit">เพิ่มแอดมินใหม่</button>
                  </div>
                  <div className="admin-option-list">
                    {admins.map((admin) => (
                      <div key={admin.id} className="reward-line" style={{ padding: "8px 0", borderBottom: "1px solid var(--hairline-soft)" }}>
                        <span>{admin.displayName || admin.email} ({admin.email})</span>
                        {admin.email.toLowerCase() === adminEmail.toLowerCase() ? (
                          <b className="accent-gold">คุณ (แอดมินหลัก)</b>
                        ) : (
                          <button className="button" type="button" disabled={loading} onClick={() => removeAdmin(admin.email)}>ถอดสิทธิ์แอดมิน</button>
                        )}
                      </div>
                    ))}
                  </div>
                  <span className="meta" style={{ display: "block", marginTop: "12px", lineHeight: "1.4" }}>หมายเหตุ: แอดมินใหม่ต้องเคยลงชื่อสมัครใช้บริการ (Sign Up / Sign In) ในหน้าหลักมาก่อนอย่างน้อย 1 ครั้ง เพื่อให้ข้อมูลสร้างขึ้นในฐานข้อมูล Supabase ถึงจะกดเพิ่มรายชื่อจากตรงนี้ได้สำเร็จ</span>
                </form>
              </section>
            </section>
          )}

          {activeTab === "reports" && (
            <section className="panel" style={{ width: "100%", maxWidth: "800px", display: "grid", gap: "16px", margin: "0 auto" }}>
              <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3>รายการแจ้งปัญหาและข้อเสนอแนะ</h3>
                  <button className="button gold" onClick={loadReports} disabled={reportsLoading} style={{ height: "26px", fontSize: "11px", padding: "0 10px" }}>
                    🔄 รีเฟรชข้อมูล
                  </button>
                </div>
                
                <div className="admin-option-list" style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
                  {reportsLoading ? (
                    <div style={{ textAlign: "center", padding: "20px", color: "var(--text-weak)" }}>กำลังโหลดข้อมูลรายงานการแจ้งปัญหา...</div>
                  ) : reports.length > 0 ? (
                    reports.map((report) => (
                      <div key={report.id} style={{ border: "1px solid var(--hairline)", borderRadius: "8px", padding: "12px", background: "var(--bg)", display: "flex", flexDirection: "column", gap: "8px", width: "100%", textAlign: "left" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "11px", color: "var(--text-weak)" }}>
                            จาก: <b>{report.email}</b>
                          </span>
                          <span style={{ 
                            fontSize: "10px", 
                            padding: "2px 6px", 
                            borderRadius: "4px", 
                            fontWeight: "bold",
                            background: report.status === "resolved" ? "rgba(76, 175, 80, 0.2)" : "rgba(244, 67, 54, 0.2)",
                            color: report.status === "resolved" ? "#4caf50" : "#f44336"
                          }}>
                            {report.status === "resolved" ? "✓ แก้ไขแล้ว" : "⏳ รอดำเนินการ"}
                          </span>
                        </div>
                        
                        <p style={{ fontSize: "12px", color: "var(--text-strong)", whiteSpace: "pre-wrap", lineHeight: "1.4", margin: 0 }}>
                          {report.message}
                        </p>
                        
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", borderTop: "1px solid var(--hairline-soft)", paddingTop: "8px", marginTop: "4px" }}>
                          <span style={{ color: "var(--text-weak)" }}>
                            วันที่ส่ง: {new Date(report.created_at).toLocaleString("th-TH")}
                          </span>
                          
                          <div style={{ display: "flex", gap: "6px" }}>
                            {report.status !== "resolved" && (
                              <button 
                                className="button gold" 
                                onClick={() => handleUpdateReport(report.id, "resolved")}
                                style={{ height: "24px", fontSize: "10px", padding: "0 8px" }}
                              >
                                ✔️ ทำเครื่องหมายว่าแก้ไขแล้ว
                              </button>
                            )}
                            <button 
                              className="button" 
                              onClick={() => { if(confirm("ต้องการลบรายงานนี้ใช่หรือไม่?")) handleUpdateReport(report.id, report.status, true); }}
                              style={{ height: "24px", fontSize: "10px", padding: "0 8px", background: "rgba(244, 67, 54, 0.1)", border: "1px solid rgba(244, 67, 54, 0.3)", color: "#f44336" }}
                            >
                              🗑️ ลบ
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ textAlign: "center", padding: "30px", color: "var(--text-weak)", border: "1px dashed var(--hairline)", borderRadius: "8px" }}>
                      <strong>ไม่มีรายงานการแจ้งปัญหาหรือข้อเสนอแนะเข้ามาในขณะนี้</strong>
                    </div>
                  )}
                </div>
              </section>
            </section>
          )}

        </section>
      </div>
    </main>
  );
}
