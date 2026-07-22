import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // ── Security Headers ────────────────────────────────
  
  // Prevent clickjacking attacks
  response.headers.set("X-Frame-Options", "DENY");
  
  // Prevent MIME type sniffing
  response.headers.set("X-Content-Type-Options", "nosniff");
  
  // Block reflected XSS attacks
  response.headers.set("X-XSS-Protection", "1; mode=block");
  
  // Enforce HTTPS and prevent cookie theft
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  
  // Referrer policy: only send origin for cross-origin requests
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  
  // Permissions Policy: restrict browser features
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()"
  );

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api routes
     * - static files (_next/static, _next/image, favicon.ico)
     * - public files
     * - sitemap/robots
     */
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\..*).*)",
  ],
};
