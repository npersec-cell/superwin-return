// Compensate Top 15 Most Active users with 10,000 coins each
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_COOKIE = process.env.ADMIN_COOKIE || "";

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
  console.log(`🎯 Compensating ${TOP_15.length} users with ${AMOUNT.toLocaleString()} coins each`);
  console.log(`📡 Target: ${BASE_URL}/api/admin/users/add-coins`);
  console.log(`\nRecipients:`);
  TOP_15.forEach((name, i) => console.log(`  ${String(i + 1).padStart(2)}. ${name}`));
  console.log("");

  try {
    const res = await fetch(`${BASE_URL}/api/admin/users/add-coins`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(ADMIN_COOKIE ? { Cookie: ADMIN_COOKIE } : {}),
      },
      credentials: "include",
      body: JSON.stringify({
        recipients: TOP_15,
        amount: AMOUNT,
        reason: REASON,
      }),
    });

    const json = await res.json();

    if (!res.ok || !json.ok) {
      console.error("❌ API Error:", json.error || json);
      console.error("\nPossible causes:");
      console.error("  1. Dev server not running → run `npm run dev`");
      console.error("  2. Not logged in as admin → log in first");
      console.error("  3. ADMIN_COOKIE env var needed");
      return;
    }

    const { data } = json;
    console.log("✅ Success!");
    console.log(`   Requested: ${data.requested}`);
    console.log(`   Found: ${data.found}`);
    console.log(`   Not found: ${data.not_found?.length || 0}`);
    console.log(`   Total added: ${data.total_added.toLocaleString()} coins`);

    if (data.not_found?.length > 0) {
      console.log(`\n⚠️ Not found (${data.not_found.length}):`);
      data.not_found.forEach((name) => console.log(`   - ${name}`));
    }

    console.log("\n📋 Results:");
    console.log(
      ["#", "Name", "Prev", "Added", "New"].join("\t")
    );
    console.log("─".repeat(70));
    data.results.forEach((r, i) => {
      if (r.success) {
        console.log(
          [
            String(i + 1).padStart(2),
            r.display_name,
            r.previous_balance.toLocaleString(),
            `+${r.added.toLocaleString()}`,
            r.new_balance.toLocaleString(),
          ].join("\t")
        );
      } else {
        console.log(`  ${String(i + 1).padStart(2)}. ❌ ${r.display_name}: ${r.error}`);
      }
    });
  } catch (err) {
    console.error("❌ Error:", err.message);
    console.error("\nMake sure dev server is running: `npm run dev`");
  }
}

compensate();
