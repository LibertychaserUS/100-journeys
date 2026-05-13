const { test, expect } = require('@playwright/test');
const { logout, registerAndLogin } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ai_pet_profile', JSON.stringify({ firstVisit: false, name: '小旅', type: 'dog' }));
  });
  page.on('dialog', dialog => dialog.accept());
});

test.describe('Order & Payment Flow', () => {
  test('recharge page loads with tiers', async ({ page }) => {
    await registerAndLogin(page, { prefix: 'ordertest' });
    await page.evaluate(() => Router.navigate('#/recharge'));
    await expect(page.locator('.recharge-title')).toContainText('充值');
    await expect(page.locator('.recharge-tier')).toHaveCount(7);
  });

  test('recharge increases balance', async ({ page }) => {
    await registerAndLogin(page, { prefix: 'ordertest' });
    await page.evaluate(() => Router.navigate('#/recharge'));
    await page.locator('.recharge-tier').first().click();
    await page.waitForTimeout(300);
    await page.locator('#recharge-submit').click();
    await expect(page.locator('#nav-user')).toContainText('币', { timeout: 5000 });
  });

  test('create order from journey detail', async ({ page }) => {
    await registerAndLogin(page, { prefix: 'ordertest' });
    // Recharge first
    await page.evaluate(() => Router.navigate('#/recharge'));
    await page.locator('#recharge-custom-input').fill('50000');
    await page.waitForTimeout(300);
    await page.locator('#recharge-submit').click();
    await expect(page.locator('#nav-user')).toContainText('币', { timeout: 5000 });

    // Go to journey and order
    await page.goto('/#/explore');
    await expect(page.locator('.journey-card')).not.toHaveCount(0);
    const slug = await page.locator('.journey-card').first().getAttribute('data-slug');
    await page.goto(`/#/journey/${slug}`);
    await expect(page.locator('#detail-cta-buy')).toBeVisible();
    await page.locator('#detail-cta-buy').click();
    await expect(page.locator('#nav-user')).toContainText('币');

    await page.evaluate(() => Router.navigate('#/profile'));
    await expect(page.locator('.profile-order-status--paid')).toBeVisible();
    await expect(page.locator('.profile-txn-type--purchase')).toBeVisible();
  });

  test('profile shows orders and transactions', async ({ page }) => {
    await registerAndLogin(page, { prefix: 'ordertest' });
    await page.evaluate(() => Router.navigate('#/recharge'));
    await page.locator('.recharge-tier').nth(2).click();
    await page.waitForTimeout(300);
    await page.locator('#recharge-submit').click();
    await expect(page.locator('#nav-user')).toContainText('币', { timeout: 5000 });

    await page.evaluate(() => Router.navigate('#/profile'));
    await expect(page.locator('#profile-balance')).toBeVisible();
    await expect(page.locator('.profile-txn-row')).toBeVisible();
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
