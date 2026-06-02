import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

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

console.log("🚀 Starting database and file cleanup...");

try {
  // 1. ล้างตารางที่เชื่อมโยงทั้งหมดในฐานข้อมูล Supabase
  console.log("🧹 Clearing Supabase tables...");

  // ปลดล็อก foreign key winning_option_id ใน predictions ก่อน
  await supabase.from("predictions").update({ winning_option_id: null }).neq("id", "00000000-0000-0000-0000-000000000000");

  const { error: err1 } = await supabase.from("prediction_entries").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (err1) console.warn("Prediction entries delete warn:", err1.message);

  const { error: err3 } = await supabase.from("predictions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (err3) console.warn("Predictions delete warn:", err3.message);

  const { error: err2 } = await supabase.from("prediction_options").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (err2) console.warn("Prediction options delete warn:", err2.message);

  const { error: err4 } = await supabase.from("coin_ledger").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (err4) console.warn("Coin ledger delete warn:", err4.message);

  // monthly_leaderboards table removed - skip (line removed)

  const { error: err6 } = await supabase.from("rewards").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (err6) console.warn("Rewards delete warn:", err6.message);

  const { error: err7 } = await supabase.from("admin_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (err7) console.warn("Admin logs delete warn:", err7.message);

  // 2. รีเซ็ตแต้มและเหรียญของผู้ใช้ทุกคน ยกเว้น Admin
  console.log("🔄 Resetting normal users' balance & profit...");
  const { error: errUser } = await supabase
    .from("users")
    .update({
      coin_balance: 500,
      lifetime_profit: 0,
      last_claim_at: null,
      next_claim_at: null
    })
    .neq("role", "admin"); // ยกเว้นแอดมินตามคำขอ!

  if (errUser) {
    console.error("Failed to reset users:", errUser.message);
  } else {
    console.log("✅ Successfully reset all normal users to 500 coins and 0 profit.");
  }

  // 3. เคลียร์ไฟล์ JSON จัดส่งของรางวัล (Winner Claims)
  console.log("📁 Resetting local winner claims JSON...");
  const claimsPath = path.join(root, "data", "winner-claims.json");
  fs.writeFileSync(claimsPath, JSON.stringify([], null, 2), "utf8");
  console.log("✅ Reset winner-claims.json to empty array.");

  // 4. รีเซ็ตสถานะการประกาศผลรางวัลใน site-settings.json
  console.log("📝 Resetting active settings values...");
  const settingsPath = path.join(root, "data", "site-settings.json");
  if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const updatedSettings = {
      ...settings,
      reward: {
        name: "Shop",
        winnerBy: "All time Profit",
        month: "",
        approved: false
      },
      // season block removed - system now uses all-time only
    };
    fs.writeFileSync(settingsPath, JSON.stringify(updatedSettings, null, 2), "utf8");
    console.log("✅ Reset site-settings.json values (cleared May winner, locked claim, reset dates).");
  }

  console.log("🎉 Cleanup complete! Everything is fresh and ready for testing.");
  process.exit(0);
} catch (error) {
  console.error("Cleanup failed:", error);
  process.exit(1);
}
