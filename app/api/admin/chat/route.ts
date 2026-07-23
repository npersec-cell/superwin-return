import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

// ── GET /api/admin/chat - Admin only: fetch all chat messages with user info ──
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);
    const includeDeleted = url.searchParams.get('include_deleted') === 'true';

    const supabase = createSupabaseAdminClient();

    let query = supabase
      .from('chat_messages')
      .select(`
        id,
        user_id,
        clerk_user_id,
        display_name,
        message,
        is_deleted,
        deleted_by_admin,
        created_at,
        users!chat_messages_user_id_fkey (
          id,
          display_name,
          email,
          role,
          status
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!includeDeleted) {
      query = query.eq('is_deleted', false);
    }

    const { data: messages, error } = await query;

    if (error) {
      console.error('Admin chat GET error:', error);
      return NextResponse.json(
        { ok: false, error: 'Failed to fetch chat messages' },
        { status: 500 }
      );
    }

    const formatted = (messages || []).map(m => ({
      id: m.id,
      userId: m.user_id,
      clerkUserId: m.clerk_user_id,
      displayName: m.display_name,
      userEmail: m.users?.email || 'unknown',
      userRole: m.users?.role || 'user',
      userStatus: m.users?.status || 'active',
      message: m.message,
      isDeleted: m.is_deleted,
      deletedByAdmin: m.deleted_by_admin,
      createdAt: m.created_at,
    }));

    return NextResponse.json({ ok: true, data: formatted });
  } catch (err: any) {
    if (err.message === 'Forbidden' || err.message === 'Unauthorized') {
      return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
    }
    console.error('Admin chat GET error:', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
