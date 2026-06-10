-- CRITICAL SECURITY FIX: Number War RLS Policies
-- Date: 2026-06-10
-- Auditor: ออดิกอิสระ (บริษัทที่ 2)
-- Purpose: แก้ไขช่องโหว่ RLS ที่อนุญาตให้ผู้ใช้ทั่วไปแก้ไข number_slots และปลอมประวัติ number_war_history

-- ============================================================================
-- FIX 1: number_slots - ลบ UPDATE policy ที่อันตราย
-- เดิม: "Authenticated users can update slots" อนุญาตให้ใครก็ได้ UPDATE
-- แก้ไข: ลบ policy นี้ ให้อัปเดตผ่าน API (service_role) เท่านั้น
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can update slots" ON public.number_slots;

-- เก็บไว้เฉพาะ SELECT policy (public read)
DROP POLICY IF EXISTS "Public can view number slots" ON public.number_slots;
CREATE POLICY "Public can view number slots"
  ON public.number_slots FOR SELECT
  USING (true);

-- ============================================================================
-- FIX 2: number_war_history - เปลี่ยน INSERT policy เป็น service_role only
-- เดิม: "number_war_history_insert_system" อนุญาตให้ authenticated user ใดก็ได้ INSERT
-- แก้ไข: อนุญาตเฉพาะ service_role (API server) เท่านั้น
-- ============================================================================

DROP POLICY IF EXISTS "number_war_history_insert_system" ON public.number_war_history;

CREATE POLICY "number_war_history_insert_system"
  ON public.number_war_history FOR INSERT
  TO service_role
  WITH CHECK (true);

-- เก็บ SELECT policy เดิมไว้ (own + admin)
DROP POLICY IF EXISTS "number_war_history_select_own" ON public.number_war_history;
CREATE POLICY "number_war_history_select_own"
  ON public.number_war_history FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
  ));

-- ============================================================================
-- FIX 3: เพิ่ม UNIQUE constraint บน winners_log ป้องกันประกาศผลซ้ำ
-- ============================================================================

DO $$
BEGIN
  ALTER TABLE public.winners_log
  ADD CONSTRAINT winners_log_round_slot_unique UNIQUE (round_id, slot_number);
EXCEPTION WHEN duplicate_table OR unique_violation THEN
  NULL;
END $$;

-- ============================================================================
-- Grants (re-apply)
-- ============================================================================

GRANT SELECT ON public.number_slots TO authenticated;
GRANT SELECT ON public.number_slots TO anon;
GRANT SELECT ON public.number_war_history TO authenticated;
GRANT SELECT ON public.number_war_rounds TO authenticated;
GRANT SELECT ON public.number_war_rounds TO anon;
