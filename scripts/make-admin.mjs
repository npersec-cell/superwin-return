import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/make-admin.mjs <email>");
  process.exit(1);
}

const root = process.cwd();
const envPath = path.join(root, ".env.local");
const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const { data, error } = await supabase
  .from("users")
  .update({ role: "admin", updated_at: new Date().toISOString() })
  .eq("email", email)
  .select("id, email, role")
  .single();

if (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(`Updated ${data.email} to ${data.role}`);
