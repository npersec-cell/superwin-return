# SUPERWIN RETURN - System Specification

เอกสารนี้สรุประบบสำหรับสร้างเว็บทายผล PUBG MOBILE แบบใช้เหรียญฟรี ไม่มีเงินจริงเกี่ยวข้อง

---

## 1. เป้าหมายระบบ

```text
SUPERWIN RETURN คือเว็บ Prediction สำหรับ PUBG MOBILE
ผู้ใช้รับเหรียญฟรี แล้วใช้เหรียญทายคำถาม
ระบบจัดอันดับ All-time Profit (ตลอดกาล)
ไม่มีระบบรางวัลรายเดือน — เปลี่ยนเป็น Shop (coming soon)
```

สิ่งที่ระบบไม่ใช่:

```text
- ไม่ใช่เว็บพนันเงินจริง
- ไม่มีเติมเงินจริงเพื่อซื้อเหรียญ
- ไม่มีถอนเงิน
- ไม่มี cash-out
- Tournament เป็นแค่ชื่ออ้างอิงของชุดคำถาม
```

---

## 2. Stack ที่แนะนำ

```text
Frontend / Backend:
Next.js

Authentication:
Clerk

Database:
Supabase Postgres

Hosting:
Vercel

Storage:
Supabase Storage หรือ Vercel Blob สำหรับรูป reward proof

Rate Limit:
เริ่มจาก database-based rate limit ก่อน
ถ้าคนเยอะค่อยเพิ่ม Upstash Redis
```

เหตุผล:

```text
- ต้นทุนเริ่มต้นต่ำ
- รองรับ MVP ได้เร็ว
- Clerk ลดงานระบบ login
- Supabase มี Postgres เหมาะกับระบบ ledger
- Vercel เหมาะกับ Next.js
```

---

## 3. User Flow

### 3.1 Login

```text
1. User เข้าเว็บ
2. กด Login
3. Login ผ่าน Clerk
4. ระบบสร้าง user record ถ้ายังไม่มี
5. เก็บ clerk_user_id, email, display_name
```

### 3.2 Claim Coins

```text
1. User กด Claim 100
2. Backend ตรวจ session จาก Clerk
3. ตรวจว่า user ถึงเวลา claim หรือยัง
4. ถ้าถึงเวลา เพิ่ม 100 coins
5. เขียน coin_ledger type = claim
6. ตั้ง next_claim_at = now + 1 hour
```

กติกา:

```text
Claim amount: 100 coins
Cooldown: 1 hour
ต้องทำ server-side เท่านั้น
```

### 3.3 Predict

```text
1. User เลือกคำถามที่ยังเปิดอยู่
2. เลือกคำตอบ
3. เลือกจำนวน coins
4. กด Predict
5. Backend ตรวจว่า question ยังไม่ปิด
6. Backend ตรวจว่า user มี coins พอ
7. หัก coins
8. สร้าง prediction_entry
9. เขียน coin_ledger type = predict
10. รายการเข้า Running
```

### 3.4 Running

```text
Running คือรายการที่ user ทายไปแล้ว แต่ admin ยังไม่ได้ resolve ผล
```

Running ต้องแสดง:

```text
- Question
- Selected answer
- Coins used
- Approx. return
- Status: Running
```

### 3.5 History

History ต้องเก็บตั้งแต่สร้างบัญชี แต่ในหน้า UI แสดงแบบแบ่งหน้า

```text
แสดง 10 รายการต่อหน้า
เก็บสูงสุด 50 หน้า = 500 รายการล่าสุด
เกิน 500 รายการเก่าลบทิ้งจาก UI history ได้
แต่ backend ledger จริงควรเก็บถาวรเพื่อ audit
```

ประเภท History:

```text
- Claim
- Predict
- Payout
- Refund
```

ข้อมูลแต่ละแถว:

```text
- Date
- Time
- Action
- Detail
- Amount
```

Filter:

```text
All / Predict / Claim / Payout
```

---

## 4. Prediction Rules

### 4.1 Question

แต่ละคำถามมี:

```text
- Tournament name
- Question title
- Options
- Open time
- Close time
- Status
- Fee rate
- Result option
```

Status:

```text
draft
open
closed
resolved
canceled
```

### 4.2 Options

```text
หนึ่งคำถามมีได้สูงสุด 50 options
```

ตัวอย่าง:

```text
Question:
Which team will win the championship?

Options:
Alpha Esports
Bravo Gaming
Charlie Squad
Delta Force
...
```

### 4.3 Closing Time

```text
แต่ละคำถามมี countdown ของตัวเอง
เมื่อหมดเวลา คำถามหายจาก Open Questions
รายการที่ user ทายแล้วจะอยู่ใน Running เพื่อรอผล
```

---

## 5. Payout Logic

ใช้ระบบ pari-mutuel แบบง่าย

```text
total_pool = coins ทั้งหมดที่ลงในคำถามนั้น
fee_rate = 3%
payout_pool = floor(total_pool * 0.97)
winning_pool = coins ทั้งหมดที่ลงในตัวเลือกที่ชนะ
user_payout = floor((user_bet / winning_pool) * payout_pool)
```

ตัวอย่าง:

```text
total_pool = 10,000
fee 3% = 300
payout_pool = 9,700

winning_pool = 2,000
user ลงฝั่งชนะ 100
user_payout = floor((100 / 2,000) * 9,700)
user_payout = 485
```

หลัง resolve:

```text
- คนทายถูกได้รับ payout
- คนทายผิดเสีย coins ที่ใช้
- ระบบเก็บ fee
- เขียน coin_ledger ทุก movement
```

## 6. Leaderboard Rules

Leaderboard หลักคือ All-time (ตลอดกาล)

```text
All-Time Top 10
จัดอันดับจาก Lifetime Profit
ไม่ใช่ coin balance
```

Lifetime Profit:

```text
คำนวณจากผลสุทธิของ prediction ทั้งหมดที่เคยทำ
ไม่รวม coin balance ที่เหลือ
```

กติกา:

```text
- เริ่มนับตั้งแต่สร้างบัญชี
- ไม่มีการรีเซ็ตย้ายเดือน
- ไม่มี Month Ends countdown
- ระบบเป็น All-time ตลอดไป
```

---

## 7. Shop Rules (แทนที่ระบบ Reward เดิม)

```text
- ไม่มีการให้รางวัลรายเดือนแล้ว
- เปลี่ยนเป็น Shop (coming soon)
- ผู้ใช้สะสมเหรียญเพื่อใช้ใน Shop ภายหลัง
- ไม่มี Prize panel ในหน้าแรก
```

---

## 8. Admin Flow

### 8.1 Admin Login

```text
ใช้ Clerk เหมือน user
แต่ตรวจ role = admin
```

### 8.2 Prediction Management

Admin ทำได้:

```text
- สร้าง prediction
- ใส่ tournament name
- ใส่ question
- เพิ่ม options สูงสุด 50
- ตั้ง open time
- ตั้ง close time
- ตั้ง fee rate
- เปิด/ปิดคำถาม
```

### 8.3 Resolve Result

```text
1. Admin เลือกคำถามที่ closed
2. เลือก winning option
3. ระบบ preview payout
4. Admin confirm resolve
5. ระบบจ่าย payout
6. ระบบเขียน ledger
7. สถานะเป็น resolved
```

### 8.4 Cancel / Refund

```text
1. Admin เลือก cancel question
2. ระบบ refund 100% ให้ทุกคน
3. เขียน coin_ledger type = refund
4. ไม่คิด fee
5. สถานะเป็น canceled
```

### 8.5 Shop (แทน Reward Proof)

```text
- ระบบ Shop อยู่ระหว่าจัดทำ (coming soon)
- Admin จัดการไอเทมใน Shop
- ผู้ใช้สะสมเหรียญเพื่อเปิด Shop ภายหลัง
- ไม่มี reward proof แล้าะไม่มีการอัปโหลด proof image
```

---

## 9. Database Schema

### 9.1 users

```sql
users
- id uuid primary key
- clerk_user_id text unique not null
- email text not null
- display_name text
- role text default 'user'
- coin_balance integer default 0
- lifetime_profit integer default 0
- last_claim_at timestamptz
- next_claim_at timestamptz
- status text default 'active'
- created_at timestamptz
- updated_at timestamptz
```

### 9.2 coin_ledger

```sql
coin_ledger
- id uuid primary key
- user_id uuid references users(id)
- type text -- claim, predict, payout, refund, fee, adjustment
- amount integer not null
- balance_after integer not null
- ref_type text -- question, prediction_entry, reward, admin
- ref_id uuid
- detail text
- created_at timestamptz
```

### 9.3 predictions

```sql
predictions
- id uuid primary key
- tournament_name text not null
- question text not null
- status text -- draft, open, closed, resolved, canceled
- opens_at timestamptz
- closes_at timestamptz
- fee_rate numeric default 0.03
- winning_option_id uuid
- resolved_at timestamptz
- canceled_at timestamptz
- created_by uuid references users(id)
- created_at timestamptz
- updated_at timestamptz
```

### 9.4 prediction_options

```sql
prediction_options
- id uuid primary key
- prediction_id uuid references predictions(id)
- label text not null
- sort_order integer
- created_at timestamptz
```

### 9.5 prediction_entries

```sql
prediction_entries
- id uuid primary key
- user_id uuid references users(id)
- prediction_id uuid references predictions(id)
- option_id uuid references prediction_options(id)
- amount integer not null
- estimated_return_percent numeric
- status text -- running, won, lost, refunded
- payout_amount integer default 0
- created_at timestamptz
- resolved_at timestamptz
```

### 9.6 monthly_leaderboards

```sql
monthly_leaderboards
- id uuid primary key
- month text not null -- YYYY-MM
- user_id uuid references users(id)
- monthly_profit integer default 0
- total_used integer default 0
- total_payout integer default 0
- rank integer
- updated_at timestamptz
```

### 9.7 rewards

```sql
rewards
- id uuid primary key
- month text not null
- rank integer
- user_id uuid references users(id)
- reward_name text
- status text -- pending, contacting, completed, canceled
- proof_image_url text
- proof_note text
- fulfilled_at timestamptz
- created_at timestamptz
```

### 9.8 admin_logs

```sql
admin_logs
- id uuid primary key
- admin_user_id uuid references users(id)
- action text
- target_type text
- target_id uuid
- before_data jsonb
- after_data jsonb
- created_at timestamptz
```

---

## 10. Backend API / Server Actions

### User APIs

```text
GET /api/me
POST /api/claim
GET /api/predictions/open
POST /api/predictions/:id/predict
GET /api/predictions/running
GET /api/history
GET /api/leaderboard/all-time
GET /api/shop (coming soon)
```

### Admin APIs

```text
POST /api/admin/predictions
PATCH /api/admin/predictions/:id
POST /api/admin/predictions/:id/close
POST /api/admin/predictions/:id/resolve
POST /api/admin/predictions/:id/cancel
POST /api/admin/rewards
POST /api/admin/rewards/:id/proof
GET /api/admin/users
GET /api/admin/ledger
GET /api/admin/logs
```

---

## 11. Security Rules

ต้องทำ server-side เท่านั้น:

```text
- claim coins
- deduct coins
- create prediction entry
- payout
- refund
- leaderboard calculation
```

ห้ามเชื่อค่าจาก frontend:

```text
- user_id
- email
- coin amount ที่ไม่ validate
- payout amount
- role admin
- winning option
```

ต้องมี:

```text
- Clerk session verification
- database transaction
- row locking ตอนเปลี่ยน coin balance
- rate limit claim/predict
- audit log สำหรับ admin
- unique guard กันกดซ้ำในช่วงเวลาเดียวกัน
```

---

## 12. Anti-cheat Rules

### Claim

```text
- user ต้อง login
- now >= next_claim_at
- claim amount fixed = 100
- update balance ใน transaction
- เขียน ledger ทุกครั้ง
```

### Predict

```text
- user ต้อง login
- question status = open
- now อยู่ระหว่าง opens_at และ closes_at
- amount > 0
- user.coin_balance >= amount
- หัก coin ใน transaction
- เขียน ledger
```

### Resolve

```text
- เฉพาะ admin
- question status = closed
- ห้าม resolve ซ้ำ
- payout ทำใน transaction
- เขียน ledger ทุก user ที่ได้ payout
```

---

## 13. Frontend Pages

User-facing:

```text
/
- Dashboard + open questions
- Claim
- Running
- History
- All-Time Top 10
- Info
```

Admin-facing:

```text
/admin
/admin/predictions
/admin/predictions/new
/admin/predictions/[id]
/admin/predictions/[id]/resolve
/admin/rewards
/admin/users
/admin/ledger
/admin/logs
```

---

## 14. Build Phases

### Phase 1: System Foundation

```text
- Next.js project
- Clerk setup
- Supabase setup
- users table
- auth middleware
```

### Phase 2: Coin System

```text
- coin_balance
- claim 100 / 1 hour
- coin_ledger
- history API
```

### Phase 3: Prediction System

```text
- open predictions
- options
- predict with coins
- running predictions
- close countdown
```

### Phase 4: Admin System

```text
- create prediction
- manage options
- open/close/cancel
- resolve result
```

### Phase 5: Payout and All-Time Leaderboard

```text
- payout calculation
- refund
- all-time leaderboard
- no month-end countdown
```

### Phase 6: Shop (Coming Soon)

```text
- shop setup (coming soon)
- no reward proof upload
- no monthly winner announcement
```

---

## 15. Current Frontend Prototype Status

```text
File:
index.html

Status:
User-facing prototype is ready for UI validation
```

Included:

```text
- logo
- dark/red/gold theme
- universal font stack close to Untitled Sans
- claim
- predict
- running
- history
- history filter
- history pagination
- all-time leaderboard
- per-question countdown
- info modal
- Google Translate
- reset demo
- subtle transitions
- mobile-friendly layout
```

Not included yet:

```text
- real login
- real database
- real server validation
- real admin panel
- real payout
- shop (coming soon)
```

---

## 16. Recommended Next Step

```text
เริ่มสร้าง Next.js project จริง
แล้วทำ Phase 1: System Foundation
```

ก่อนเริ่มเขียนระบบจริง ต้องมี:

```text
- Clerk account/project
- Supabase project
- GitHub repo หรือ workspace project folder
- Vercel account ถ้าจะ deploy
```
