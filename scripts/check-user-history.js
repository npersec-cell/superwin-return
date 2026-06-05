#!/usr/bin/env node
/**
 * check-user-history.js
 * --------------------
 * Reusable script to investigate user history reports
 * (e.g. "I chose X but history shows Y")
 *
 * Usage:
 *   node scripts/check-user-history.js <email>
 *   node scripts/check-user-history.js chaiyapornbutro@gmail.com
 *
 * Output: All bets, all ledger entries, and any label mismatches.
 */

require("dotenv").config({ path: ".env.local" });

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error("Usage: node scripts/check-user-history.js <user-email>");
    process.exit(1);
  }

  console.log(`\n=== Checking user: ${email} ===\n`);

  // ── 1. Find user ──────────────────────────────────────────────
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, email, display_name, clerk_user_id, coin_balance")
    .eq("email", email)
    .single();

  if (userError || !user) {
    console.error(` User not found: ${email}`);
    process.exit(1);
  }

  console.log(`ID:          ${user.id}`);
  console.log(`Display name: ${user.display_name}`);
  console.log(`Clerk ID:    ${user.clerk_user_id}`);
  console.log(`Coin balance: ${user.coin_balance}\n`);

  // ── 2. All coin_ledger entries ───────────────────────────────
  // NOTE: coin_ledger has NO prediction_id / option_id columns.
  //       The chosen option is stored as text inside the "detail" field.
  const { data: ledger, error: ledgerError } = await supabase
    .from("coin_ledger")
    .select("id, type, amount, balance_after, detail, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (ledgerError) {
    console.error(" Ledger query error:", ledgerError.message);
  }

  console.log(`=== Coin Ledger (${ledger?.length || 0} entries) ===\n`);

  for (const row of ledger || []) {
    const typeStr = `[${row.type.toUpperCase()}]`;
    const date = new Date(row.created_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
    const sign = row.amount >= 0 ? "+" : "";
    console.log(`${typeStr} ${date}  ${sign}${row.amount}  (balance: ${row.balance_after ?? "?"})`);
    console.log(`  ${row.detail || "(no detail)"}`);
    console.log("");
  }

  // ── 3. All prediction_bets ───────────────────────────────────
  const { data: bets } = await supabase
    .from("prediction_bets")
    .select(`
      id, prediction_id, option_id, amount, created_at,
      predictions(title, option_a_label, option_b_label, option_c_label, option_d_label, status, winner_option_id)
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  console.log(`\n=== Prediction Bets (${bets?.length || 0} entries) ===\n`);

  for (const bet of bets || []) {
    const p = bet.predictions;
    const label =
      bet.option_id === "a" ? p?.option_a_label :
      bet.option_id === "b" ? p?.option_b_label :
      bet.option_id === "c" ? p?.option_c_label :
      bet.option_id === "d" ? p?.option_d_label : "?";

    const date = new Date(bet.created_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
    console.log(`${date}`);
    console.log(`  Question: ${p?.title || "(deleted)"}`);
    console.log(`  Chose:    option_${bet.option_id} = "${label}"`);
    console.log(`  Bet:      ${bet.amount} coins`);
    console.log(`  Status:   ${p?.status || "?" }`);
    if (p?.status === "resolved") {
      console.log(`  Winner:   option_${p.winner_option_id}`);
    }
    console.log("");
  }

  // ── 4. Cross-check: ledger "Pick:" vs actual bet ────────────
  console.log(`\n=== Cross-Check: Ledger "Pick:" vs DB bet ===\n`);

  for (const entry of ledger || []) {
    if (entry.type !== "predict" || !entry.detail) continue;

    const pickMatch = entry.detail.match(/Pick:\s*(.+?)\s*·/);
    if (!pickMatch) continue;

    const ledgerPick = pickMatch[1].trim();
    console.log(`Ledger says: "Pick: ${ledgerPick}"`);
    console.log(`  detail: ${entry.detail?.substring(0, 100)}`);
    console.log("");
  }

  // ── 5. Search for suspicious keywords ────────────────────────
  console.log(`\n=== Keyword Search in this user's history ===\n`);
  const keywords = ["4T", "4thrives", "Flash", "eArena", "EA"];
  for (const kw of keywords) {
    const found = (ledger || []).filter(l =>
      l.detail?.toLowerCase().includes(kw.toLowerCase())
    );
    if (found.length > 0) {
      console.log(`"${kw}": found in ${found.length} entries`);
    }
  }

  console.log(`\n=== CHECK COMPLETE ===\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
