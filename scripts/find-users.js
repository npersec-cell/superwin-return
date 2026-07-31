// Find users by partial name match
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://ogegsffjbngpfqvrzkdb.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nZWdzZmZqYm5ncGZxdnJ6a2RiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTc4Njc2MywiZXhwIjoyMDk1MzYyNzYzfQ.lbE3zntPOdwMM-EXgq8UcKXVsxiMMP4sE72pFgnL12w";

const SEARCH_TERMS = [
  "getcha", "natthawon", "panpan", "aommei", "jirawat", 
  "mosmaat", "อาเธอร", "error", "suteemon", "killzle", "chetabf",
  "ZFam", "PC", "จ๊วก"
];

async function findUsers() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  console.log("🔍 Searching for users by partial name match...\n");

  for (const term of SEARCH_TERMS) {
    const { data, error } = await supabase
      .from("users")
      .select("id, display_name, email, coin_balance")
      .ilike("display_name", `%${term}%`)
      .limit(5);

    if (error) {
      console.log(`❌ "${term}": ${error.message}`);
      continue;
    }

    if (data && data.length > 0) {
      console.log(`✅ "${term}" → ${data.length} match(es):`);
      data.forEach((u) => {
        console.log(`   - [${u.id.slice(0,8)}] "${u.display_name}" | coins: ${u.coin_balance} | ${u.email}`);
      });
    } else {
      console.log(`⚠️ "${term}" → no matches`);
    }
  }
}

findUsers().catch(console.error);
