import { createSupabaseAdminClient } from "./lib/db.js";

async function main() {
  const supabase = createSupabaseAdminClient();
  const { data, count, error } = await supabase.from("users").select("*", { count: "exact" });
  if (error) {
    console.error("error:", error);
  } else {
    console.log("total users:", count);
    console.log("users:", data);
  }
}

main();
