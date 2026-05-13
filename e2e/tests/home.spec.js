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
    await expect(page.locator('.home-hero__title')).toContainText('100种不可思议的旅行');

    // Featured section with cards
    await expect(page.locator('.home-featured__grid .home-card')).toHaveCount(5);
  });

  // E2E-HOME-002: MBTI chips are rendered and clickable
  test('MBTI teaser shows 16 type chips', async ({ page }) => {
    const chips = page.locator('.home-mbti__chip');
    await expect(chips).toHaveCount(16);

    // Click first chip navigates to explore with filter
    await chips.first().click();
    await expect(page).toHaveURL(/#\/explore/);
  });

  // E2E-HOME-003: Hero CTA navigates to explore
  test('hero CTA button navigates to explore', async ({ page }) => {
    await page.locator('[data-action="explore"]').click();
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
    const mbtiTag = page.locator('.home-card__tag--mbti').first();
    await mbtiTag.click();
    await expect(page).toHaveURL(/#\/explore\?mbti=/);
  });
});
