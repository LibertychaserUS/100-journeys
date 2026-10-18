const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { freshPage, registerAndLogin } = require('./helpers');

// Pages scanned in both themes. Hero imagery is excluded only from contrast checks over photos.
const PAGES = [
  ['home', '/#/', '.home-hero__title'],
  ['explore', '/#/explore', '.journey-card[data-slug]'],
  ['detail', '/#/journey/bolivia-salt-flat-trek', '.detail-hero__title'],
  ['compose', '/#/compose', '#compose-tray .slip'],
  ['login', '/#/login', '#login-form'],
  ['register', '/#/register', '#register-form'],
  ['about', '/#/about', '.about-head'],
  ['404', '/#/nowhere', '.error-code'],
];

for (const theme of ['dark', 'light']) {
  test.describe(`Accessibility (${theme})`, () => {
    for (const [name, url, ready] of PAGES) {
      test(`${name} has no WCAG A/AA violations`, async ({ page }) => {
        await freshPage(page);
        await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
        await page.goto(url);
        await expect(page.locator(ready).first()).toBeVisible();
        await page.waitForLoadState('networkidle');
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .exclude('.home-hero__particles')
          .analyze();
        const summary = results.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`);
        expect(summary, summary.join('\n')).toEqual([]);
      });
    }
  });
}

// E2E-A11Y-COMPOSE-001: the compose game mid-play (placed and blank lines, stamp, kept list) and the share view, both themes
for (const theme of ['dark', 'light']) {
  test(`compose with a kept ticket and its share view have no WCAG A/AA violations (${theme})`, async ({ page, context }) => {
    await freshPage(page);
    await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await registerAndLogin(page, { prefix: `axecompose${theme}`, next: '/compose' });
    for (const id of ['place-back-alley', 'hour-blue-hour', 'ritual-postcard']) await page.locator(`#slip-${id}`).click();
    await page.locator('#compose-share').click();
    await expect(page.locator('#compose-mine .kept')).toHaveCount(1);
    await expect(page.locator('#compose-ticket .cticket__stamp')).toBeVisible();
    await page.waitForLoadState('networkidle');
    const scan = async () => {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      return results.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`);
    };
    let summary = await scan();
    expect(summary, summary.join('\n')).toEqual([]);

    await page.goto(await page.evaluate(() => navigator.clipboard.readText()));
    await expect(page.locator('#shared-ticket-title')).toBeVisible();
    await page.waitForLoadState('networkidle');
    summary = await scan();
    expect(summary, summary.join('\n')).toEqual([]);
  });
}

// E2E-A11Y-AUTH-001: signed-in chrome (wallet, account menu) and the profile page
test('signed-in profile has no WCAG A/AA violations', async ({ page }) => {
  await freshPage(page);
  await registerAndLogin(page, { prefix: 'axe' });
  await page.goto('/#/profile');
  await expect(page.locator('.profile-name')).not.toHaveText('加载中…');
  await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`);
  expect(summary, summary.join('\n')).toEqual([]);
});

test.describe('Theme', () => {
  test('theme toggle switches and persists', async ({ page }) => {
    await freshPage(page);
    await page.addInitScript(() => { if (!localStorage.getItem('theme')) localStorage.setItem('theme', 'dark'); });
    await page.goto('/#/explore');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.locator('#nav-theme').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(243, 243, 241)');
  });

  // E2E-A11Y-THEME-001: switching theme at runtime keeps every page readable (not only on first load)
  for (const [name, url, ready] of [['detail', '/#/journey/iceland-lava-tunnel-cycling', '.chapter h2'], ['explore', '/#/explore', '.journey-card[data-slug]']]) {
    test(`${name} stays AA after toggling dark -> light -> dark`, async ({ page }) => {
      await freshPage(page);
      await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
      await page.goto(url);
      await expect(page.locator(ready).first()).toBeVisible();
      for (const expected of ['light', 'dark']) {
        await page.locator('#nav-theme').click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', expected);
        await expect(page.locator('html')).not.toHaveClass(/theme-switching/); // transition finished
        await expect(page.locator('#nav-theme')).toBeFocused(); // focus survives the nav re-render
        const results = await new AxeBuilder({ page }).withTags(['wcag2aa']).withRules(['color-contrast']).analyze();
        expect(results.violations.map((v) => v.id), expected).toEqual([]);
      }
    });
  }

  test('keyboard users can skip to content', async ({ page }) => {
    await freshPage(page);
    await page.goto('/#/explore');
    await page.keyboard.press('Tab');
    await expect(page.locator('#skip-link')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
  });
});
