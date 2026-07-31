// Direct Supabase compensation — no auth needed, uses service role key
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://ogegsffjbngpfqvrzkdb.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nZWdzZmZqYm5ncGZxdnJ6a2RiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTc4Njc2MywiZXhwIjoyMDk1MzYyNzYzfQ.lbE3zntPOdwMM-EXgq8UcKXVsxiMMP4sE72pFgnL12w";

const TOP_15 = [
  "getcha19xx",
  "natthawon.yxx",
  "Panpan🍒",
  "☃️",
  "จ๊วกมูย",
  "aommei19xx",
  "ZFam",
  "PC",
  "jirawat89xx",
  "mosmaat5xx",
  "อาเธอร๋",
  "error.kiekxx",
  "suteemonxx",
  "killzlexx",
  "chetabfxx",
];

const AMOUNT = 10000;
const REASON = "Compensation for auto-cleanup data loss — Top 15 Most Active";

async function compensate() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  console.log(`🎯 Compensating ${TOP_15.length} users with ${AMOUNT.toLocaleString()} coins each`);
  console.log(`📡 Target: Supabase (direct)`);
  console.log(`\nRecipients:`);
  TOP_15.forEach((name, i) => console.log(`  ${String(i + 1).padStart(2)}. ${name}`));
  console.log("");

  // 1. Find all matching users by display_name
  console.log("🔍 Searching for users...");
  const { data: users, error: findError } = await supabase
    .from("users")
    .select("id, display_name, email, coin_balance")
    .in("display_name", TOP_15);

  if (findError) {
    console.error("❌ Find error:", findError.message);
    return;
  }

  if (!users || users.length === 0) {
    console.error("❌ No matching users found!");
    console.error("\nPossible causes:");
    console.error("  - display_name doesn't match exactly (check spelling/emojis)");
    console.error("  - Users table structure changed");
    return;
  }

  const notFound = TOP_15.filter(
    (name) => !users.some((u) => u.display_name === name)
  );

  console.log(`✅ Found ${users.length}/${TOP_15.length} users`);
  if (notFound.length > 0) {
    console.log(`⚠️ Not found (${notFound.length}):`);
    notFound.forEach((name) => console.log(`   - ${name}`));
  }

  // 2. Update each user
  console.log(`\n💰 Adding ${AMOUNT.toLocaleString()} coins to each user...\n`);
  
  const results = [];
  let totalAdded = 0;
  let successCount = 0;

  for (const user of users) {
    const prevBalance = Number(user.coin_balance) || 0;
    const newBalance = prevBalance + AMOUNT;

    // Update coin_balance
    const { error: updateError } = await supabase
      .from("users")
      .update({ coin_balance: newBalance })
      .eq("id", user.id);

    if (updateError) {
      console.log(`  ❌ ${user.display_name}: ${updateError.message}`);
      results.push({ ...user, success: false, error: updateError.message });
      continue;
    }

    // Record in coin_ledger
    const { error: ledgerError } = await supabase.from("coin_ledger").insert({
      user_id: user.id,
      type: "credit",
      amount: AMOUNT,
      balance_after: newBalance,
      ref_type: "admin_compensation",
      detail: REASON,
    });

    if (ledgerError) {
      console.warn(`  ⚠ Ledger error for ${user.display_name}: ${ledgerError.message}`);
    }

    successCount++;
    totalAdded += AMOUNT;
    console.log(
      `  ✅ ${user.display_name}: ${prevBalance.toLocaleString()} → ${newBalance.toLocaleString()} (+${AMOUNT.toLocaleString()})`
    );
    results.push({ ...user, prevBalance, newBalance, success: true });
  }

  // Summary
  console.log("\n" + "═".repeat(60));
  console.log(`📊 SUMMARY`);
  console.log("═".repeat(60));
  console.log(`   Total requested: ${TOP_15.length}`);
  console.log(`   Found: ${users.length}`);
  console.log(`   Successfully compensated: ${successCount}`);
  console.log(`   Not found: ${notFound.length}`);
  console.log(`   Total coins added: ${totalAdded.toLocaleString()}`);
  
  if (notFound.length > 0) {
    console.log(`\n⚠️ Could not find these users (check spelling):`);
    notFound.forEach((name) => console.log(`   - ${name}`));
  }
}

compensate().catch(console.error);
