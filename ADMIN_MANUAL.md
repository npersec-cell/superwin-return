# SUPERWIN HUB - คู่มือการใช้งานสำหรับผู้ดูแลระบบ (Admin Manual)

> **เวอร์ชัน:** 1.0.0 | **อัปเดต:** 2026-06-08

---

## 📑 สารบัญ

1. [การจัดการการทายผล](#1-การจัดการการทายผล)
2. [การจัดการการเงิน](#2-การจัดการการเงิน)
3. [การตรวจสอบความปลอดภัย](#3-การตรวจสอบความปลอดภัย)
4. [การแก้ไขปัญหาเบื้องต้น](#4-การแก้ไขปัญหาเบื้องต้น)
5. [ข้อควรระวัง](#5-ข้อควรระวัง)

---

## 1. การจัดการการทายผล

### 1.1 สร้างรอบการทายผล (Prediction)

**ขั้นตอน:**
1. เข้าสู่ `/admin/predictions`
2. กดปุ่ม **"+ สร้างการทายผล"**
3. กรอกข้อมูล:
   - **Tournament Name**: ชื่อทัวร์นาเมนต์ (เช่น "Valorant VCT 2026")
   - **Question**: คำถาม (เช่น "ทีม A จะชนะไหม?")
   - **Options**: ตัวเลือกคำตอบ (ตั้งแต่ 2 ตัวเลือกขึ้นไป)
   - **Fee Rate**: อัตราค่าธรรมเนียม (เริ่มต้น 3%)
   - **Opens At / Closes At**: เวลาเปิดรับและปิดรับทายผล
4. กด **"สร้าง"**

### 1.2 แก้ไข/ลบ Prediction

**แก้ไข:**
- ไปที่ `/admin/predictions`
- คลิกที่ Row ของ Prediction ที่ต้องการแก้ไข
- แก้ไขข้อมูลแล้วกด **"บันทึก"**

**ลบ:**
- ⚠️ **ไม่ควรลบ Prediction ที่มีผู้เล่นวางเงินแล้ว** (จะทำให้ข้อมูลไม่สมบูรณ์)
- ควรใช้วิธี **ปิดการรับทายผล** แทน (ตั้ง Closes At เป็นเวลาปัจจุบัน)

### 1.3 Resolve ผลลัพธ์ (สำคัญที่สุด!)

**ขั้นตอน:**
1. ไปที่ `/admin/predictions`
2. ค้นหา Prediction ที่ต้องการสรุปผล
3. กดปุ่ม **"สรุปผล"**
4. เลือก **ตัวเลือกที่ชนะ**
5. กด **"ยืนยันสรุปผล"**

**สิ่งที่จะเกิดขึ้นหลัง Resolve:**
- ✅ System จะคำนวณและแจกจ่ายเหรียญให้ผู้ชนะ
- ✅ Leaderboard Cache จะถูกรีเฟรชทันที
- ✅ Audit Log จะบันทึกกิจกรรมของ Admin
- ✅ Notification จะถูกส่งให้ผู้ชนะ

**⚠️ ข้อควรระวัง:**
- **ไม่สามารถ Undo** ได้หลังจาก Resolve
- ตรวจสอบให้แน่ใจว่าผลลัพธ์ถูกต้องก่อนกดยืนยัน
- ควร Resolve หลังจาก **ปิดรับทายผล** แล้วเท่านั้น

---

## 2. การจัดการการเงิน

### 2.1 ตรวจสอบยอดเงิน (Ledger)

**ดู Ledger ของ User ใด User หนึ่ง:**
1. ไปที่ `/admin/users`
2. คลิกที่ Row ของ User ที่ต้องการ
3. จะแสดง Coin Balance และประวัติการทำรายการ (Ledger)

**ดู Ledger ทั้งหมด:**
1. ไปที่ `/admin/ledger` (ถ้ามี)
2. หรือ Query ใน Supabase:
```sql
SELECT * FROM coin_ledger 
WHERE user_id = 'USER_ID' 
ORDER BY created_at DESC
LIMIT 50;
```

### 2.2 ตรวจสอบความถูกต้องของยอดเงิน

**รัน SQL Data Integrity Check:**
```sql
-- Copy content from: scripts/data_integrity_check.sql
-- Run in Supabase Dashboard → SQL Editor
```

**หรือ Query ง่ายๆ:**
```sql
-- ดูยอดเงินที่ควรเป็น (จาก Ledger)
SELECT 
  user_id,
  SUM(CASE WHEN type = 'credit' THEN amount ELSE -amount END) as calculated_balance
FROM coin_ledger
GROUP BY user_id
ORDER BY calculated_balance DESC;

-- ดูยอดเงินจริง (จาก Users Table)
SELECT id, email, coin_balance FROM users ORDER BY coin_balance DESC;
```

### 2.3 การทำ Refund (คืนเงิน)

**เมื่อไหร่ที่ควรทำ Refund:**
- Prediction ถูกปิดก่อนเวลา (ไม่มีผลลัพธ์)
- ผู้เล่นจ่ายเงินโดยไม่ได้ตั้งใจ
- ข้อผิดพลาดของระบบ

**ขั้นตอน:**
1. ไปที่ `/admin/predictions`
2. ค้นหา Prediction ที่ต้องการ Refund
3. กดปุ่ม **"Refund"**
4. ยืนยันการ Refund

**⚠️ ข้อควรระวัง:**
- Refund จะคืนเงินให้กับทุกคนที่วางเงินใน Prediction นั้น
- ไม่ควร Refund ถ้า Prediction ถูก Resolve แล้ว

---

## 3. การตรวจสอบความปลอดภัย

### 3.1 Audit Logs

**ดู Audit Logs:**
1. ไปที่ `/admin/audit-logs`
2. สามารถกรองตาม:
   - **Action**: ประเภทกิจกรรม (resolve_prediction, refund, create_prediction, etc.)
   - **Admin**: ชื่อ Admin ที่ทำรายการ
   - **Date Range**: ช่วงเวลา
3. คลิกที่ Row เพื่อดูรายละเอียด

**ประเภทของ Audit Logs:**
- `resolve_prediction` - Admin สรุปผล Prediction
- `refund` - Admin คืนเงิน
- `create_prediction` - Admin สร้าง Prediction
- `update_prediction` - Admin แก้ไข Prediction
- `refresh_leaderboard` - Admin รีเฟรช Leaderboard Cache

### 3.2 ตรวจสอบกิจกรรมผิดปกติ

**สิ่งที่ควรสังเกต:**
- มีการ Resolve หลายครั้งในเวลาสั้นๆ (อาจเป็นการหลอกลวง)
- มีการ Refund หลายครั้ง (อาจเป็นการคืนเงินโดยไม่จำเป็น)
- มีการสร้าง Prediction จำนวนมาก (อาจเป็น Spam)

---

## 4. การแก้ไขปัญหาเบื้องต้น

### 4.1 Leaderboard ไม่ขึ้น / ข้อมูลเก่า

**สาเหตุ:** Cache ยังไม่หมดอายุ (1 นาที)

**วิธีแก้ไข:**
1. ไปที่ `/admin/leaderboard/refresh`
2. กดปุ่ม **"Refresh Leaderboard Cache"**
3. รอสักครู่แล้วทดสอบอีกครั้ง

### 4.2 User ไม่ได้รับเหรียญหลัง Resolve

**ตรวจสอบ:**
1. ยืนยันว่า Resolve สำเร็จ (ดู Audit Logs)
2. ดู Ledger ของ User นั้นว่ามีการทำรายการหรือไม่
3. ลอง Refresh Cache (ดูข้อ 4.1)

**ถ้ายังไม่ได้:**
- ติดต่อ Developer หรือตรวจสอบ Database:
```sql
SELECT * FROM coin_ledger 
WHERE user_id = 'USER_ID' 
ORDER BY created_at DESC 
LIMIT 10;
```

### 4.3 User ไม่ได้รับ Notification

**ตรวจสอบ:**
1. ดู Database ว่า Notification ถูกสร้าง:
```sql
SELECT * FROM notifications 
WHERE user_id = 'USER_ID' 
ORDER BY created_at DESC 
LIMIT 10;
```

**ถ้าไม่มี Notification:**
- ติดต่อ Developer (อาจมีปัญหากับ Database Function)

### 4.4 Error ทั่วไป

**วิธีแก้ไขเบื้องต้น:**
1. ลอง **Hard Refresh** (Ctrl + F5)
2. ลอง **Clear Browser Cache**
3. ลอง **Incognito Mode**
4. ลอง **Clear Cookies**
5. ติดต่อ Developer ถ้ายังไม่ได้

---

## 5. ข้อควรระวัง

### ❌ สิ่งที่ Admin ห้ามทำ

1. **ห้ามลบ User** - อาจทำให้ข้อมูล Ledger ไม่สมบูรณ์
2. **ห้ามลบ Prediction ที่มีผู้เล่นวางเงินแล้ว** - อาจทำให้ข้อมูลไม่สมบูรณ์
3. **ห้ามแก้ไข Coin Balance ด้วย SQL** - ใช้ Refund หรือระบบเติมเงินแทน
4. **ห้าม Share Admin Password** - รักษาความปลอดภัย
5. **ห้าม Resolve Prediction ที่ไม่แน่ใจ** - ไม่สามารถ Undo ได้

### ✅ สิ่งที่ Admin ควรทำเป็นประจำ

#### รายวัน
- [ ] ตรวจสอบ Audit Logs ว่ามีกิจกรรมผิดปกติหรือไม่
- [ ] ตรวจสอบว่ามี Prediction ที่ควร Resolve แล้วหรือไม่

#### รายสัปดาห์
- [ ] รัน SQL Data Integrity Check (ดูใน `scripts/data_integrity_check.sql`)
- [ ] ตรวจสอบยอดเงินของ Top 10 Users ว่าถูกต้องหรือไม่
- [ ] ตรวจสอบว่ามี User ที่มีปัญหาหรือไม่ (Complaints)

#### รายเดือน
- [ ] สรุปสถิติของระบบ (จำนวน User, จำนวน Prediction, จำนวนการทำรายการ)
- [ ] ตรวจสอบความปลอดภัยของระบบ (เปลี่ยน Password, อัปเดต Dependencies)
- [ ] สำรอง Database

### 📞 ติดต่อ Developer เมื่อ...

1. System Error บ่อยๆ
2. User ร้องเรียนเกี่ยวกับยอดเงิน
3. Performance ช้าผิดปกติ
4. ปัญหาความปลอดภัย
5. ข้อมูลไม่ถูกต้อง

---

## 📎 แหล่งอ้างอิง

- **SQL Scripts:** `scripts/data_integrity_check.sql`
- **Migration Files:** `supabase/migrations/`
- **Vercel Dashboard:** https://vercel.com
- **Supabase Dashboard:** https://supabase.com
- **GitHub Repo:** https://github.com/npersec-cell/superwin-return

---

**หากมีปัญหาเพิ่มเติม ติดต่อ Developer ทันที!** 🚀
