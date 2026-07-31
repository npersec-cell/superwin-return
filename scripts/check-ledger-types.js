// Check valid coin_ledger types from existing records
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://ogegsffjbngpfqvrzkdb.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nZWdzZmZqYm5ncGZxdnJ6a2RiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTc4Njc2MywiZXhwIjoyMDk1MzYyNzYzfQ.lbE3zntPOdwMM-EXgq8UcKXVsxiMMP4sE72pFgnL12w";

async function checkTypes() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Get distinct types from existing ledger entries
  const { data, error } = await supabase
    .from("coin_ledger")
    .select("type")
    .limit(100);

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  const types = [...new Set(data.map(r => r.type))];
  console.log("Valid coin_ledger types:", types);
}

checkTypes().catch(console.error);
