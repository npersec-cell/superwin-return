# SUPERWIN HUB - Automated Monitoring & Alerting Guide

> **วัตถุประสงค์:** ตั้งระบบเฝ้าระวังอัตโนมัติ เพื่อไม่ต้องตรวจสอบระบบด้วยมือ

---

## 📋 หน้าที่ของแต่ละ API

### 1. Health Check API
- **URL:** `https://superwin-hub.vercel.app/api/admin/health-check`
- **วัตถุประสงค์:** ตรวจสอบความสมบูรณ์ของระบบ
- **ผลลัพธ์:** `HEALTHY`, `WARNING`, `CRITICAL`
- **ตรวจสอบ:**
  - ✅ Coin Balance vs Ledger (100% Match)
  - ✅ ธุรกรรมผิดปกติ (Negative Balance, Large Transfers)
  - ✅ Predictions ค้างสถานะเกิน 24 ชม.
  - ✅ System Performance

### 2. Daily Report API
- **URL:** `https://superwin-hub.vercel.app/api/admin/daily-report`
- **วัตถุประสงค์:** สรุปรายงานประจำวัน
- **ผลลัพธ์:** สถิติ User, Prediction, Transaction, Warnings
- **ข้อมูล:**
  - Total Users, Active Today, New Today
  - Total Predictions, Open, Resolved, New Today
  - Total Transactions, Transactions Today
  - Coins Distributed
  - Recent Activity (Last 10 actions)
  - Warnings & Health Status

---

## 🔔 Real-time Alerting Setup

### ตัวเลือก 1: Discord Webhook (แนะนำ)

**ขั้นตอน:**
1. **สร้าง Discord Webhook:**
   - ไปที่ Server → Channel → Settings → Integrations
   - กด **"Webhooks"** → **"New Webhook"**
   - ตั้งชื่อ (เช่น "SUPERWIN HUB Alert")
   - คัดลอก **Webhook URL**

2. **สร้าง Vercel Cron Job หรือใช้ External Service:**

**วิธี A: ใช้ UptimeRobot (ฟรี)**
```bash
# ตั้งค่า UptimeRobot ให้ตรวจสอบ URL ทุก 5 นาที
# ถ้า HTTP Status != 200 หรือ ok: false → ส่ง Alert ไป Discord
```

**วิธี B: ใช้ n8n (ฟรี / Self-hosted)**
```yaml
# Workflow: Check Health Every 5 Minutes
1. Trigger: Cron (*/5 * * * *)
2. HTTP Request: GET /api/admin/health-check
3. If: overallStatus == 'CRITICAL' → Send Discord Webhook
4. If: overallStatus == 'WARNING' → Send Discord Webhook (Yellow)
5. If: overallStatus == 'HEALTHY' → Do Nothing (or log)
```

**วิธี C: ใช้ Zapier (ฟรี 100 tasks/month)**
```
Trigger: Cron (Every 5 minutes)
  ↓
Action: Webhook GET https://superwin-hub.vercel.app/api/admin/health-check
  ↓
Action: Check if overallStatus == 'CRITICAL'
  ↓ Yes
Action: Discord Webhook → Send Alert
  ↓ No
Action: Do Nothing
```

### ตัวเลือก 2: Telegram Bot

**ขั้นตอน:**
1. **สร้าง Telegram Bot:**
   - คุยกับ @BotFather
   - สั่ง `/newbot` → ตั้งชื่อและ username
   - รับ **Bot Token** (เช่น `123456:ABC-DEF...`)

2. **ส่งข้อความทดสอบ:**
```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/sendMessage" \
  -d chat_id=<YOUR_CHAT_ID> \
  -d text="Hello from SUPERWIN HUB!"
```

3. **สร้าง Workflow (n8n / Zapier):**
```
Cron Trigger (Every 5 min)
  ↓
HTTP: GET /api/admin/health-check
  ↓
If: overallStatus != 'HEALTHY'
  ↓
Telegram API: sendMessage
  Text: "🔴 SYSTEM ALERT\n\n${summary}\n\n${checks.map(c => c.name + ': ' + c.status).join('\n')}"
```

---

## 📱 Daily Monitoring Report Setup

### ตัวเลือก 1: ส่ง Report ไป Discord ทุกวัน

**สร้าง n8n Workflow:**
```yaml
1. Trigger: Cron (0 9 * * *)  // 9:00 AM ทุกวัน
2. HTTP Request: GET /api/admin/daily-report
3. Format Message:
   ```
   📊 SUPERWIN HUB DAILY REPORT
   📅 ${date}
   
   👥 USERS
   • Total: ${totalUsers}
   • Active Today: ${activeUsersToday}
   • New Today: ${newUsersToday}
   
   🎯 PREDICTIONS
   • Total: ${totalPredictions}
   • Open: ${openPredictions}
   • Resolved: ${resolvedPredictions}
   
   💰 TRANSACTIONS
   • Total: ${totalTransactions}
   • Today: ${transactionsToday}
   • Coins Distributed: ${coinsDistributedToday}
   
   🏥 SYSTEM HEALTH: ${healthStatus}
   ${warnings.length > 0 ? '⚠️ WARNINGS:\n' + warnings.join('\n') : '✅ All good!'}
   ```
4. Send Discord Webhook
```

### ตัวเลือก 2: ส่ง Report ไป Email

**สร้าง n8n Workflow:**
```yaml
1. Trigger: Cron (0 9 * * *)
2. HTTP Request: GET /api/admin/daily-report
3. Email: Send to admin@example.com
   Subject: "SUPERWIN HUB Daily Report - ${date}"
   Body: (same format as above)
```

### ตัวเลือก 3: แสดงใน Slack / Microsoft Teams

คล้ายกับ Discord/Telegram แต่ใช้:
- Slack: **Incoming Webhooks**
- Teams: **Webhook Connector**

---

## 🛠️ ตัวอย่างโค้ดสำหรับ External Service

### Node.js Script (สำหรับ Self-hosted)

```javascript
const axios = require('axios');

const SUPERWIN_URL = 'https://superwin-hub.vercel.app';
const DISCORD_WEBHOOK = 'YOUR_DISCORD_WEBHOOK_URL';
const TELEGRAM_WEBHOOK = 'YOUR_TELEGRAM_WEBHOOK_URL';

async function checkHealth() {
  try {
    const response = await axios.get(`${SUPERWIN_URL}/api/admin/health-check`);
    const { data } = response.data;
    
    if (data.overallStatus === 'CRITICAL') {
      await sendDiscordAlert('🔴 CRITICAL', data.summary, data.checks);
      await sendTelegramAlert('🔴 CRITICAL', data.summary, data.checks);
    } else if (data.overallStatus === 'WARNING') {
      await sendDiscordAlert('🟡 WARNING', data.summary, data.checks);
    }
  } catch (error) {
    console.error('Health check failed:', error);
  }
}

async function sendDiscordAlert(level, summary, checks) {
  await axios.post(DISCORD_WEBHOOK, {
    username: 'SUPERWIN HUB Alert',
    embeds: [{
      title: `${level} - System Alert`,
      description: summary,
      color: level === 'CRITICAL' ? 16711680 : 16776960,
      fields: checks.map(c => ({
        name: c.name,
        value: `${c.status}: ${c.message}`,
        inline: true
      })),
      timestamp: new Date().toISOString()
    }]
  });
}

// Run every 5 minutes
setInterval(checkHealth, 5 * 60 * 1000);
checkHealth(); // Run immediately
```

### Python Script

```python
import requests
import time

SUPERWIN_URL = 'https://superwin-hub.vercel.app'
DISCORD_WEBHOOK = 'YOUR_DISCORD_WEBHOOK_URL'

ADMIN_TOKEN = 'YOUR_ADMIN_TOKEN'  # If you have API token

headers = {
    'Cookie': f'_clerk_token={ADMIN_TOKEN}'  # Or use Clerk session
}

def check_health():
    try:
        resp = requests.get(f'{SUPERWIN_URL}/api/admin/health-check', headers=headers)
        data = resp.json()
        
        if not data.get('ok'):
            send_alert('ERROR', 'Cannot access health check API')
            return
            
        report = data['data']
        
        if report['overallStatus'] == 'CRITICAL':
            send_alert('🔴 CRITICAL', report['summary'], report['checks'])
        elif report['overallStatus'] == 'WARNING':
            send_alert('🟡 WARNING', report['summary'], report['checks'])
            
    except Exception as e:
        print(f'Error: {e}')

def send_alert(level, summary, checks):
    message = {
        'username': 'SUPERWIN HUB Alert',
        'content': f'{level}\n\n{summary}\n\n' + '\n'.join([
            f"• {c['name']}: {c['status']}" for c in checks
        ])
    }
    requests.post(DISCORD_WEBHOOK, json=message)

# Run every 5 minutes
while True:
    check_health()
    time.sleep(300)
```

---

## 🎯 คำแนะนำสำหรับ Admin

### 1. ตั้งค่า Alerting (วันแรก)
1. เลือก Platform (Discord/Telegram/Slack)
2. สร้าง Webhook
3. ตั้งค่า Cron Job (ทุก 5 นาที)
4. ทดสอบ Alert ด้วยการ Simulate Error

### 2. ตั้งค่า Daily Report (วันแรก)
1. สร้าง Cron Job (9:00 AM ทุกวัน)
2. ตั้งค่าให้ส่ง Report ไปยัง Platform ที่เลือก
3. ทดสอบ Report

### 3. ตรวจสอบ (รายวัน)
- 📊 ดู Daily Report ทุกเช้า
- 🔔 ตอบ Alert ทันทีเมื่อได้รับ
- 📝 บันทึกปัญหาและวิธีแก้ไข

### 4. รีวิว (รายสัปดาห์)
- ดู Audit Logs ว่ามีกิจกรรมผิดปกติไหม
- ดู Statistics ว่าระบบเติบโตหรือเปล่า
- วางแผนปรับปรุงระบบ

---

## 📞 ติดต่อ Developer เมื่อ...

1. 🚨 ได้รับ Alert `CRITICAL` 2 ครั้งติดต่อกัน
2. 📊 Daily Report แสดง Warning ติดต่อกัน 3 วัน
3. 💾 Database ช้าหรือ Error Rate สูง
4. 🔐 มี Suspicious Activity ใน Audit Logs

---

## 📎 แหล่งอ้างอิง

- **n8n (ฟรี):** https://n8n.io
- **Zapier (ฟรี 100 tasks):** https://zapier.com
- **UptimeRobot (ฟรี):** https://uptimerobot.com
- **Vercel Cron Jobs:** https://vercel.com/docs/functions/cron-jobs
- **Discord Webhook Docs:** https://discord.com/developers/docs/resources/webhook
- **Telegram Bot Docs:** https://core.telegram.org/bots/api

---

**ตั้งค่าระบบให้ทำงานอัตโนมัติ แล้วผ่อนคลายได้เลย!** 🎉
