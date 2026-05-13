const { test, expect } = require('@playwright/test');

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    // Skip AI Pet setup modal
    await page.addInitScript(() => {
      localStorage.setItem('ai_pet_profile', JSON.stringify({ firstVisit: false, name: '小旅', type: 'dog' }));
    });
    await page.goto('/#/');
  });

  // E2E-HOME-001: Landing page loads with hero and featured cards
  test('landing page shows hero and featured journeys', async ({ page }) => {
    await expect(page.locator('.home-hero__title')).toBeVisible();
    await expect(page.locator('.home-hero__title')).toContainText('桃源百旅');

    // Featured section with cards
    await expect(page.locator('.home-featured__grid .home-card')).toHaveCount(6);
  });

  // E2E-HOME-002: MBTI is intentionally not exposed as a full homepage grid
  test('MBTI grid stays hidden from public home', async ({ page }) => {
    await expect(page.locator('.home-mbti__chip')).toHaveCount(0);
    await page.locator('.home-hero__chip[data-filter-key="mbti"]').click();
    await expect(page).toHaveURL(/#\/explore\?mbti=INFP/);
  });

  // E2E-HOME-003: Hero CTA navigates to explore
  test('hero CTA button navigates to explore', async ({ page }) => {
    await page.locator('.home-hero__search button').click();
    await expect(page).toHaveURL(/#\/explore/);
  });

  // E2E-HOME-004: Featured cards navigate to detail
  test('featured card click navigates to journey detail', async ({ page }) => {
    const firstCard = page.locator('.home-card').first();
    await expect(firstCard).toBeVisible();

    // Get the slug from data attribute
    const slug = await firstCard.getAttribute('data-slug');
    expect(slug).toBeTruthy();

    await firstCard.click();
    await expect(page).toHaveURL(new RegExp(`#\\/journey\\/${slug}`));
  });

  // E2E-HOME-005: Card MBTI tag click navigates to explore
  test('card MBTI tag click navigates to explore with filter', async ({ page }) => {
    const card = page.locator('.home-card').first();
    await expect(card.locator('.home-card__tags span').nth(1)).toBeVisible();
    await card.click();
    await expect(page).toHaveURL(/#\/journey\//);
  });
});
