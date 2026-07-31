// Fetch leaderboard data and display Top 15 Most Active
const url = process.argv[2] || "http://localhost:3000/api/leaderboard/v2";

async function fetchLeaderboard() {
  try {
    console.log(`Fetching from: ${url}`);
    const res = await fetch(url, { credentials: "include" });
    const json = await res.json();

    if (!json.ok || !json.data) {
      console.error("API response:", JSON.stringify(json, null, 2));
      return;
    }

    const data = json.data;

    // Sort by activeScore descending
    const sorted = [...data].sort((a, b) => (b.activeScore || 0) - (a.activeScore || 0));
    const top15 = sorted.slice(0, 15);

    console.log("\n=== TOP 15 MOST ACTIVE ===\n");
    console.log(
      ["#", "Email", "activeScore", "avgClaimPerDay", "claimCount", "predictionCount"].join("\t")
    );
    console.log("─".repeat(100));

    top15.forEach((user, idx) => {
      console.log(
        [
          String(idx + 1).padStart(2),
          user.email || user.displayName || "???",
          String(user.activeScore || 0).padStart(8),
          user.avgClaimPerDay?.toFixed?.(2) || 0,
          user.claimCount || 0,
          user.predictionCount || 0,
        ].join("\t")
      );
    });

    console.log("\n=== ALL 4 CATEGORIES SCORES FOR TOP 15 ===\n");
    top15.forEach((user, idx) => {
      console.log(`#${idx + 1}: ${user.email || user.displayName}`);
      console.log(
        `   Orange Ammo: ${user.orangeScore || 0}\tPredictions: ${user.predScore || 0}\tHighest Win: ${user.winScore || 0}\tActive: ${user.activeScore || 0}\tOverall: ${user.overall || 0}`
      );
    });

    // Also show total user count
    console.log(`\nTotal users in leaderboard: ${data.length}`);
  } catch (err) {
    console.error("Error:", err.message);
    console.error("\nMake sure the dev server is running (npm run dev)");
    console.error("Usage: node scripts/fetch-leaderboard.js [url]");
  }
}

fetchLeaderboard();
