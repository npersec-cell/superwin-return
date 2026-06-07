import { NextRequest, NextResponse } from "next/server";

/**
 * DEV BYPASS ROUTE
 * 
 * ⚠️ SECURITY: This route ONLY works in development mode (NODE_ENV=development)
 * In production, it returns 404 Not Found
 * 
 * Usage:
 *   1. Visit: https://localhost:3000/api/dev-bypass?secret=YOUR_SECRET
 *   2. If secret matches, sets dev_bypass=1 cookie
 *   3. Subsequent requests with this cookie will bypass Clerk auth
 * 
 * To get the secret, check process.env.DEV_BYPASS_SECRET
 */

export async function GET(request: NextRequest) {
  // ❌ CRITICAL: Never allow in production
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { ok: false, error: "Not available in production" },
      { status: 404 }
    );
  }

  const secret = process.env.DEV_BYPASS_SECRET;
  const urlSecret = request.nextUrl.searchParams.get("secret");

  if (!secret || urlSecret !== secret) {
    return NextResponse.json(
      { ok: false, error: "Invalid or missing secret" },
      { status: 403 }
    );
  }

  // Set cookie to bypass Clerk auth
  // ⚠️ SECURITY: Use httpOnly to prevent JavaScript access
  const response = NextResponse.json({
    ok: true,
    message: "Dev bypass activated. Cookie set.",
    userId: process.env.DEV_USER_ID || "not-set",
    warning: "⚠️ This is for development only. DO NOT use in production!"
  });

  response.cookies.set("dev_bypass", "1", {
    httpOnly: true,  // ✅ Prevent JavaScript access (more secure)
    secure: true,     // ✅ Only send over HTTPS (except localhost)
    sameSite: "strict", // ✅ Prevent CSRF
    maxAge: 60 * 60 * 24, // 24 hours
    path: "/",
  });

  return response;
}
