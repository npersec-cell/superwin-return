import { createClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export interface RateLimitConfig {
  endpoint: string;
  maxRequests: number;
  windowMinutes?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
  resetAt: string;
  headers: Record<string, string>;
}

/**
 * Get client IP address from request
 */
export function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  if (realIP) {
    return realIP;
  }
  
  return 'unknown';
}

/**
 * Check rate limit for a request
 * @param request - NextRequest object
 * @param config - Rate limit configuration
 * @param userId - Optional user ID (if authenticated)
 * @returns Rate limit result
 */
export async function checkRateLimit(
  request: NextRequest,
  config: RateLimitConfig,
  userId?: string
): Promise<RateLimitResult> {
  const supabase = createClient();
  
  const identifier = userId || getClientIP(request);
  const endpoint = config.endpoint;
  const maxRequests = config.maxRequests;
  const windowMinutes = config.windowMinutes || 10;
  
  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_identifier: identifier,
    p_endpoint: endpoint,
    p_max_requests: maxRequests,
    p_window_minutes: windowMinutes,
  });
  
  if (error) {
    console.error('Rate limit check error:', error);
    return {
      allowed: true,
      count: 0,
      remaining: maxRequests,
      resetAt: new Date(Date.now() + windowMinutes * 60 * 1000).toISOString(),
      headers: {},
    };
  }
  
  const result = data as any;
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': maxRequests.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': new Date(result.reset_at).toISOString(),
  };
  
  if (!result.allowed) {
    headers['Retry-After'] = Math.ceil(
      (new Date(result.reset_at).getTime() - Date.now()) / 1000
    ).toString();
  }
  
  return {
    allowed: result.allowed,
    count: result.count,
    remaining: result.remaining,
    resetAt: result.reset_at,
    headers,
  };
}

/**
 * Apply rate limit to a response
 * @param response - NextResponse to modify
 * @param result - Rate limit result
 * @returns Modified response with rate limit headers
 */
export function applyRateLimitHeaders(
  response: NextResponse,
  result: RateLimitResult
): NextResponse {
  Object.entries(result.headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

/**
 * Create a rate limit exceeded response
 * @param result - Rate limit result
 * @returns NextResponse with 429 status
 */
export function createRateLimitResponse(result: RateLimitResult): NextResponse {
  const response = NextResponse.json(
    {
      ok: false,
      error: 'Too many requests. Please try again later.',
      th: 'คำขอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่',
      reset_at: result.resetAt,
    },
    { status: 429 }
  );
  
  return applyRateLimitHeaders(response, result);
}

// Predefined rate limit configurations
export const RATE_LIMITS = {
  PREDICT: {
    endpoint: 'predict',
    maxRequests: 30,
    windowMinutes: 10,
  },
  RESOLVE: {
    endpoint: 'resolve',
    maxRequests: 20,
    windowMinutes: 10,
  },
  REFUND: {
    endpoint: 'refund',
    maxRequests: 10,
    windowMinutes: 10,
  },
  CREATE_PREDICTION: {
    endpoint: 'create_prediction',
    maxRequests: 10,
    windowMinutes: 10,
  },
  AUTH: {
    endpoint: 'auth',
    maxRequests: 20,
    windowMinutes: 10,
  },
  ADMIN: {
    endpoint: 'admin',
    maxRequests: 60,
    windowMinutes: 10,
  },
};
