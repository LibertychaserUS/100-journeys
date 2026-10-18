const { test, expect } = require('@playwright/test');
const { freshPage } = require('./helpers');

const cards = (page) => page.locator('#explore-grid .journey-card[data-slug]');
const skeletons = (page) => page.locator('#explore-grid .journey-card--skeleton');

async function apiCount(page, params) {
  return page.evaluate(async (p) => {
    const res = await fetch(`/api/journeys?${new URLSearchParams({ ...p, limit: 50 })}`);
    return (await res.json()).total;
  }, params);
}

test.describe('Explore Page', () => {
  test.beforeEach(async ({ page }) => {
    await freshPage(page);
    await page.goto('/#/explore');
    await expect(cards(page)).not.toHaveCount(0);
  });

  // E2E-EXPLORE-001: browse all journeys
  test('shows journey cards on load', async ({ page }) => {
    await expect(cards(page)).toHaveCount(12);
    await expect(page.locator('#explore-results')).toHaveText('共 12 段旅程');
    await expect(cards(page).first().locator('.journey-card__title')).toBeVisible();
    await expect(cards(page).first().locator('img')).toBeVisible();
  });

  // E2E-EXPLORE-002: a fantasy chip filters the results (regression: results used to stay on skeletons)
  test('fantasy type chip filters results', async ({ page }) => {
    const expected = await apiCount(page, { fantasy_type: 'night' });
    await page.locator('#filter-fantasy [data-value="night"]').click();
    await expect(page).toHaveURL(/fantasy_type=night/);
    await expect(page.locator('#filter-fantasy [data-value="night"]')).toHaveClass(/explore-chip--active/);
    await expect(skeletons(page)).toHaveCount(0);
    await expect(cards(page)).toHaveCount(expected);
    await expect(page.locator('#explore-results')).toHaveText(`共 ${expected} 段旅程`);
  });

  // E2E-EXPLORE-003: search box is reachable and keeps focus while typing (regression: hidden under the nav)
  test('search filters results while typing', async ({ page }) => {
    const search = page.locator('#explore-search');
    await expect(search).toBeInViewport();
    await search.click(); // fails if another element covers the input
    await page.keyboard.type('极光', { delay: 80 });
    await expect(cards(page)).toHaveCount(1);
    await expect(search).toBeFocused();
    await expect(page).toHaveURL(/q=%E6%9E%81%E5%85%89/);
  });

  // E2E-EXPLORE-004: MBTI and adventure filters live in the panel and show as removable pills
  test('panel filters combine and can be removed', async ({ page }) => {
    await page.locator('#explore-filter-btn').click();
    await page.locator('#filter-mbti [data-value="INFP"]').click();
    const infp = await apiCount(page, { mbti: 'INFP' });
    await expect(cards(page)).toHaveCount(infp);
    await expect(page.locator('#explore-filter-count')).toHaveText('1');

    await page.locator('#filter-adventure [data-value="easy"]').click();
    const both = await apiCount(page, { mbti: 'INFP', adventure_min: 1, adventure_max: 4 });
    await expect(page).toHaveURL(/adventure_max=4/);
    await expect(cards(page).or(page.locator('.explore-empty'))).toHaveCount(Math.max(both, 1));

    await page.locator('#explore-panel-done').click();
    await expect(page.locator('#explore-panel')).toBeHidden();
    await page.locator('#explore-active [data-remove="mbti"]').click();
    await page.locator('#explore-active [data-remove="adventure"]').click();
    await expect(cards(page)).toHaveCount(12);
    await expect(page.locator('#explore-active')).toBeHidden();
  });

  // E2E-EXPLORE-005: empty state offers a way out
  test('empty results offer to clear filters', async ({ page }) => {
    await page.locator('#explore-search').fill('zzzz-no-such-journey');
    await expect(page.locator('.explore-empty')).toBeVisible();
    await page.locator('.explore-empty [data-action="clear"]').click();
    await expect(cards(page)).toHaveCount(12);
    await expect(page.locator('#explore-search')).toHaveValue('');
  });

  // E2E-EXPLORE-006: card click opens the detail page
  test('card click navigates to detail page', async ({ page }) => {
    const slug = await cards(page).first().getAttribute('data-slug');
    await cards(page).first().click();
    await expect(page).toHaveURL(new RegExp(`#\\/journey\\/${slug}`));
  });

  // E2E-EXPLORE-007: filters don't leak into a later visit from the nav (regression)
  test('filters reset when re-entering from the nav', async ({ page }) => {
    await page.locator('#filter-fantasy [data-value="extreme"]').click();
    await expect(page).toHaveURL(/fantasy_type=extreme/);
    await page.goto('/#/');
    await page.locator('.nav__links a[href="#/explore"]').click();
    await expect(cards(page)).toHaveCount(12);
    await expect(page.locator('#filter-fantasy [data-value=""]')).toHaveAttribute('aria-pressed', 'true');
  });

  // E2E-EXPLORE-008: a shared filtered link restores the same view
  test('filtered URL restores filters on load', async ({ page }) => {
    await page.goto('/#/explore?mbti=INFJ&visual_style=dramatic');
    const expected = await apiCount(page, { mbti: 'INFJ', visual_style: 'dramatic' });
    await expect(page.locator('#explore-active [data-remove="mbti"]')).toBeVisible();
    await expect(cards(page).or(page.locator('.explore-empty'))).toHaveCount(Math.max(expected, 1));
  });
});
