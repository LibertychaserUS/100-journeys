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
    await expect(page.locator('#featured-grid .feature-card[data-slug]')).toHaveCount(5);
    await expect(page.locator('#featured-all')).toContainText('12');
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
    await page.locator('#hero-q').fill('冰岛');
    await page.locator('.home-hero__search button[type="submit"]').click();
    await expect(page).toHaveURL(/#\/explore\?q=/);
    await expect(page.locator('#explore-search')).toHaveValue('冰岛');
    await expect(page.locator('.journey-card[data-slug]')).toHaveCount(1);
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
