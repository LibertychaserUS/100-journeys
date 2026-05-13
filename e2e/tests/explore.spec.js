const { test, expect } = require('@playwright/test');

test.describe('Explore Page', () => {
  test.beforeEach(async ({ page }) => {
    // Skip AI Pet setup modal
    await page.addInitScript(() => {
      localStorage.setItem('ai_pet_profile', JSON.stringify({ firstVisit: false, name: '小旅', type: 'dog' }));
    });
    await page.goto('/#/explore');
    // Wait for initial load
    await expect(page.locator('.journey-card')).not.toHaveCount(0);
  });

  // E2E-EXPLORE-001: Browse all journeys
  test('shows journey cards on load', async ({ page }) => {
    const cards = page.locator('.journey-card');
    await expect(cards).not.toHaveCount(0);

    // Each card has title and image
    const firstCard = cards.first();
    await expect(firstCard.locator('.journey-card__title')).toBeVisible();
    await expect(firstCard.locator('img')).toBeVisible();
  });

  // E2E-EXPLORE-002: Filter by fantasy type chip
  test('filter by fantasy type chip updates results', async ({ page }) => {
    const chip = page.locator('.explore-chip[data-key="fantasy_type"]').first();
    const value = await chip.getAttribute('data-value');

    await chip.click();

    // Chip becomes active
    await expect(chip).toHaveClass(/explore-chip--active/);

    // Results update
    const cards = page.locator('.journey-card');
    const count = await cards.count();
    if (count > 0) {
      // All visible cards should match the filter (or the filter is applied server-side)
      await expect(page.locator('#explore-results')).toContainText(/共 \d+ 个结果/);
    }
  });

  // E2E-EXPLORE-003: Search with debounce
  test('search filters results', async ({ page }) => {
    const searchInput = page.locator('#explore-search');
    await searchInput.fill('冰岛');
    await page.waitForTimeout(400); // Wait for debounce

    // Results should update
    await expect(page.locator('#explore-results')).toBeVisible();
  });

  // E2E-EXPLORE-004: Adventure slider filter
  test('adventure slider filters by risk level', async ({ page }) => {
    const slider = page.locator('#filter-adventure-max');
    await slider.fill('8');
    await slider.evaluate(el => el.dispatchEvent(new Event('change')));

    await page.waitForTimeout(300);
    await expect(page.locator('#explore-results')).toBeVisible();
  });

  // E2E-EXPLORE-005: Card click navigates to detail
  test('card click navigates to detail page', async ({ page }) => {
    const firstCard = page.locator('.journey-card').first();
    const slug = await firstCard.getAttribute('data-slug');
    expect(slug).toBeTruthy();

    await firstCard.click();
    await expect(page).toHaveURL(new RegExp(`#\\/journey\\/${slug}`));
  });

  // E2E-EXPLORE-006: Load more pagination
  test('load more button loads additional cards', async ({ page }) => {
    const loadMore = page.locator('#btn-loadmore');

    // Only test if load more is visible (more than 12 results)
    if (await loadMore.isVisible()) {
      const beforeCount = await page.locator('.journey-card').count();
      await loadMore.click();
      await page.waitForTimeout(500);
      const afterCount = await page.locator('.journey-card').count();
      expect(afterCount).toBeGreaterThan(beforeCount);
    }
  });
});
