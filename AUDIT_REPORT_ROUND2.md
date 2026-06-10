# 🔍 AUDIT REPORT - SuperWinHub (รอบ 2: Auditor อิสระ)
**วันที่:** 2026-06-10  
**ผู้ตรวจสอบ:** ออดิกอิสระ (บริษัทที่ 2)  
**ขอบเขต:** ระบบ Number War + Database Functions + RLS Policies + Frontend Security

---

## ⚠️ สรุปภาพรวม
พบประเด็น **CRITICAL 2 รายการ** ที่ต้องแก้ไขด่วนก่อนเปิดใช้งานจริง  
พบประเด็น **HIGH 1 รายการ** ที่ควรแก้ไขในระยะสั้น  
ระบบหลัก (Prediction Loop + Number War Economics) ทำงานถูกต้องตามที่ออกแบบไว้

**หมายเหตุ:** ประเด็นเรื่อง Insurance Refund + `profit_score` ตรวจสอบแล้ว → **ถูกต้องตาม spec** (แพ้ไม่ได้ profit_score, ประกันแค่คืนกระสุนส้ม 50% เท่านั้น)

---

## 🚨 CRITICAL (ต้องแก้ก่อนเปิดใช้งาน)

### 1. [CRITICAL] `number_slots` RLS UPDATE Policy อนุญาตให้ใครก็ได้แก้ไข Slot
**ไฟล์:** `supabase/migrations/20260609_number_war_complete.sql` (บรรทัด 28-32)  
**ปัญหา:**
```sql
CREATE POLICY "Authenticated users can update slots"
  ON public.number_slots FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
```
หมายความว่า **ผู้ใช้ที่ login คนไหนก็ได้** สามารถ UPDATE slot ผ่าน Supabase client โดยตรง (เช่น ใช้ Postman หรือ JS console) เพื่อ:
- เปลี่ยน `owner_id` ของ slot ตัวเองให้เป็นเจ้าของโดยไม่จ่าย profit_score
- ลด `current_price` ลงเหลือ 10
- แก้ไข `total_takeovers`

**ผลกระทบ:** ผู้ใช้สามารถขโมย slot หรือปรับราคาได้โดยไม่ผ่าน API `/api/number-war/buy`

**แนวทางแก้ไข:** เปลี่ยนเป็น service_role only หรือลบ policy นี้และให้ระบบอัปเดตผ่าน API เท่านั้น (ซึ่งใช้ service_role key อยู่แล้ว)

---

### 2. [CRITICAL] `number_war_history` RLS INSERT Policy อนุญาตให้ปลอมประวัติ
**ไฟล์:** `supabase/migrations/20260609_add_number_war_history.sql` (บรรทัด 30-34)  
**ปัญหา:**
```sql
CREATE POLICY "number_war_history_insert_system"
  ON public.number_war_history FOR INSERT
  TO authenticated
  WITH CHECK (true);
```
หมายความว่า **ผู้ใช้ที่ login คนไหนก็ได้** สามารถ INSERT ประวัติปลอมๆ ได้ (เช่น บันทึกว่าตัวเอง "sold" slot ในราคา 1,000,000 กระสุนเขียว)

**ผลกระทบ:** ข้อมูลประวัติเสียหาย, อาจถูกใช้หลอกลวง

**แนวทางแก้ไข:** เปลี่ยนเป็น service_role only เช่นเดียวกับ coin_ledger

---

## 🔶 HIGH (ควรแก้ในระยะสั้น)

### 3. [HIGH] `place_prediction_atomic` - `lifetime_profit` ไม่ติดลบทำให้สถิติบิดเบือน
**ไฟล์:** `supabase/migrations/20250607_place_prediction_atomic_v2.sql` (บรรทัด 111)  
**ปัญหา:**
```sql
v_lifetime_profit_after := GREATEST(0, v_user.lifetime_profit - p_amount);
```
เมื่อผู้เล่นเดิมพัน `lifetime_profit` จะถูกหักลบ แต่ถ้าติดลบจะถูก clamp ที่ 0  หมายความว่าถ้าผู้เล่นเริ่มต้นด้วย lifetime_profit = 0 เดิมพัน 100, แล้วแพ้ → lifetime_profit ยังคงเป็น 0 แทนที่จะเป็น -100

**ผลกระทบ:** สถิติ leaderboard แสดง "กำไรสะสม" ที่ไม่สะท้อนความจริง (ไม่เห็นผู้เล่นที่ขาดทุน)

**แนวทางแก้ไข:** ลบ `GREATEST(0, ...)` และให้ `lifetime_profit` เป็นได้ทั้งบวกและลบ (ตามความเป็นจริงทางการเงิน) หรือเปลี่ยนชื่อฟิลด์เป็น `net_profit` พร้อมคำอธิบาย

---

## 🔷 MEDIUM (พิจารณาแก้ไข)

### 4. [MEDIUM] Admin API `/api/admin/number-war/config` ใช้ Auth Pattern ที่ไม่สอดคล้องกัน
**ไฟล์:** `app/api/admin/number-war/config/route.ts`  
**ปัญหา:** ใช้ `supabase.auth.getUser(token)` แทน `requireAdmin()` มาตรฐานที่ใช้ในไฟล์อื่น ทำให้มีช่องโหว่ถ้า token หมดอายุหรือถูกปลอมแปลง

**แนวทางแก้ไข:** เปลี่ยนให้ใช้ `requireAdmin(request)` เหมือนกับ `/api/admin/number-war/set-winner`

---

### 5. [MEDIUM] `winners_log` ไม่มี Unique Constraint ป้องกันการประกาศผลซ้ำ
**ไฟล์:** `supabase/migrations/20260609_number_war_complete.sql`  
**ปัญหา:** ตาราง `winners_log` ไม่มี `UNIQUE(round_id, slot_number)` ทำให้ admin อาจกด "ประกาศผล" ซ้ำสำหรับรายการเดียวกันได้

**แนวทางแก้ไข:** เพิ่ม UNIQUE constraint หรือตรวจสอบใน API ก่อน insert

---

## ✅ สิ่งที่ตรวจสอบแล้วถูกต้อง (จากรอบก่อน + รอบนี้)

### Database Functions (Atomic)
| Function | สถานะ | หมายเหตุ |
|----------|--------|----------|
| `place_prediction_atomic` | ✅ ถูกต้อง | Lock user row, ตรวจสอบ balance, หักเงิน, สร้าง entry |
| `resolve_prediction_atomic` | ✅ ถูกต้อง | Lock prediction, คำนวณ pool, จ่าย winner, insurance refund |
| `refund_prediction_atomic` | ✅ ถูกต้อง | Lock prediction, คืนเงินทุก entry, อัปเดตสถานะ |
| `calculate_user_profit_score` | ✅ ถูกต้อง | คำนวณ real-time จาก prediction_entries ที่ชนะ |

### Number War Economics
| กระบวนการ | สถานะ | หมายเหตุ |
|-----------|--------|----------|
| ซื้อครั้งแรก | ✅ ถูกต้อง | จ่าย 10 profit_score |
| แย่งซื้อ (Takeover) | ✅ ถูกต้อง | จ่าย x2, เจ้าเก่าได้คืน cost + 50% profit, 50% burn |
| ประกาศผล | ✅ ถูกต้อง | Admin กรอกคะแนน → แปลงเป็น slot → บันทึก winner |
| กระสุนเขียวไม่คืน | ✅ ถูกต้อง | ตาม spec: Number War ไม่มีการคืน profit_score |

### RLS Policies (อื่นๆ)
| Table | สถานะ | หมายเหตุ |
|-------|--------|----------|
| `users` | ✅ ถูกต้อง | Public read, own update, admin full |
| `predictions` | ✅ ถูกต้อง | Public read open/closed/resolved, admin manage |
| `prediction_entries` | ✅ ถูกต้อง | Own view/insert, admin view all |
| `coin_ledger` | ✅ ถูกต้อง | Own view, system insert, admin view all |
| `notifications` | ✅ ถูกต้อง | Own view/update, system insert |
| `number_war_rounds` | ✅ ถูกต้อง | Public read, admin manage |
| `winners_log` | ✅ ถูกต้อง | Own read, admin insert/update |

### Frontend Security
| จุดตรวจสอบ | สถานะ | หมายเหตุ |
|-----------|--------|----------|
| Address Wall (Number War) | ✅ ถูกต้อง | บล็อกการเล่นถ้ายังไม่กรอกที่อยู่ |
| Display Name (max 8 chars) | ✅ ถูกต้อง | ตรวจสอบทั้ง client + server |
| Leaderboard Name Censoring | ✅ ถูกต้อง | ไม่มี display_name → censored email |
| Buy Button Disabled | ✅ ถูกต้อง | ปิดถ้า round ไม่ใช่สถานะ open |

---

## 📋 Action Items (เรียงตามความสำคัญ)

| ลำดับ | ประเด็น | ความรุนแรง | สถานะ | ผู้รับผิดชอบ | ไฟล์ที่ต้องแก้ |
|-------|---------|-----------|--------|-------------|---------------|
| 1 | แก้ `number_slots` RLS UPDATE | 🔴 CRITICAL | ✅ แก้ใน SQL แล้ว | Dev/DBA | `20260610_critical_rls_fix.sql` |
| 2 | แก้ `number_war_history` RLS INSERT | 🔴 CRITICAL | ✅ แก้ใน SQL แล้ว | Dev/DBA | `20260610_critical_rls_fix.sql` |
| 3 | แก้ `lifetime_profit` ไม่ติดลบ | 🟠 HIGH | ⏳ รอแก้ | Dev | `20250607_place_prediction_atomic_v2.sql` |
| 4 | ปรับ `/api/admin/number-war/config` auth | 🟡 MEDIUM | ⏳ รอแก้ | Dev | `app/api/admin/number-war/config/route.ts` |
| 5 | เพิ่ม UNIQUE บน winners_log | 🟡 MEDIUM | ✅ แก้ใน SQL แล้ว | Dev/DBA | `20260610_critical_rls_fix.sql` |

**หมายเหตุ:**
- ✅ = แก้ไขแล้วใน migration file (`20260610_critical_rls_fix.sql`) รอรันบน Supabase Dashboard
- ⏳ = ยังไม่ได้แก้ ต้องพิจารณาต่อไป
- ประเด็นที่ 3 (Insurance Refund + profit_score) ตรวจสอบแล้ว → **ถูกต้องตาม spec** ไม่ต้องแก้

---

*รายงานจัดทำโดย: Auditor อิสระ (บริษัทที่ 2)*  
*ตรวจสอบเพิ่มเติมจากรอบก่อน: Number War resolve loop, Database Functions, RLS Policies, Frontend flow*
