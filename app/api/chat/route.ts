import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { checkRateLimit, RATE_LIMITS, createRateLimitResponse } from '@/lib/rate-limit';
import { z } from 'zod';

const MESSAGE_LENGTH_LIMIT = 500;
const RECENT_DUP_WINDOW_MS = 30 * 1000; // 30 วินาที

// ── Custom rate limit for chat ──
const CHAT_RATE_LIMIT = {
  endpoint: 'chat_message',
  maxRequests: 10,
  windowMinutes: 1,
};

const CHAT_BURST_LIMIT = {
  endpoint: 'chat_burst',
  maxRequests: 30,
  windowMinutes: 10,
};

// ── Spam filter patterns ──
const SPAM_PATTERNS = [
  /https?:\/\/[^\s]+/i,           // URLs
  /@\w+/i,                         // @mentions
  /(ขาย|โปรโมชั่น|โปรโมท|สมัคร|เว็บอื่น|คลิกลิงก์)/i,
  /^([a-zA-Z0-9])\1{4,}/,         // ตัวอักษรซ้ำๆ เช่น aaaaa
  /[🎰💰💸🤑]{3,}/,               // Emoji สแปม
];

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 20);
    const before = url.searchParams.get('before'); // ISO timestamp for pagination

    const supabase = createSupabaseAdminClient();

    let query = supabase
      .from('chat_messages')
      .select('id, user_id, clerk_user_id, display_name, message, is_deleted, deleted_by_admin, created_at')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt('created_at', before);
    }

    const { data: messages, error } = await query;

    if (error) {
      console.error('Chat GET error:', error);
      return NextResponse.json({ ok: false, error: 'Failed to fetch messages' }, { status: 500 });
    }

    // Format messages
    const formatted = (messages || []).map(m => ({
      id: m.id,
      userId: m.user_id,
      displayName: m.display_name || resolveDisplayNameFromClerk(m.clerk_user_id),
      message: m.message,
      createdAt: m.created_at,
      isOwn: false,
    }));

    return NextResponse.json({ ok: true, data: formatted.reverse() });
  } catch (err) {
    console.error('Chat GET error:', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized', th: 'กรุณาเข้าสู่ระบบก่อนส่งข้อความ' },
        { status: 401 }
      );
    }

    if (user.status !== 'active') {
      return NextResponse.json(
        { ok: false, error: 'Account suspended', th: 'บัญชีของคุณถูกระงับ ไม่สามารถส่งข้อความได้' },
        { status: 403 }
      );
    }

    // ── Rate limiting ──
    const rateResult = await checkRateLimit(request, CHAT_RATE_LIMIT, user.id);
    if (!rateResult.allowed) {
      return createRateLimitResponse(rateResult);
    }

    const burstResult = await checkRateLimit(request, CHAT_BURST_LIMIT, user.id);
    if (!burstResult.allowed) {
      return createRateLimitResponse(burstResult);
    }

    // ── Validate input ──
    const body = await request.json();
    const schema = z.object({
      message: z.string().min(1).max(MESSAGE_LENGTH_LIMIT),
    });

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid message', th: 'ข้อความไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    const rawMessage = parsed.data.message.trim();

    if (!rawMessage) {
      return NextResponse.json(
        { ok: false, error: 'Empty message', th: 'ข้อความว่างเปล่า' },
        { status: 400 }
      );
    }

    // ── Spam detection ──
    for (const pattern of SPAM_PATTERNS) {
      if (pattern.test(rawMessage)) {
        return NextResponse.json(
          { ok: false, error: 'Message blocked by spam filter', th: 'ข้อความของคุณถูกปฎิเสธเนื่องจากมีเนื้อหาที่ไม่เหมาะสมหรือเป็นสแปม' },
          { status: 400 }
        );
      }
    }

    // ── Duplicate message check (last 30 sec) ──
    const supabase = createSupabaseAdminClient();
    const { data: recentMessages } = await supabase
      .from('chat_messages')
      .select('message, created_at')
      .eq('user_id', user.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(1);

    if (recentMessages && recentMessages.length > 0) {
      const lastMsg = recentMessages[0];
      const timeDiff = Date.now() - new Date(lastMsg.created_at).getTime();
      if (timeDiff < RECENT_DUP_WINDOW_MS && lastMsg.message === rawMessage) {
        return NextResponse.json(
          { ok: false, error: 'Duplicate message', th: 'คุณเพิ่งส่งข้อความนี้ไป รอสักครู่ก่อนส่งอีกครั้ง' },
          { status: 429 }
        );
      }
    }

    // ── Resolve display name: prefer DB value, fallback to Clerk data ──
    const resolvedDisplayName = user.displayName || resolveDisplayNameFromClerk(user.clerkUserId);

    // ── Insert message ──
    const { data: inserted, error: insertError } = await supabase
      .from('chat_messages')
      .insert({
        user_id: user.id,
        clerk_user_id: user.clerkUserId,
        display_name: resolvedDisplayName,
        message: rawMessage,
        is_deleted: false,
      })
      .select('id, user_id, clerk_user_id, display_name, message, created_at')
      .single();

    if (insertError) {
      console.error('Chat INSERT error:', insertError);
      return NextResponse.json({ ok: false, error: 'Failed to send message' }, { status: 500 });
    }

    // ── Auto-cleanup: hard-delete old messages beyond the latest 20 ──
    // Run silently; ignore all errors (function may not exist yet)
    try {
      await supabase.rpc('chat_cleanup_old', { p_keep_count: 20 });
    } catch (e) {
      // Silently ignore — cleanup function may not be installed yet
    }

    const response = NextResponse.json({
      ok: true,
      data: {
        id: inserted.id,
        userId: inserted.user_id,
        displayName: inserted.display_name || resolveDisplayNameFromClerk(inserted.clerk_user_id),
        message: inserted.message,
        createdAt: inserted.created_at,
      },
    });

    // Add rate limit headers
    response.headers.set('X-RateLimit-Remaining', rateResult.remaining.toString());
    response.headers.set('X-RateLimit-Reset', rateResult.resetAt);

    return response;
  } catch (err) {
    console.error('Chat POST error:', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}

// ── Helper: mask name like the rest of the app ──
function maskName(clerkId?: string | null): string {
  if (!clerkId) return 'นิรนาม';
  const short = clerkId.slice(0, 6);
  return `${short}xx`;
}

// ── Helper: resolve display name from Clerk user ID ──
// Strips "user_" prefix for cleaner display (e.g. "user_2abc123" → "2abc123")
function resolveDisplayNameFromClerk(clerkId?: string | null): string {
  if (!clerkId) return 'นิรนาม';
  const stripped = clerkId.replace(/^user_/, '');
  return stripped.length > 8 ? stripped.slice(0, 8) : stripped;
}
