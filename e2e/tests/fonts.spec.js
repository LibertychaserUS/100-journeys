const { test, expect } = require('@playwright/test');
const { freshPage } = require('./helpers');

// Font files that fail to load, and the story serif faces the page ended up using.
async function watchFonts(page) {
  const failed = [];
  page.on('response', (res) => { if (res.url().endsWith('.woff2') && res.status() >= 400) failed.push(res.url()); });
  page.on('requestfailed', (req) => { if (req.url().endsWith('.woff2')) failed.push(req.url()); });
  return failed;
}

test.describe('Story fonts', () => {
  test.beforeEach(async ({ page }) => {
    await freshPage(page);
  });

  // E2E-FONT-001: Chinese pages set their story text in the self-hosted serif, without a failed file
  test('chinese story text uses the self-hosted serif', async ({ page }) => {
    const failed = await watchFonts(page);
    await page.goto('/#/');
    await expect(page.locator('#hero-title')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check('700 64px "Story Serif"', '桃源百旅'))).toBe(true);
    const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.family === 'Story Serif' && f.status === 'loaded').length);
    expect(loaded).toBeGreaterThan(0);
    await page.goto('/#/journey/antarctica-port-lockroy');
    await expect(page.locator('.detail-hero__title')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check('700 64px "Story Serif"', '企鹅邮局'))).toBe(true);
    expect(failed).toEqual([]);
  });

  // E2E-FONT-002: English pages use the Latin serif in both weights, and never fetch the Chinese slices
  test('english story text uses the latin serif', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' });
    const page = await context.newPage();
    const failed = await watchFonts(page);
    const fetched = [];
    page.on('request', (req) => { if (req.url().endsWith('.woff2')) fetched.push(req.url().split('/').pop()); });
    await page.goto('/#/');
    await expect(page.locator('#hero-title')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.goto('/#/journey/antarctica-port-lockroy');
    await expect(page.locator('.detail-hero__title')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const faces = await page.evaluate(() => [...document.fonts].filter((f) => f.family === 'Story Serif Latin' && f.status === 'loaded').map((f) => f.weight).sort());
    expect(faces).toEqual(['400', '700']);
    expect(fetched.filter((f) => !f.startsWith('story-serif-latin-'))).toEqual([]);
    expect(failed).toEqual([]);
    await context.close();
  });
});
