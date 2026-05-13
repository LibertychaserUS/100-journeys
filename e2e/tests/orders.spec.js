const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ai_pet_profile', JSON.stringify({ firstVisit: false, name: '小旅', type: 'dog' }));
  });
  page.on('dialog', dialog => dialog.accept());
});

async function registerAndLogin(page) {
  const ts = Date.now();
  const email = `order${ts}@example.com`;
  await page.goto('/#/register');
  await page.locator('#reg-username').fill(`ordertest${ts}`);
  await page.locator('#reg-email').fill(email);
  await page.locator('#reg-password').fill('password123');
  await page.locator('#register-form').locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/#\/$/);
  return email;
}

test.describe('Order & Payment Flow', () => {
  test('recharge page loads with tiers', async ({ page }) => {
    await registerAndLogin(page);
    await page.evaluate(() => Router.navigate('#/recharge'));
    await expect(page.locator('.recharge-title')).toContainText('充值');
    await expect(page.locator('.recharge-tier')).toHaveCount(7);
  });

  test('recharge increases balance', async ({ page }) => {
    await registerAndLogin(page);
    await page.evaluate(() => Router.navigate('#/recharge'));
    await page.locator('.recharge-tier').first().click();
    await page.waitForTimeout(300);
    await page.locator('#recharge-submit').click();
    await expect(page.locator('#nav-user')).toContainText('币', { timeout: 5000 });
  });

  test('create order from journey detail', async ({ page }) => {
    await registerAndLogin(page);
    // Recharge first
    await page.evaluate(() => Router.navigate('#/recharge'));
    await page.locator('.recharge-tier').nth(6).click();
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
  });

  test('profile shows orders and transactions', async ({ page }) => {
    await registerAndLogin(page);
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
      const ts = Date.now() + i;
      await page.goto('/#/register');
      await page.locator('#reg-username').fill(`mass${ts}`);
      await page.locator('#reg-email').fill(`mass${ts}@example.com`);
      await page.locator('#reg-password').fill('password123');
      await page.locator('#register-form').locator('button[type="submit"]').click();
      await expect(page).toHaveURL(/#\/$/, { timeout: 5000 });
      await page.locator('#nav-logout').click();
    }
  });
});
