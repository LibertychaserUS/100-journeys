const { test, expect } = require('@playwright/test');
const { freshPage, registerAndLogin, recharge } = require('./helpers');

test.describe('Mobile', () => {
  test.beforeEach(async ({ page }) => {
    await freshPage(page);
  });

  // E2E-MOBILE-001: guests can reach log in / sign up from the phone nav (was hidden)
  test('menu exposes login and register', async ({ page }) => {
    await page.goto('/#/');
    await expect(page.locator('#nav-login')).toBeVisible();
    await page.locator('#nav-menu').click();
    await expect(page.locator('#drawer-register')).toBeVisible();
    await page.locator('#drawer-register').click();
    await expect(page).toHaveURL(/#\/register/);
    await expect(page.locator('#nav-drawer')).toHaveCount(0);
  });

  // E2E-MOBILE-002: no page scrolls sideways on a phone
  test('pages fit the phone width', async ({ page }) => {
    for (const url of ['/#/', '/#/explore', '/#/journey/patagonia-torres-del-paine-trek', '/#/journey/bolivia-salt-flat-trek', '/#/login', '/#/register', '/#/about', '/#/find', '/#/guide', '/#/space']) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, url).toBeLessThanOrEqual(0);
    }
  });

  // E2E-MOBILE-005: on a phone, two taps from home reach your space; the drawer links to it
  test('two taps from home into your space', async ({ page }) => {
    await page.goto('/#/');
    await page.locator('#invite-self').click();
    await page.locator('.type-card[data-code="ESFP"]').click();
    await expect(page).toHaveURL(/#\/space$/);
    await expect(page.locator('#space-picks .journey-card').first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.goto('/#/explore');
    await page.locator('#nav-menu').click();
    await page.locator('#nav-drawer a[href="#/space"]').click();
    await expect(page.locator('.space__head h1')).toContainText('ESFP');
  });

  // E2E-MOBILE-003: the filter panel opens as a sheet and applies filters
  test('explore filters open as a bottom sheet', async ({ page }) => {
    await page.goto('/#/explore');
    await page.locator('#explore-filter-btn').click();
    const panel = page.locator('#explore-panel');
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    const viewport = page.viewportSize();
    expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(viewport.height - 2);
    await panel.locator('[data-value="ENFP"]').click();
    await panel.locator('#explore-panel-done').click();
    await expect(page.locator('#explore-active [data-remove="mbti"]')).toBeVisible();
  });

  // E2E-MOBILE-004: the booking bar stays on screen and opens checkout
  test('booking bar opens checkout', async ({ page }) => {
    await registerAndLogin(page, { prefix: 'mobilebuy' });
    await recharge(page, 20000);
    await page.goto('/#/journey/japan-onsen-temple-meditation');
    const bar = page.locator('#detail-bookbar');
    await expect(bar).toBeInViewport();
    await expect(page.locator('#detail-cta-buy')).toBeHidden();
    await page.locator('#bookbar-buy').click();
    const sheet = page.getByRole('dialog', { name: '确认订单' });
    await sheet.locator('#pay-confirm').click();
    await expect(sheet.locator('#pay-success')).toBeVisible();
  });
});
