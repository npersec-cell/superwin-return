import { NextRequest, NextResponse } from "next/server";

/**
 * DEV BYPASS ROUTE
 * 
 * Usage:
 *   1. Visit: https://superwinhub.app/api/dev-bypass?secret=YOUR_SECRET
 *   2. If secret matches, sets dev_bypass=1 cookie
 *   3. Subsequent requests with this cookie will bypass Clerk auth
 * 
 * To get the secret, check process.env.DEV_BYPASS_SECRET
 */

export async function GET(request: NextRequest) {
  const secret = process.env.DEV_BYPASS_SECRET;
  const urlSecret = request.nextUrl.searchParams.get("secret");

  if (!secret || urlSecret !== secret) {
    return NextResponse.json(
      { ok: false, error: "Invalid or missing secret" },
      { status: 403 }
    );
  }

  // Set cookie to bypass Clerk auth
  const response = NextResponse.json({
    ok: true,
    message: "Dev bypass activated. Cookie set.",
    userId: process.env.DEV_USER_ID || "not-set",
  });

  response.cookies.set("dev_bypass", "1", {
    httpOnly: false, // Allow JavaScript access for client-side check
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24, // 24 hours
    path: "/",
  });

  return response;
}
