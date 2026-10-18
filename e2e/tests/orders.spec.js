const { test, expect } = require('@playwright/test');
const { freshPage, logout, registerAndLogin, recharge } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await freshPage(page);
  // Native dialogs are gone; any confirm()/alert() is a regression.
  page.on('dialog', (dialog) => { throw new Error(`Unexpected native dialog: ${dialog.message()}`); });
});

test.describe('Order & Payment Flow', () => {
  // E2E-ORDER-001: recharge tiers come from the API and show their bonus
  test('recharge page lists tiers with bonuses', async ({ page }) => {
    await registerAndLogin(page, { prefix: 'ordertest' });
    await page.goto('/#/recharge');
    await expect(page.locator('.recharge-title')).toContainText('充值');
    await expect(page.locator('.recharge-tier[data-amount]')).toHaveCount(6); // 5 tiers + custom
    await expect(page.locator('.recharge-tier[data-amount="10000"]')).toContainText('送 800');
  });

  // E2E-ORDER-002: a tier recharge credits amount + bonus
  test('recharge credits the tier bonus', async ({ page }) => {
    await registerAndLogin(page, { prefix: 'ordertest' });
    await recharge(page, 10000);
    await expect(page.locator('#nav-wallet b')).toHaveText('10,800');
    await expect(page.locator('#toast-region')).toContainText('已到账 10,800 币');
  });

  // E2E-ORDER-003: buy from the detail page with enough balance
  test('create and pay an order from journey detail', async ({ page }) => {
    await registerAndLogin(page, { prefix: 'ordertest' });
    await recharge(page, 20000);
    await page.goto('/#/journey/japan-onsen-temple-meditation');
    await page.locator('#detail-cta-buy').click();
    const sheet = page.getByRole('dialog', { name: '确认订单' });
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.lines')).toContainText('积分折扣'); // 5,000 register points → 2% off
    await sheet.locator('#pay-confirm').click();
    await expect(sheet.locator('#pay-success')).toBeVisible();
    await sheet.getByRole('link', { name: '查看我的订单' }).click();
    await expect(page).toHaveURL(/#\/profile\?tab=orders/);
    await expect(page.locator('.profile-order-status--paid')).toBeVisible();

    await page.locator('#tab-txns').click();
    await expect(page.locator('.profile-txn-type--purchase')).toBeVisible();
    await expect(page.locator('.profile-txn-type--bonus')).toBeVisible();
  });

  // E2E-ORDER-004: not enough coins → top up the shortfall → return and pay
  test('insufficient balance routes through recharge and back', async ({ page }) => {
    await registerAndLogin(page, { prefix: 'shortfall' });
    await page.goto('/#/journey/greenland-dog-sled-solo');
    await page.locator('#detail-cta-buy').click();
    const sheet = page.getByRole('dialog', { name: '确认订单' });
    await expect(sheet.getByRole('alert')).toContainText('余额不足');
    await sheet.locator('#pay-recharge').click();

    await expect(page).toHaveURL(/#\/recharge\?need=\d+/);
    await expect(page.locator('#recharge-need')).toContainText('还差');
    await expect(page.locator('.recharge-tier[aria-checked="true"]')).toHaveAttribute('data-amount', '30000');
    await page.locator('#recharge-submit').click();

    await expect(page).toHaveURL(/#\/journey\/greenland-dog-sled-solo/);
    const resumed = page.getByRole('dialog', { name: '确认订单' });
    await resumed.locator('#pay-confirm').click();
    await expect(resumed.locator('#pay-success')).toBeVisible();
  });

  // E2E-ORDER-005: a pending order can be paid later from My trips
  test('pending order can be paid from the profile', async ({ page }) => {
    await registerAndLogin(page, { prefix: 'paylater' });
    await recharge(page, 20000);
    await page.goto('/#/journey/japan-onsen-temple-meditation');
    await page.locator('#detail-cta-buy').click();
    await page.getByRole('dialog').getByRole('button', { name: '稍后支付' }).click();
    await page.goto('/#/profile');
    const pay = page.locator('[data-pay]').first();
    await pay.click();
    await page.locator('#pay-confirm').click();
    await expect(page.locator('#pay-success')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.profile-order-status--paid')).toBeVisible();
  });

  // E2E-ORDER-006: guests are sent to log in and come back to the journey
  test('guest checkout asks to log in', async ({ page }) => {
    await page.goto('/#/journey/japan-onsen-temple-meditation');
    await page.locator('#detail-cta-buy').click();
    await page.locator('#toast-region a').click();
    await expect(page).toHaveURL(/#\/login\?next=%2Fjourney%2Fjapan-onsen-temple-meditation/);
  });
});

test.describe('Mass Registration Stress Test', () => {
  test('register 10 users sequentially', async ({ page }) => {
    for (let i = 0; i < 10; i++) {
      await registerAndLogin(page, { prefix: `mass${i}` });
      await logout(page);
    }
  });
});
