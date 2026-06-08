import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

// Daily Report Data Type
type DailyReport = {
  timestamp: string;
  date: string;
  
  // User Stats
  totalUsers: number;
  activeUsersToday: number;
  newUsersToday: number;
  
  // Prediction Stats
  totalPredictions: number;
  openPredictions: number;
  resolvedPredictions: number;
  newPredictionsToday: number;
  
  // Transaction Stats
  totalTransactions: number;
  transactionsToday: number;
  totalCoinsDistributed: number;
  coinsDistributedToday: number;
  
  // System Health
  healthStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  healthSummary: string;
  
  // Warnings
  warnings: string[];
  
  // Recent Activity
  recentActivity: {
    action: string;
    admin: string;
    timestamp: string;
  }[];
};

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const supabase = createSupabaseAdminClient();

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const todayStart = `${today}T00:00:00Z`;
    const todayEnd = `${today}T23:59:59Z`;

    // ========== User Stats ==========
    const [userCountRes, activeTodayRes, newUserRes] = await Promise.all([
      supabase.from("users").select("id").neq("role", "admin"),
      supabase.from("users").select("id").neq("role", "admin").gte("created_at", todayStart),
      supabase.from("users").select("id").neq("role", "admin").gte("created_at", todayStart),
    ]);

    const totalUsers = (userCountRes.data || []).length;
    const newUsersToday = (newUserRes.data || []).length;
    
    // Active users = users who have any activity today (ledger entries)
    const { data: activeUsersData } = await supabase
      .from("coin_ledger")
      .select("user_id")
      .gte("created_at", todayStart);
    const activeUsersToday = new Set((activeUsersData || []).map((r: { user_id: string }) => r.user_id)).size;

    // ========== Prediction Stats ==========
    const [predCountRes, openPredRes, resolvedPredRes, newPredRes] = await Promise.all([
      supabase.from("predictions").select("id"),
      supabase.from("predictions").select("id").eq("status", "open"),
      supabase.from("predictions").select("id").eq("status", "resolved"),
      supabase.from("predictions").select("id").gte("created_at", todayStart),
    ]);

    const totalPredictions = (predCountRes.data || []).length;
    const openPredictions = (openPredRes.data || []).length;
    const resolvedPredictions = (resolvedPredRes.data || []).length;
    const newPredictionsToday = (newPredRes.data || []).length;

    // ========== Transaction Stats ==========
    const [ledgerCountRes, todayLedgerRes] = await Promise.all([
      supabase.from("coin_ledger").select("id, amount"),
      supabase.from("coin_ledger").select("id, amount").gte("created_at", todayStart),
    ]);

    const totalTransactions = (ledgerCountRes.data || []).length;
    const transactionsToday = (todayLedgerRes.data || []).length;
    
    // Calculate total coins distributed (credit entries only)
    const totalCoinsDistributed = (ledgerCountRes.data || [])
      .filter((l: { type?: string }) => l.type === 'credit')
      .reduce((sum: number, l: { amount?: number }) => sum + (l.amount || 0), 0);
    
    const coinsDistributedToday = (todayLedgerRes.data || [])
      .filter((l: { type?: string }) => l.type === 'credit')
      .reduce((sum: number, l: { amount?: number }) => sum + (l.amount || 0), 0);

    // ========== Recent Activity (Last 10 audit logs) ==========
    const { data: recentAuditLogs } = await supabase
      .from("audit_logs")
      .select("action, admin_id, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    const adminNames = new Map<string, string>();
    if (recentAuditLogs && recentAuditLogs.length > 0) {
      const adminIds = [...new Set(recentAuditLogs.map((l: { admin_id: string }) => l.admin_id))];
      const { data: admins } = await supabase
        .from("users")
        .select("id, display_name")
        .in("id", adminIds);
      
      for (const admin of admins || []) {
        adminNames.set(admin.id, admin.display_name || admin.id.substring(0, 8));
      }
    }

    const recentActivity = (recentAuditLogs || []).map((log: { action: string; admin_id: string; created_at: string }) => ({
      action: log.action,
      admin: adminNames.get(log.admin_id) || log.admin_id.substring(0, 8),
      timestamp: new Date(log.created_at).toLocaleString('th-TH', { 
        hour: '2-digit', 
        minute: '2-digit',
        day: '2-digit',
        month: 'short',
      }),
    }));

    // ========== Warnings (from health check logic) ==========
    const warnings: string[] = [];

    // Check for users with negative balance
    const { data: negativeBalanceUsers } = await supabase
      .from("users")
      .select("id, display_name, coin_balance")
      .lt("coin_balance", 0);
    
    if (negativeBalanceUsers && negativeBalanceUsers.length > 0) {
      warnings.push(`${negativeBalanceUsers.length} user(s) have negative balance`);
    }

    // Check for stuck predictions
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: stuckPredictions } = await supabase
      .from("predictions")
      .select("id, question")
      .eq("status", "open")
      .lt("created_at", twentyFourHoursAgo);
    
    if (stuckPredictions && stuckPredictions.length > 0) {
      warnings.push(`${stuckPredictions.length} prediction(s) stuck in 'open' status for >24h`);
    }

    // Determine health status
    let healthStatus: DailyReport['healthStatus'] = 'HEALTHY';
    let healthSummary = 'System running normally';
    
    if (warnings.length > 0) {
      healthStatus = warnings.length > 2 ? 'CRITICAL' : 'WARNING';
      healthSummary = `${warnings.length} warning(s) need attention`;
    }

    const report: DailyReport = {
      timestamp: new Date().toISOString(),
      date: today,
      
      totalUsers,
      activeUsersToday,
      newUsersToday,
      
      totalPredictions,
      openPredictions,
      resolvedPredictions,
      newPredictionsToday,
      
      totalTransactions,
      transactionsToday,
      totalCoinsDistributed,
      coinsDistributedToday,
      
      healthStatus,
      healthSummary,
      
      warnings,
      
      recentActivity,
    };

    return NextResponse.json({ ok: true, data: report });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Daily report failed";
    const status = message === "Unauthorized" || message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
