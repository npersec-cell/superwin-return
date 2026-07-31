// Fetch live leaderboard data and show Top 15 Most Active with exact display_names
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://ogegsffjbngpfqvrzkdb.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nZWdzZmZqYm5ncGZxdnJ6a2RiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTc4Njc2MywiZXhwIjoyMDk1MzYyNzYzfQ.lbE3zntPOdwMM-EXgq8UcKXVsxiMMP4sE72pFgnL12w";

async function getLeaderboard() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Get all users with claim_count
  const { data: users, error } = await supabase
    .from("users")
    .select("id, display_name, email, coin_balance, claim_count, created_at")
    .neq("role", "admin")
    .not("email", "like", "%test%")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  // Calculate avgClaimPerDay for each user
  const now = Date.now();
  const withAvg = users.map(u => {
    const daysSinceCreated = Math.max(1, Math.floor(
      (now - new Date(u.created_at).getTime()) / (1000 * 60 * 60 * 24)
    ));
    const avgClaimPerDay = (u.claim_count || 0) / daysSinceCreated;
    return { ...u, daysSinceCreated, avgClaimPerDay };
  });

  // Sort by avgClaimPerDay descending
  withAvg.sort((a, b) => b.avgClaimPerDay - a.avgClaimPerDay);

  const top15 = withAvg.slice(0, 15);

  console.log("=== TOP 15 MOST ACTIVE (LIVE FROM DB) ===\n");
  console.log(
    ["#", "display_name (EXACT)", "email", "avgClaimPerDay", "claimCount", "days"].join("\t")
  );
  console.log("─".repeat(110));

  top15.forEach((u, idx) => {
    console.log(
      [
        String(idx + 1).padStart(2),
        `"${u.display_name}"`,
        u.email,
        u.avgClaimPerDay.toFixed(4),
        u.claim_count || 0,
        u.daysSinceCreated,
      ].join("\t")
    );
  });

  // Output as JSON array for easy copy-paste
  console.log("\n\n=== COPY THIS FOR COMPENSATION SCRIPT ===");
  console.log("const TOP_15 = [");
  top15.forEach(u => {
    console.log(`  "${u.display_name}",`);
  });
  console.log("];");
}

getLeaderboard().catch(console.error);
