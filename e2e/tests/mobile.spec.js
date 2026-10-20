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

  // E2E-MOBILE-007: opened at the top of the opening (the bar still clear over the picture), the
  // drawer's sign-up button keeps its own fill and reads, in both themes
  for (const theme of ['light', 'dark']) {
    test(`drawer sign-up reads over the opening (${theme})`, async ({ page }) => {
      await page.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch (e) {} }, theme);
      await page.goto('/#/');
      await expect(page.locator('body')).not.toHaveAttribute('data-scrolled', '');
      await page.locator('#nav-menu').click();
      const look = await page.locator('#drawer-register').evaluate((el) => {
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundColor, fg: cs.color, drawer: getComputedStyle(document.getElementById('nav-drawer')).backgroundColor };
      });
      expect(look.bg).not.toBe('rgba(0, 0, 0, 0)');
      expect(look.bg).not.toBe(look.drawer);
      expect(look.fg).not.toBe(look.bg);
    });
  }

  // E2E-MOBILE-002: no page scrolls sideways on a phone
  test('pages fit the phone width', async ({ page }) => {
    for (const url of ['/#/', '/#/explore', '/#/journey/patagonia-torres-del-paine-trek', '/#/journey/bolivia-salt-flat-trek', '/#/compose', '/#/login', '/#/register', '/#/about', '/#/find', '/#/guide', '/#/space']) {
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
    await expect(page.locator('.space__head h1')).toContainText('篝火边唱歌的人');
  });

  // E2E-MOBILE-006: a tapped door shows in the sheet; another door takes its place there; only a
  // second tap on the same door goes through it
  test('door taps preview in the sheet before walking through', async ({ page }) => {
    await page.goto('/#/');
    const doors = page.locator('#atlas-grid .door.is-found a');
    await page.locator('#atlas-grid').scrollIntoViewIfNeeded();
    const a = doors.nth(8);
    const b = doors.nth(2);
    await a.tap();
    await expect(page.locator('#atlas-panel')).toHaveClass(/is-peek/);
    await expect(page).toHaveURL(/#\/$/);
    const titleA = await page.locator('#door-body .door-card__title').textContent();
    await b.tap();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.locator('#door-body .door-card__title')).not.toHaveText(titleA);
    await expect(page.locator('#door-body .door-card__hook')).toBeVisible();
    const slugB = await b.getAttribute('data-slug'); // read before the tap takes the page away
    await b.tap();
    await expect(page).toHaveURL(new RegExp(`#/journey/${slugB}$`));
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

  // E2E-COMPOSE-008: on a phone the ticket sits on top, slips scroll sideways inside their pile, and a bar leads back to the ticket
  test('compose game on a phone', async ({ page }) => {
    await page.goto('/#/compose');
    const frame = page.locator('#compose-frame');
    const tray = page.locator('#compose-tray');
    await expect(tray.locator('.slip').first()).toBeVisible();
    expect((await frame.boundingBox()).y).toBeLessThan((await tray.boundingBox()).y);

    const places = tray.locator('[data-group="place"] .slips');
    const row = await places.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth, wrap: getComputedStyle(el).flexWrap }));
    expect(row.wrap).toBe('nowrap');
    expect(row.scroll).toBeGreaterThan(row.client);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    const keepsake = page.locator('#slip-keepsake-salt');
    await keepsake.scrollIntoViewIfNeeded();
    await expect(frame).not.toBeInViewport();
    const peek = page.locator('#compose-peek');
    await expect(peek).toBeVisible();
    await keepsake.tap();
    await expect(keepsake).toHaveAttribute('aria-pressed', 'true');
    await expect(peek).toContainText('回来时，你带着一粒盐。');
    await expect(peek).toContainText('1/6');
    await page.locator('#compose-peek-btn').tap();
    await expect(frame).toBeInViewport();
    await expect(peek).toBeHidden();
    await expect(page.locator('#compose-ticket .cline[data-group="keepsake"]')).toContainText('一粒盐');
  });
});
