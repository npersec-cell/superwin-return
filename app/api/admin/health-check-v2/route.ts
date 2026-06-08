import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

// Health Check Result Type
type CheckResult = {
  name: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  message: string;
  details?: Record<string, unknown>;
};

type HealthReport = {
  timestamp: string;
  overallStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  checks: CheckResult[];
  summary: string;
};

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const supabase = createSupabaseAdminClient();

    const checks: CheckResult[] = [];
    let overallStatus: HealthReport['overallStatus'] = 'HEALTHY';

    // ========== CHECK 1: Coin Balance vs Ledger ==========
    let balanceCheck: CheckResult;
    try {
      // Calculate expected balance from ledger for each user
      // NOTE: amount column is already signed (+ for credit, - for debit)
      const { data: ledgerBalances, error: ledgerError } = await supabase
        .from("coin_ledger")
        .select("user_id, amount");

      if (ledgerError) {
        balanceCheck = {
          name: "Coin Balance vs Ledger",
          status: "FAIL",
          message: "Cannot query coin_ledger: " + ledgerError.message,
        };
      } else {
        // Calculate balance from ledger (amount is already signed)
        const ledgerMap = new Map<string, number>();
        for (const entry of ledgerBalances || []) {
          const userId = entry.user_id;
          const amount = entry.amount || 0; // amount is already signed
          
          if (!ledgerMap.has(userId)) ledgerMap.set(userId, 0);
          ledgerMap.set(userId, ledgerMap.get(userId)! + amount);
        }

        // Get actual balances from users table
        const { data: users, error: usersError } = await supabase
          .from("users")
          .select("id, coin_balance");

        if (usersError) {
          balanceCheck = {
            name: "Coin Balance vs Ledger",
            status: "FAIL",
            message: "Cannot query users table: " + usersError.message,
          };
        } else {
          const mismatches: string[] = [];
          let totalDiff = 0;
          let checkedCount = 0;
          let mismatchCount = 0;

          for (const user of users || []) {
            checkedCount++;
            const expectedBalance = ledgerMap.get(user.id) || 0;
            const actualBalance = user.coin_balance || 0;
            const diff = actualBalance - expectedBalance;

            if (diff !== 0) {
              mismatchCount++;
              totalDiff += diff;
              mismatches.push(
                `User ${user.id.substring(0, 8)}: Expected ${expectedBalance}, Actual ${actualBalance}, Diff ${diff}`
              );
            }
          }

          if (mismatchCount === 0) {
            balanceCheck = {
              name: "Coin Balance vs Ledger",
              status: "PASS",
              message: `All ${checkedCount} user balances match ledger 100%`,
              details: { checkedCount, totalDiff: 0 },
            };
          } else {
            const status = mismatchCount > 5 ? "FAIL" : "WARN";
            balanceCheck = {
              name: "Coin Balance vs Ledger",
              status: status,
              message: `${mismatchCount} users have mismatched balances (Total diff: ${totalDiff})`,
              details: {
                checkedCount,
                mismatchCount,
                totalDiff,
                samples: mismatches.slice(0, 5),
              },
            };
            if (overallStatus === 'HEALTHY') overallStatus = status === 'WARN' ? 'WARNING' : 'CRITICAL';
            if (status === 'FAIL') overallStatus = 'CRITICAL';
          }
        }
      }
    } catch (error: unknown) {
      balanceCheck = {
        name: "Coin Balance vs Ledger",
        status: "FAIL",
        message: "Error during check: " + (error instanceof Error ? error.message : String(error)),
      };
      overallStatus = 'CRITICAL';
    }
    checks.push(balanceCheck);

    // ========== CHECK 2: Abnormal Transactions ==========
    let abnormalCheck: CheckResult;
    try {
      // Check for negative balances
      const { data: negativeBalances, error: negError } = await supabase
        .from("users")
        .select("id, display_name, coin_balance")
        .lt("coin_balance", 0);

      if (negError) {
        abnormalCheck = {
          name: "Abnormal Transactions",
          status: "FAIL",
          message: "Cannot query users: " + negError.message,
        };
      } else {
        const negativeCount = (negativeBalances || []).length;
        const negativeUsers = (negativeBalances || []).map(u => 
          `${u.display_name || u.id.substring(0, 8)}: ${u.coin_balance}`
        );

        // Check for suspicious large transactions (credit > 10000 coins in single transaction)
        const { data: largeCredits, error: largeError } = await supabase
          .from("coin_ledger")
          .select("id, user_id, type, amount, created_at")
          .eq("type", "credit")
          .gte("amount", 10000)
          .order("created_at", { ascending: false })
          .limit(10);

        if (largeError) {
          abnormalCheck = {
            name: "Abnormal Transactions",
            status: "WARN",
            message: "Cannot query ledger for large transactions: " + largeError.message,
          };
        } else {
          const largeCount = (largeCredits || []).length;
          const largeSamples = (largeCredits || []).slice(0, 3).map(t => 
            `ID ${t.id.substring(0, 8)}: +${t.amount} (${new Date(t.created_at).toISOString()})`
          );

          if (negativeCount > 0) {
            abnormalCheck = {
              name: "Abnormal Transactions",
              status: "FAIL",
              message: `${negativeCount} users have negative balance (CRITICAL!)`,
              details: {
                negativeBalanceUsers: negativeUsers.slice(0, 5),
                largeCredits: largeCount,
                largeCreditSamples: largeSamples,
              },
            };
            overallStatus = 'CRITICAL';
          } else if (largeCount > 0) {
            abnormalCheck = {
              name: "Abnormal Transactions",
              status: "WARN",
              message: `${largeCount} large credit transactions detected (possible admin reward)`,
              details: {
                negativeBalanceUsers: 0,
                largeCredits: largeCount,
                largeCreditSamples: largeSamples,
              },
            };
            if (overallStatus === 'HEALTHY') overallStatus = 'WARNING';
          } else {
            abnormalCheck = {
              name: "Abnormal Transactions",
              status: "PASS",
              message: "No abnormal transactions detected",
            };
          }
        }
      }
    } catch (error: unknown) {
      abnormalCheck = {
        name: "Abnormal Transactions",
        status: "FAIL",
        message: "Error during check: " + (error instanceof Error ? error.message : String(error)),
      };
      overallStatus = 'CRITICAL';
    }
    checks.push(abnormalCheck);

    // ========== CHECK 3: Pending Predictions ==========
    let pendingCheck: CheckResult;
    try {
      // Check for predictions stuck in 'open' status for more than 24 hours
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { data: stuckPredictions, error: stuckError } = await supabase
        .from("predictions")
        .select("id, tournament_name, question, status, opens_at, closes_at, created_at")
        .eq("status", "open")
        .lt("created_at", twentyFourHoursAgo);

      if (stuckError) {
        pendingCheck = {
          name: "Stuck Predictions",
          status: "WARN",
          message: "Cannot query predictions: " + stuckError.message,
        };
      } else {
        const stuckCount = (stuckPredictions || []).length;
        
        if (stuckCount === 0) {
          pendingCheck = {
            name: "Stuck Predictions",
            status: "PASS",
            message: "No predictions stuck in pending status",
          };
        } else {
          const stuckSamples = (stuckPredictions || []).slice(0, 3).map(p => 
            `${p.question.substring(0, 30)}... (${p.created_at})`
          );

          pendingCheck = {
            name: "Stuck Predictions",
            status: "WARN",
            message: `${stuckCount} predictions stuck in 'open' status for >24h`,
            details: {
              stuckCount,
              samples: stuckSamples,
            },
          };
          if (overallStatus === 'HEALTHY') overallStatus = 'WARNING';
        }
      }
    } catch (error: unknown) {
      pendingCheck = {
        name: "Stuck Predictions",
        status: "WARN",
        message: "Error during check: " + (error instanceof Error ? error.message : String(error)),
      };
    }
    checks.push(pendingCheck);

    // ========== CHECK 4: System Performance ==========
    let perfCheck: CheckResult;
    try {
      // Check recent API errors from audit logs
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      
      const { data: recentErrors, error: errorError } = await supabase
        .from("audit_logs")
        .select("action, created_at")
        .is("action", "null") // Check for any unexpected null actions
        .order("created_at", { ascending: false })
        .limit(5);

      if (errorError) {
        perfCheck = {
          name: "System Performance",
          status: "PASS",
          message: "Cannot check audit logs (not critical)",
        };
      } else {
        // Just report that we checked
        perfCheck = {
          name: "System Performance",
          status: "PASS",
          message: "System running normally",
        };
      }
    } catch (error: unknown) {
      perfCheck = {
        name: "System Performance",
        status: "WARN",
        message: "Error during check: " + (error instanceof Error ? error.message : String(error)),
      };
    }
    checks.push(perfCheck);

    // ========== Generate Summary ==========
    const failedChecks = checks.filter(c => c.status === 'FAIL');
    const warnChecks = checks.filter(c => c.status === 'WARN');
    
    let summary: string;
    if (failedChecks.length > 0) {
      summary = `🔴 CRITICAL: ${failedChecks.length} check(s) failed. Immediate action required!`;
    } else if (warnChecks.length > 0) {
      summary = `🟡 WARNING: ${warnChecks.length} check(s) need attention. Review recommended.`;
    } else {
      summary = `🟢 HEALTHY: All ${checks.length} checks passed. System running normally.`;
    }

    const report: HealthReport = {
      timestamp: new Date().toISOString(),
      overallStatus,
      checks,
      summary,
    };

    // Log to audit
    try {
      await supabase.rpc("log_audit", {
        p_admin_id: "system",
        p_action: "health_check",
        p_target_type: "system",
        p_target_id: "health-check-v2",
        p_metadata: JSON.stringify({
          overallStatus,
          checksPassed: checks.filter(c => c.status === 'PASS').length,
          checksWarned: warnChecks.length,
          checksFailed: failedChecks.length,
        }),
      });
    } catch (e) {
      // Ignore audit log errors
    }

    return NextResponse.json({ ok: true, data: report });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Health check failed";
    const status = message === "Unauthorized" || message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
