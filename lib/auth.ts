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
  lastClaimAt: string | null;
  nextClaimAt: string | null;
  addressCompleted: boolean;
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
  last_claim_at: string | null;
  next_claim_at: string | null;
  address_completed: boolean;
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
    lastClaimAt: row.last_claim_at,
    nextClaimAt: row.next_claim_at,
    addressCompleted: row.address_completed ?? false,
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

/**
 * SECURITY: Dev bypass ONLY works in NODE_ENV=development
 * In production, this function is NEVER called
 */
async function tryDevBypass(request?: Request): Promise<AppUser | null> {
  // Only allow in development mode
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const bypassSecret = process.env.DEV_BYPASS_SECRET;
  if (!bypassSecret || !request) {
    return null;
  }

  const devUserId = process.env.DEV_USER_ID;
  if (!devUserId) {
    return null;
  }

  let bypassMatched = false;

  // Method 1: Check x-dev-bypass header
  const headerValue = request.headers.get("x-dev-bypass");
  if (headerValue === bypassSecret) {
    bypassMatched = true;
  }

  // Method 2: Check dev_bypass cookie (simple check - improve with HMAC in future)
  if (!bypassMatched) {
    const cookieHeader = request.headers.get("cookie");
    if (cookieHeader && cookieHeader.includes("dev_bypass=1")) {
      bypassMatched = true;
    }
  }

  // Method 3: Check URL parameter
  if (!bypassMatched) {
    try {
      const url = new URL(request.url);
      const urlBypass = url.searchParams.get("dev_bypass");
      if (urlBypass === bypassSecret) {
        bypassMatched = true;
      }
    } catch {
      // ignore URL parse errors
    }
  }

  if (!bypassMatched) {
    return null;
  }

  // Dev bypass matched - load user from DB
  console.warn(`[DEV] Bypassing Clerk auth, using user ID: ${devUserId}`);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, clerk_user_id, email, display_name, role, coin_balance, lifetime_profit, profit_score, last_claim_at, next_claim_at, address_completed, status, avatar_url")
    .eq("id", devUserId)
    .maybeSingle<UserRow>();

  if (data && !error) {
    return mapUser(data);
  }

  console.error("[DEV] Dev bypass user not found:", devUserId);
  return null;
}

/**
 * Normal Clerk authentication flow
 * This is used in production AND when dev bypass fails in development
 */
async function clerkAuth(request?: Request): Promise<AppUser | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const clerkUser = await currentUser();
  const email = getPrimaryEmail(clerkUser);
  if (!email) {
    throw new Error("Signed-in Clerk user has no email address");
  }

  const avatarUrl = clerkUser?.imageUrl || null;
  const supabase = createSupabaseAdminClient();

  const { data: existing, error: selectError } = await supabase
    .from("users")
    .select("id, clerk_user_id, email, display_name, role, coin_balance, lifetime_profit, profit_score, last_claim_at, next_claim_at, address_completed, status, avatar_url")
    .eq("clerk_user_id", userId)
    .maybeSingle<UserRow>();

  if (selectError) {
    throw new Error(selectError.message || "Failed to load user");
  }

  if (existing) {
    // Update user info if changed
    // NOTE: We intentionally do NOT sync display_name from Clerk anymore
    // so users can manually set their public display name via profile page.
    const shouldUpdate =
      existing.email !== email ||
      existing.avatar_url !== avatarUrl;

    let userRow = existing;

    if (shouldUpdate) {
      const { data: updated, error: updateError } = await supabase
        .from("users")
        .update({
          email,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString()
        })
        .eq("id", existing.id)
        .select("id, clerk_user_id, email, display_name, role, coin_balance, lifetime_profit, profit_score, last_claim_at, next_claim_at, address_completed, status, avatar_url")
        .single<UserRow>();

      if (updateError) {
        throw new Error(updateError.message || "Failed to update user");
      }
      userRow = updated;
    }

    const user = mapUser(userRow);
    
    return user;
  }

  // Create new user
  // NOTE: display_name is intentionally left null so users can set their
  // public name manually via profile page. Default display uses censored email.
  const { data: created, error: insertError } = await supabase
    .from("users")
    .insert({
      clerk_user_id: userId,
      email,
      display_name: null,
      role: "user",
      coin_balance: 0,
      lifetime_profit: 0,
      address_completed: false,
      status: "active",
      avatar_url: avatarUrl
    })
    .select("id, clerk_user_id, email, display_name, role, coin_balance, lifetime_profit, last_claim_at, next_claim_at, address_completed, status, avatar_url")
    .single<UserRow>();

  if (insertError) {
    throw new Error(insertError.message || "Failed to create user");
  }

  return mapUser(created);
}

export async function getCurrentUser(request?: Request): Promise<AppUser | null> {
  // In development mode, try dev bypass first
  if (process.env.NODE_ENV === 'development') {
    const bypassResult = await tryDevBypass(request);
    if (bypassResult) {
      return bypassResult;
    }
  }

  // Always use Clerk auth (production) or (development + bypass failed)
  return await clerkAuth(request);
}

export async function requireUser(request?: Request): Promise<AppUser> {
  const user = await getCurrentUser(request);
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function requireAdmin(request?: Request): Promise<AppUser> {
  const user = await requireUser(request);
  if (user.role !== "admin") {
    throw new Error("Forbidden");
  }
  return user;
}
