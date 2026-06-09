-- Number War Info / Rules table (editable by admin)
CREATE TABLE IF NOT EXISTS public.number_war_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT DEFAULT 'วิธีเล่น Number War',
  content TEXT NOT NULL DEFAULT 'กรุณาใส่คำอธิบายวิธีเล่น',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default row (only if empty)
INSERT INTO public.number_war_info (title, content)
SELECT 'วิธีเล่น Number War', E'## กติกา Number War\n\n1. เลือกซื้อเลข 0-200 ในรอบที่เปิดรับซื้อ\n2. ซื้อครั้งแรกราคา 10 ● (กระสุนเขียว)\n3. หากมีคนซื้อต่อ (แย่ง) ราคาจะ x2 ทุกครั้ง\n4. คนที่ถูกแย่งจะได้รับทุนคืน + 50% ของกำไร\n5. หมายเลขที่ชนะจะถูกประกาศโดยแอดมินหลังปิดรับซื้อ\n6. ผู้ที่ถือเลขที่ตรงกับผลจะเป็นผู้ชนะและได้รับรางวัล\n\n**หมายเหตุ:** ต้องกรอกข้อมูลจัดส่งก่อนเริ่มเล่น'
WHERE NOT EXISTS (SELECT 1 FROM public.number_war_info);

ALTER TABLE public.number_war_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY "number_war_info_select_all"
  ON public.number_war_info FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "number_war_info_update_admin"
  ON public.number_war_info FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "number_war_info_insert_admin"
  ON public.number_war_info FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

GRANT SELECT ON public.number_war_info TO authenticated, anon;
GRANT UPDATE, INSERT ON public.number_war_info TO authenticated;
