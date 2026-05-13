const { test, expect } = require('@playwright/test');

test.describe('Detail Page', () => {
  test.beforeEach(async ({ page }) => {
    // Skip AI Pet setup modal
    await page.addInitScript(() => {
      localStorage.setItem('ai_pet_profile', JSON.stringify({ firstVisit: false, name: '小旅', type: 'dog' }));
    });
  });

  test('detail page renders journey content', async ({ page }) => {
    // First navigate to explore to get a valid slug
    await page.goto('/#/explore');
    await expect(page.locator('.journey-card')).not.toHaveCount(0);

    const firstCard = page.locator('.journey-card').first();
    const slug = await firstCard.getAttribute('data-slug');

    // Navigate to detail
    await page.goto(`/#/journey/${slug}`);

    // Hero visible
    await expect(page.locator('.detail-hero__title')).toBeVisible();
    await expect(page.locator('.detail-hero__badge')).toBeVisible();

    // Story section
    await expect(page.locator('.detail-story')).toBeVisible();

    // Clue section (may need scroll)
    const clueCard = page.locator('#clue-card');
    await clueCard.scrollIntoViewIfNeeded();
    await expect(clueCard).toBeVisible();

    // CTA buttons
    await expect(page.locator('#detail-cta-book')).toBeVisible();
    await expect(page.locator('#detail-cta-save')).toBeVisible();
  });

  // E2E-DETAIL-002: Back button works
  test('back button returns to previous page', async ({ page }) => {
    await page.goto('/#/explore');
    await expect(page.locator('.journey-card')).not.toHaveCount(0);

    const firstCard = page.locator('.journey-card').first();
    const slug = await firstCard.getAttribute('data-slug');

    await page.goto(`/#/journey/${slug}`);
    await expect(page.locator('.detail-hero__title')).toBeVisible();

    await page.locator('.detail-hero__btn--back').click();
    await expect(page).toHaveURL(/#\/explore/);
  });

  // E2E-DETAIL-003: Share button copies URL
  test('share button provides copy feedback', async ({ page }) => {
    await page.goto('/#/explore');
    const slug = await page.locator('.journey-card').first().getAttribute('data-slug');
    await page.goto(`/#/journey/${slug}`);

    const shareBtn = page.locator('.detail-hero__btn--share');
    await shareBtn.click();

    // Visual feedback (scale transform)
    await expect(shareBtn).toHaveCSS('transform', /matrix/);
  });

  // E2E-DETAIL-004: 404 page for non-existent journey
  test('non-existent journey shows 404', async ({ page }) => {
    await page.goto('/#/journey/nonexistent-slug-xyz-123');
    await expect(page.locator('.detail-notfound')).toBeVisible();
    await expect(page.locator('.detail-notfound__title')).toContainText('旅程未找到');
  });

  // E2E-DETAIL-005: Save button toggle
  test('save button toggles state', async ({ page }) => {
    await page.goto('/#/explore');
    const slug = await page.locator('.journey-card').first().getAttribute('data-slug');
    await page.goto(`/#/journey/${slug}`);

    const saveBtn = page.locator('#detail-cta-save');
    await saveBtn.click();
    await expect(saveBtn).toHaveClass(/is-saved/);

    await saveBtn.click();
    await expect(saveBtn).not.toHaveClass(/is-saved/);
  });
});
