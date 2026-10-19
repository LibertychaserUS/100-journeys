const { test, expect } = require('@playwright/test');
const { freshPage } = require('./helpers');

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await freshPage(page);
    await page.goto('/#/');
  });

  // E2E-HOME-001: hero and five featured journeys from the API
  test('landing page shows hero and featured journeys', async ({ page }) => {
    await expect(page.locator('.home-hero__title')).toHaveText('桃源百旅');
    const { total } = await (await page.request.get('/api/journeys')).json();
    await expect(page.locator('#featured-grid .feature-card[data-slug]')).toHaveCount(5);
    await expect(page.locator('#featured-all')).toContainText(String(total));
  });

  // E2E-HOME-002: mood shortcuts open Explore with that filter applied
  test('mood chip opens explore with the matching filter', async ({ page }) => {
    await page.locator('.home-hero__chip[data-filter-value="night"]').click();
    await expect(page).toHaveURL(/#\/explore\?fantasy_type=night/);
    await expect(page.locator('#filter-fantasy [data-value="night"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.journey-card[data-slug]')).not.toHaveCount(0);
  });

  // E2E-HOME-003: hero search submits the query to Explore
  test('hero search carries the query to explore', async ({ page }) => {
    const { total } = await (await page.request.get(`/api/journeys?q=${encodeURIComponent('冰岛')}`)).json();
    expect(total).toBeGreaterThan(0);
    await page.locator('#hero-q').fill('冰岛');
    await page.locator('.home-hero__search button[type="submit"]').click();
    await expect(page).toHaveURL(/#\/explore\?q=/);
    await expect(page.locator('#explore-search')).toHaveValue('冰岛');
    await expect(page.locator('.journey-card[data-slug]')).toHaveCount(Math.min(total, 12));
  });

  // E2E-HOME-004: featured card opens its detail page
  test('featured card click navigates to journey detail', async ({ page }) => {
    const card = page.locator('#featured-grid .feature-card[data-slug]').first();
    const slug = await card.getAttribute('data-slug');
    await card.click();
    await expect(page).toHaveURL(new RegExp(`#\\/journey\\/${slug}`));
    await expect(page.locator('.detail-hero__title')).toBeVisible();
  });

  // E2E-HOME-005: every featured journey shows its own cover
  test('featured journeys do not share cover images', async ({ page }) => {
    await expect(page.locator('#featured-grid .feature-card[data-slug]')).toHaveCount(5);
    const srcs = await page.locator('#featured-grid .feature-card img').evaluateAll((imgs) => imgs.map((i) => i.getAttribute('src')));
    expect(new Set(srcs).size).toBe(srcs.length);
  });
});

// E2E-HOME-006: the hundred doors: one cell per number, found doors link to their journey, the
// card follows the pointer, realm filters dim the rest, and the opening adds three entrances.
test.describe('The hundred doors', () => {
  test.beforeEach(async ({ page }) => {
    await freshPage(page);
  });

  test('doors, card, filters and the opening', async ({ page }) => {
    const { data, total } = await (await page.request.get('/api/journeys?limit=100')).json();
    await page.goto('/#/');
    const grid = page.locator('#atlas-grid');
    await expect(grid.locator('.door')).toHaveCount(100);
    await expect(grid.locator('.door.is-found a')).toHaveCount(data.filter((j) => j.entrance).length);
    await expect(page.locator('#atlas-found')).toHaveText(String(total));
    // Pointing at a door shows it in the card
    const pick = data.find((j) => j.entrance && j.entrance.no === 15) || data[1];
    await grid.locator(`a[data-no="${pick.entrance.no}"]`).hover();
    await expect(page.locator('#atlas-panel .door-card__title')).toHaveText(pick.title);
    await expect(page.locator('#atlas-panel a.door-card')).toHaveAttribute('href', `#/journey/${pick.slug}`);
    // A realm filter dims every other door
    const realm = pick.entrance.realm;
    await page.locator(`#atlas-filters [data-filter="${realm}"]`).click();
    await expect(page.locator(`#atlas-filters [data-filter="${realm}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(grid.locator('.door.is-found:not(.is-dim)')).toHaveCount(data.filter((j) => j.entrance && j.entrance.realm === realm).length);
    // The opening: the brand scene plus three entrances, each numbered
    await expect(page.locator('.home-hero__dot')).toHaveCount(4);
    await expect(page.locator('#hero-now time')).toHaveText(/^\d{2}:\d{2}$/);
  });
});
