const { test, expect } = require('@playwright/test');
const { freshPage } = require('./helpers');

test.describe('Language', () => {
  test.beforeEach(async ({ page }) => {
    await freshPage(page);
  });

  // E2E-I18N-001: the switch translates UI and journey content, and is remembered
  test('switching to English translates UI and content', async ({ page }) => {
    const { data: en } = await (await page.request.get('/api/journeys/bolivia-salt-flat-trek?lang=en')).json();
    const { total } = await (await page.request.get('/api/journeys?lang=en')).json();
    await page.goto('/#/explore');
    await expect(page.locator('h1')).toHaveText('探索旅程');
    await page.locator('#nav-lang').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('h1')).toHaveText('Explore journeys');
    await expect(page.locator('.nav__links a[href="#/explore"]')).toHaveText('Explore');
    await expect(page.locator('.journey-card[data-slug="bolivia-salt-flat-trek"] .journey-card__title')).toHaveText(en.title);
    await expect(page.locator('#explore-results')).toHaveText(`${total} journeys`);

    await page.reload();
    await expect(page.locator('h1')).toHaveText('Explore journeys');

    await page.locator('#nav-lang').click();
    await expect(page.locator('h1')).toHaveText('探索旅程');
  });

  // E2E-I18N-002: English browsers get English by default; search works on English copy
  test('english browser locale defaults to English', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' });
    const page = await context.newPage();
    const get = async (url) => (await (await page.request.get(url)).json());
    const { data: aurora } = await get('/api/journeys/norway-aurora-hunt?lang=en');
    const { data: inca } = await get('/api/journeys/peru-machu-picchu-inca-trail?lang=en');
    await page.goto('/#/explore?q=aurora');
    await expect(page.locator('.journey-card[data-slug="norway-aurora-hunt"] .journey-card__title')).toHaveText(aurora.title);
    await page.goto('/#/journey/peru-machu-picchu-inca-trail');
    await expect(page.locator('.detail-hero__title')).toHaveText(inca.title);
    await expect(page.locator('.detail-hero__badge')).toHaveText('Ancient cultures');
    await context.close();
  });
});
