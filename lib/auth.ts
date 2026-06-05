import { auth, currentUser } from "@clerk/nextjs/server";
import { createSupabaseAdminClient } from "@/lib/db";

export type AppUser = {
  id: string;
  clerkUserId: string;
  email: string;
  displayName: string | null;
  role: "user" | "admin";
  coinBalance: number;
  lifetimeProfit: number;
  profitScore: number;
  lastClaimAt: string | null;
  nextClaimAt: string | null;
  status: "active" | "suspended" | "banned";
  avatarUrl: string | null;
};

type UserRow = {
  id: string;
  clerk_user_id: string;
  email: string;
  display_name: string | null;
  role: "user" | "admin";
  coin_balance: number;
  lifetime_profit: number;
  profit_score: number;
  last_claim_at: string | null;
  next_claim_at: string | null;
  status: "active" | "suspended" | "banned";
  avatar_url: string | null;
};

function mapUser(row: UserRow): AppUser {
  return {
    id: row.id,
    clerkUserId: row.clerk_user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    coinBalance: row.coin_balance,
    lifetimeProfit: row.lifetime_profit,
    profitScore: row.profit_score ?? 0,
    lastClaimAt: row.last_claim_at,
    nextClaimAt: row.next_claim_at,
    status: row.status,
    avatarUrl: row.avatar_url || null
  };
}

function getPrimaryEmail(clerkUser: Awaited<ReturnType<typeof currentUser>>) {
  const email = clerkUser?.emailAddresses.find((item) => item.id === clerkUser.primaryEmailAddressId)
    || clerkUser?.emailAddresses[0];
  return email?.emailAddress || null;
}

function getDisplayName(clerkUser: Awaited<ReturnType<typeof currentUser>>) {
  if (!clerkUser) return null;
  const fullName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim();
  return fullName || clerkUser.username || null;
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const clerkUser = await currentUser();
  const email = getPrimaryEmail(clerkUser);
  if (!email) {
    throw new Error("Signed-in Clerk user has no email address");
  }

  const displayName = getDisplayName(clerkUser);
  const avatarUrl = clerkUser?.imageUrl || null;
  const supabase = createSupabaseAdminClient();

  const { data: existing, error: selectError } = await supabase
    .from("users")
    .select("id, clerk_user_id, email, display_name, role, coin_balance, lifetime_profit, profit_score, last_claim_at, next_claim_at, status, avatar_url")
    .eq("clerk_user_id", userId)
    .maybeSingle<UserRow>();

  if (selectError) {
    throw new Error(selectError.message || "Failed to load user");
  }

  if (existing) {
    const shouldUpdate = 
      existing.email !== email || 
      existing.display_name !== displayName || 
      existing.avatar_url !== avatarUrl;
      
    if (shouldUpdate) {
      const { data: updated, error: updateError } = await supabase
        .from("users")
        .update({ 
          email, 
          display_name: displayName, 
          avatar_url: avatarUrl, 
          updated_at: new Date().toISOString() 
        })
        .eq("id", existing.id)
        .select("id, clerk_user_id, email, display_name, role, coin_balance, lifetime_profit, profit_score, last_claim_at, next_claim_at, status, avatar_url")
        .single<UserRow>();

      if (updateError) {
        throw new Error(updateError.message || "Failed to update user");
      }
      return mapUser(updated);
    }

    return mapUser(existing);
  }

  const { data: created, error: insertError } = await supabase
    .from("users")
    .insert({
      clerk_user_id: userId,
      email,
      display_name: displayName,
      role: "user",
      coin_balance: 0,
      lifetime_profit: 0,
      profit_score: 0,
      status: "active",
      avatar_url: avatarUrl
    })
    .select("id, clerk_user_id, email, display_name, role, coin_balance, lifetime_profit, profit_score, last_claim_at, next_claim_at, status, avatar_url")
    .single<UserRow>();

  if (insertError) {
    throw new Error(insertError.message || "Failed to create user");
  }

  return mapUser(created);
}

export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function requireAdmin(): Promise<AppUser> {
  const user = await requireUser();
  if (user.role !== "admin") {
    throw new Error("Forbidden");
  }
  return user;
}
