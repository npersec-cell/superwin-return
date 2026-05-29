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

const demoPredictions = [
  {
    tournamentName: "Super League",
    question: "Which team will win the championship?",
    closeOffsetMinutes: 4300,
    options: ["Alpha Esports", "Bravo Gaming", "Charlie Squad", "Delta Force", "Echo Team", "Falcon", "Ghost", "Hydra", "Inferno", "Joker"]
  },
  {
    tournamentName: "Global Open",
    question: "Which region will finish first?",
    closeOffsetMinutes: 1480,
    options: ["SEA", "South Asia", "Europe", "Americas", "Middle East", "Wildcard"]
  },
  {
    tournamentName: "Scrim Night",
    question: "Most kills team in final map?",
    closeOffsetMinutes: 360,
    options: ["Rex", "Nova", "Viper", "Ghost", "Blaze", "Frost", "Omega", "Ruin"]
  },
  {
    tournamentName: "Weekly Final",
    question: "Which team gets the first chicken dinner?",
    closeOffsetMinutes: 90,
    options: ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Falcon"]
  }
];

for (const item of demoPredictions) {
  const { data: existing, error: findError } = await supabase
    .from("predictions")
    .select("id")
    .eq("question", item.question)
    .maybeSingle();

  if (findError) throw findError;

  let predictionId = existing?.id;

  const now = new Date();
  const closesAt = new Date(now.getTime() + item.closeOffsetMinutes * 60000);

  if (!predictionId) {
    const { data: created, error: createError } = await supabase
      .from("predictions")
      .insert({
        tournament_name: item.tournamentName,
        question: item.question,
        status: "open",
        opens_at: now.toISOString(),
        closes_at: closesAt.toISOString(),
        fee_rate: 0.03
      })
      .select("id")
      .single();

    if (createError) throw createError;
    predictionId = created.id;
  } else {
    const { error: updateError } = await supabase
      .from("predictions")
      .update({
        tournament_name: item.tournamentName,
        status: "open",
        opens_at: now.toISOString(),
        closes_at: closesAt.toISOString(),
        fee_rate: 0.03,
        updated_at: now.toISOString()
      })
      .eq("id", predictionId);

    if (updateError) throw updateError;
  }

  for (const [index, label] of item.options.entries()) {
    const { data: existingOption, error: optionFindError } = await supabase
      .from("prediction_options")
      .select("id")
      .eq("prediction_id", predictionId)
      .eq("label", label)
      .maybeSingle();

    if (optionFindError) throw optionFindError;
    if (existingOption) continue;

    const { error: optionError } = await supabase
      .from("prediction_options")
      .insert({ prediction_id: predictionId, label, sort_order: index });

    if (optionError) throw optionError;
  }
}

console.log("Seeded demo predictions");
