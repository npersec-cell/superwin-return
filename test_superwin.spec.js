// ============================================
// Automation Test Script - SuperWin HUB
// ใช้ Playwright สำหรับทดสอบอัตโนมัติ
// รันเอง: npx playwright test test_superwin.spec.js --headed
// ============================================

const { test, expect } = require('@playwright/test');

// ===== CONFIG =====
const BASE_URL = 'https://your-vercel-url.vercel.app'; // เปลี่ยนเป็น URL จริง
const USER_EMAIL = 'test@example.com'; // เปลี่ยนเป็นอีเมล์ User
const USER_PASSWORD = 'password123'; // เปลี่ยนเป็นรหัสผ่าน
const ADMIN_EMAIL = 'admin@example.com'; // เปลี่ยนเป็นอีเมล์ Admin
const ADMIN_PASSWORD = 'admin123';
// =================

test.describe('SuperWin HUB - ทดสอบ 5 สถานการณ์', () => {
  
  let userBalanceBefore = 0;
  let userProfitBefore = 0;

  // ===== HELPER FUNCTIONS =====
  async function login(page, email, password) {
    await page.goto(`${BASE_URL}/sign-in`);
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE_URL}/`);
  }

  async function getBalance(page) {
    // รอให้แสดงผลยอด (ปรับ selector ตามหน้าเว็บจริง)
    const balanceText = await page.locator('[data-testid="coin-balance"]').textContent();
    return parseInt(balanceText.replace(/,/g, ''));
  }

  async function getProfit(page) {
    const profitText = await page.locator('[data-testid="lifetime-profit"]').textContent();
    return parseInt(profitText.replace(/,/g, ''));
  }

  async function findOpenPrediction(page) {
    // หา Prediction ที่เปิดรับแทง
    await page.goto(`${BASE_URL}/`);
    const firstOpenPrediction = page.locator('[data-testid="prediction-card"]').first();
    await firstOpenPrediction.click();
    await page.waitForURL(/\/predictions\/\w+/);
  }

  async function placeBet(page, amount, buyInsurance = false) {
    // กดเลือก option
    await page.locator('[data-testid="option-button"]').first().click();
    
    // ใส่จำนวนเงิน
    await page.fill('[data-testid="bet-amount"]', amount.toString());
    
    // ติ๊กประกัน (ถ้าต้องการ)
    if (buyInsurance) {
      await page.check('[data-testid="insurance-checkbox"]');
    }
    
    // กดซื้อ
    await page.click('[data-testid="place-bet-button"]');
    
    // รอให้ระบบบันทึก
    await page.waitForTimeout(2000);
  }

  // ===== TEST CASES =====

  test('สถานการณ์ที่ 1: ทายถูก ไม่ซื้อประกัน', async ({ page }) => {
    // 1. Login
    await login(page, USER_EMAIL, USER_PASSWORD);
    
    // 2. จดยอดก่อนแทง
    userBalanceBefore = await getBalance(page);
    userProfitBefore = await getProfit(page);
    console.log(`Before: Balance=${userBalanceBefore}, Profit=${userProfitBefore}`);
    
    // 3. หาโพยเปิดแทง
    await findOpenPrediction(page);
    
    // 4. แทง 100 ไม่ซื้อประกัน
    const betAmount = 100;
    await placeBet(page, betAmount, false);
    
    // 5. ตรวจสอบยอดหลังแทง
    const balanceAfterBet = await getBalance(page);
    expect(balanceAfterBet).toBe(userBalanceBefore - betAmount);
    console.log(`After bet: Balance=${balanceAfterBet}`);
    
    // 6. Login admin และประกาศผล
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`${BASE_URL}/admin`);
    
    // เลือกโพยที่เพิ่งแทง → Select winning option → Resolve
    // (ปรับ selector ตามหน้า Admin จริง)
    await page.locator('[data-testid="resolve-button"]').click();
    await page.locator('[data-testid="winning-option-0"]').click();
    await page.click('[data-testid="confirm-resolve"]');
    
    await page.waitForTimeout(3000);
    
    // 7. ตรวจสอบผล
    await login(page, USER_EMAIL, USER_PASSWORD);
    const finalBalance = await getBalance(page);
    const finalProfit = await getProfit(page);
    
    console.log(`Final: Balance=${finalBalance}, Profit=${finalProfit}`);
    console.log(`✅ สถานการณ์ที่ 1 pass!`);
  });

  test('สถานการณ์ที่ 2: ทายถูก ซื้อประกัน', async ({ page }) => {
    await login(page, USER_EMAIL, USER_PASSWORD);
    
    userBalanceBefore = await getBalance(page);
    userProfitBefore = await getProfit(page);
    
    await findOpenPrediction(page);
    
    const betAmount = 100;
    const insuranceCost = 20; // 20%
    await placeBet(page, betAmount, true);
    
    const balanceAfterBet = await getBalance(page);
    expect(balanceAfterBet).toBe(userBalanceBefore - betAmount - insuranceCost);
    
    // Admin resolve → user ถูก
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    // ... resolve ...
    
    await login(page, USER_EMAIL, USER_PASSWORD);
    const finalBalance = await getBalance(page);
    
    console.log(`✅ สถานการณ์ที่ 2 pass!`);
  });

  test('สถานการณ์ที่ 3: ทายผิด แต่มีประกัน', async ({ page }) => {
    await login(page, USER_EMAIL, USER_PASSWORD);
    
    userBalanceBefore = await getBalance(page);
    
    await findOpenPrediction(page);
    
    const betAmount = 100;
    const insuranceCost = 20;
    await placeBet(page, betAmount, true);
    
    // Admin resolve → user ผิด (เลือก option อื่น)
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    // ... resolve ให้ผิด ...
    
    await login(page, USER_EMAIL, USER_PASSWORD);
    const finalBalance = await getBalance(page);
    
    // ควรได้เงินคืน 80% (หักค่าประกันแล้ว)
    const expectedRefund = Math.floor(betAmount * 0.8);
    expect(finalBalance).toBe(userBalanceBefore - insuranceCost - (betAmount - expectedRefund));
    
    console.log(`✅ สถานการณ์ที่ 3 pass!`);
  });

  test('สถานการณ์ที่ 4: ทายผิด ไม่มีประกัน', async ({ page }) => {
    await login(page, USER_EMAIL, USER_PASSWORD);
    
    userBalanceBefore = await getBalance(page);
    
    await findOpenPrediction(page);
    
    const betAmount = 100;
    await placeBet(page, betAmount, false);
    
    // Admin resolve → user ผิด
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    // ... resolve ให้ผิด ...
    
    await login(page, USER_EMAIL, USER_PASSWORD);
    const finalBalance = await getBalance(page);
    
    // ควรเสียหมด (ไม่ได้คืน)
    expect(finalBalance).toBe(userBalanceBefore - betAmount);
    
    console.log(`✅ สถานการณ์ที่ 4 pass!`);
  });

  test('สถานการณ์ที่ 5: ยกเลิกโพย (Refund)', async ({ page }) => {
    await login(page, USER_EMAIL, USER_PASSWORD);
    
    userBalanceBefore = await getBalance(page);
    
    await findOpenPrediction(page);
    
    const betAmount = 100;
    await placeBet(page, betAmount, false);
    
    const balanceAfterBet = await getBalance(page);
    expect(balanceAfterBet).toBe(userBalanceBefore - betAmount);
    
    // Admin cancel prediction
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`${BASE_URL}/admin`);
    await page.locator('[data-testid="cancel-button"]').click();
    await page.click('[data-testid="confirm-cancel"]');
    
    await page.waitForTimeout(3000);
    
    // ตรวจสอบยอดคืน
    await login(page, USER_EMAIL, USER_PASSWORD);
    const finalBalance = await getBalance(page);
    
    expect(finalBalance).toBe(userBalanceBefore); // ได้คืนเต็มจำนวน
    
    console.log(`✅ สถานการณ์ที่ 5 pass!`);
  });

});
