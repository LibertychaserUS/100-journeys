const { test, expect } = require('@playwright/test');
const { freshPage } = require('./helpers');

test.describe('Language', () => {
  test.beforeEach(async ({ page }) => {
    await freshPage(page);
  });

  // E2E-I18N-001: the switch translates UI and journey content, and is remembered
  test('switching to English translates UI and content', async ({ page }) => {
    await page.goto('/#/explore');
    await expect(page.locator('h1')).toHaveText('探索旅程');
    await page.locator('#nav-lang').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('h1')).toHaveText('Explore journeys');
    await expect(page.locator('.nav__links a[href="#/explore"]')).toHaveText('Explore');
    await expect(page.locator('.journey-card[data-slug="bolivia-salt-flat-trek"] .journey-card__title')).toHaveText('Walking the Mirror of Uyuni');
    await expect(page.locator('#explore-results')).toHaveText('12 journeys');

    await page.reload();
    await expect(page.locator('h1')).toHaveText('Explore journeys');

    await page.locator('#nav-lang').click();
    await expect(page.locator('h1')).toHaveText('探索旅程');
  });

  // E2E-I18N-002: English browsers get English by default; search works on English copy
  test('english browser locale defaults to English', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' });
    const page = await context.newPage();
    await page.goto('/#/explore?q=aurora');
    await expect(page.locator('.journey-card[data-slug]')).toHaveCount(1);
    await expect(page.locator('.journey-card__title')).toHaveText('Chasing the Aurora in Tromsø');
    await page.goto('/#/journey/peru-machu-picchu-inca-trail');
    await expect(page.locator('.detail-hero__title')).toHaveText('The Inca Trail to Machu Picchu');
    await expect(page.locator('.detail-hero__badge')).toHaveText('Ancient cultures');
    await context.close();
  });
});
