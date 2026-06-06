const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log("=== SUPERWIN DB DIAGNOSTIC ===\n");

  // 1. Check predictions
  const { data: predictions, error: pErr } = await supabase
    .from("predictions")
    .select("id, tournament_name, question, status, opens_at, closes_at")
    .order("created_at", { ascending: false });

  if (pErr) {
    console.error("Error fetching predictions:", pErr.message);
    return;
  }

  console.log(`Total predictions: ${predictions?.length || 0}\n`);

  for (const pred of predictions || []) {
    console.log(`--- Prediction: ${pred.question} (${pred.id}) ---`);
    console.log(`  Status: ${pred.status}`);
    console.log(`  Opens: ${pred.opens_at || "immediate"}`);
    console.log(`  Closes: ${pred.closes_at}`);

    // 2. Check options for this prediction
    const { data: options, error: oErr } = await supabase
      .from("prediction_options")
      .select("id, label, sort_order")
      .eq("prediction_id", pred.id)
      .order("sort_order", { ascending: true });

    if (oErr) {
      console.error("  Error fetching options:", oErr.message);
      continue;
    }
    console.log(`  Options: ${options?.length || 0}`);
    for (const opt of options || []) {
      console.log(`    - ${opt.label} (${opt.id})`);
    }

    // 3. Check entries for this prediction
    const { data: entries, error: eErr } = await supabase
      .from("prediction_entries")
      .select("id, user_id, option_id, amount, status, created_at")
      .eq("prediction_id", pred.id);

    if (eErr) {
      console.error("  Error fetching entries:", eErr.message);
      continue;
    }
    console.log(`  Entries: ${entries?.length || 0}`);
    for (const entry of entries || []) {
      console.log(`    - Entry ${entry.id}: user=${entry.user_id}, option=${entry.option_id}, amount=${entry.amount}, status=${entry.status}`);
    }

    // 4. Check pool totals
    const totalPool = (entries || []).reduce((sum, e) => sum + (e.amount || 0), 0);
    const uniquePlayers = new Set((entries || []).map((e) => e.user_id)).size;
    console.log(`  Total Pool: ${totalPool} coins`);
    console.log(`  Unique Players: ${uniquePlayers}`);
    console.log("");
  }

  // 5. Check indexes on prediction_entries
  console.log("=== CHECKING INDEXES ===");
  const { data: indexes, error: iErr } = await supabase.rpc("exec_sql", {
    sql: `
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'prediction_entries' 
      ORDER BY indexname;
    `
  }).catch(() => ({ data: null, error: { message: "exec_sql not available" } }));

  if (iErr) {
    console.log("Could not check indexes (exec_sql not available):", iErr.message);
  } else {
    console.log("Indexes on prediction_entries:");
    for (const idx of indexes || []) {
      console.log(`  - ${idx.indexname}: ${idx.indexdef}`);
    }
  }
}

main().catch(console.error);
