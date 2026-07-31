// Final compensation — uses LIVE data from Supabase
// Compensates Top 15 Most Active users with 10,000 coins each
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://ogegsffjbngpfqvrzkdb.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nZWdzZmZqYm5ncGZxdnJ6a2RiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTc4Njc2MywiZXhwIjoyMDk1MzYyNzYzfQ.lbE3zntPOdwMM-EXgq8UcKXVsxiMMP4sE72pFgnL12w";

const AMOUNT = 10000;
const REASON = "Compensation for auto-cleanup data loss — Top 15 Most Active";

async function compensate() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 1. Get all users (exclude admin/test)
  const { data: allUsers, error } = await supabase
    .from("users")
    .select("id, display_name, email, coin_balance, claim_count, created_at")
    .neq("role", "admin")
    .not("email", "like", "%test%");

  if (error) {
    console.error("❌ Error fetching users:", error.message);
    return;
  }

  // 2. Calculate avgClaimPerDay and sort
  const now = Date.now();
  const withAvg = allUsers.map(u => {
    const daysSinceCreated = Math.max(1, Math.floor(
      (now - new Date(u.created_at).getTime()) / (1000 * 60 * 60 * 24)
    ));
    return {
      ...u,
      daysSinceCreated,
      avgClaimPerDay: (u.claim_count || 0) / daysSinceCreated,
    };
  });

  withAvg.sort((a, b) => b.avgClaimPerDay - a.avgClaimPerDay);
  const top15 = withAvg.slice(0, 15);

  console.log(`🎯 Compensating Top 15 Most Active users with ${AMOUNT.toLocaleString()} coins each\n`);
  console.log("=== TOP 15 MOST ACTIVE (LIVE) ===");
  top15.forEach((u, i) => {
    const name = u.display_name && u.display_name !== "null" ? u.display_name : u.email;
    console.log(`  ${String(i+1).padStart(2)}. ${name.padEnd(35)} | avg=${u.avgClaimPerDay.toFixed(3)} | claims=${u.claim_count}`);
  });
  console.log("");

  // 3. Compensate each user
  let successCount = 0;
  let totalAdded = 0;

  for (const u of top15) {
    const prevBalance = Number(u.coin_balance) || 0;
    const newBalance = prevBalance + AMOUNT;

    // Update coin_balance
    const { error: updateError } = await supabase
      .from("users")
      .update({ coin_balance: newBalance })
      .eq("id", u.id);

    if (updateError) {
      console.log(`  ❌ ${u.email}: ${updateError.message}`);
      continue;
    }

    // Record in coin_ledger (use valid type: "claim")
    const { error: ledgerError } = await supabase.from("coin_ledger").insert({
      user_id: u.id,
      type: "claim",
      amount: AMOUNT,
      balance_after: newBalance,
      ref_type: "admin_compensation",
      detail: REASON,
    });

    if (ledgerError) {
      console.warn(`  ⚠ Ledger: ${ledgerError.message}`);
    }

    successCount++;
    totalAdded += AMOUNT;
    const name = u.display_name && u.display_name !== "null" ? u.display_name : u.email;
    console.log(
      `  ✅ ${name.padEnd(35)} | ${prevBalance.toLocaleString().padStart(8)} → ${newBalance.toLocaleString().padStart(8)} (+${AMOUNT.toLocaleString()})`
    );
  }

  // Summary
  console.log("\n" + "═".repeat(70));
  console.log(`📊 SUMMARY`);
  console.log("═".repeat(70));
  console.log(`   Users compensated: ${successCount}/15`);
  console.log(`   Total coins added: ${totalAdded.toLocaleString()}`);
  console.log(`   Each user received: ${AMOUNT.toLocaleString()} coins`);
}

compensate().catch(console.error);
