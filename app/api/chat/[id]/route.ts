import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

// ── DELETE /api/chat/[id] - Admin only: soft-delete a chat message ──
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require admin authentication
    const admin = await requireAdmin(request);

    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'Message ID required' },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    // Soft delete: mark as deleted instead of removing from DB
    const { data, error } = await supabase
      .from('chat_messages')
      .update({
        is_deleted: true,
        deleted_by_admin: admin.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, is_deleted, deleted_by_admin')
      .single();

    if (error) {
      console.error('Chat DELETE error:', error);
      return NextResponse.json(
        { ok: false, error: 'Failed to delete message' },
        { status: 500 }
      );
    }

    // Log admin action
    await supabase.from('admin_logs').insert({
      admin_user_id: admin.id,
      action: 'chat_message_deleted',
      target_type: 'chat_message',
      target_id: id,
      after_data: JSON.stringify(data),
    });

    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    if (err.message === 'Forbidden' || err.message === 'Unauthorized') {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 403 }
      );
    }
    console.error('Chat DELETE error:', err);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
