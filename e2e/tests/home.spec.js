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

  // E2E-HOME-002: "Step in" glides to the doors and focuses them; the hero's "open now" link
  // shows only the doors open right now (on each door's own clock).
  test('step in reaches the doors; open now filters them', async ({ page }) => {
    await page.locator('#hero-enter').click();
    await expect.poll(() => page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('atlas');
    await expect(page).toHaveURL(/#\/$/);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('#hero-now').click();
    await expect(page.locator('#atlas-filters [data-filter="now"]')).toHaveAttribute('aria-pressed', 'true');
    const open = await page.locator('#atlas-grid .door.is-found:not(.is-dim)').count();
    const lit = await page.locator('#atlas-grid .door.is-found[data-open="true"]').count();
    expect(open).toBe(lit);
  });

  // E2E-HOME-003: the doors' search submits the query to Explore
  test('door search carries the query to explore', async ({ page }) => {
    const { total } = await (await page.request.get(`/api/journeys?q=${encodeURIComponent('冰岛')}`)).json();
    expect(total).toBeGreaterThan(0);
    await page.locator('#atlas-q').fill('冰岛');
    await page.locator('.home-atlas__search button[type="submit"]').click();
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

  // E2E-HOME-005: every featured journey shows its own cover; no type codes or prices on them
  test('featured journeys do not share cover images', async ({ page }) => {
    await expect(page.locator('#featured-grid .feature-card[data-slug]')).toHaveCount(5);
    const srcs = await page.locator('#featured-grid .feature-card img').evaluateAll((imgs) => imgs.map((i) => i.getAttribute('src')));
    expect(new Set(srcs).size).toBe(srcs.length);
    const text = await page.locator('#featured-grid').innerText();
    expect(text).not.toMatch(/\b[EI][NS][FT][JP]\b/);
    expect(text).not.toMatch(/币/);
  });

  // E2E-HOME-007: the skip link moves focus to the content without leaving the page
  test('skip link focuses the content and keeps the route', async ({ page }) => {
    await page.keyboard.press('Tab');
    await expect(page.locator('#skip-link')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.locator('.home-hero__title')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('main-content');
  });

  // E2E-HOME-008: the nav gains its surface once the opening is behind it, and Back from a door
  // returns to the same place on the page with the same door chosen
  test('nav turns solid past the opening; back returns to the doors', async ({ page }) => {
    await expect(page.locator('body')).not.toHaveAttribute('data-scrolled', '');
    await page.locator('#atlas').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 200));
    await expect(page.locator('body')).toHaveAttribute('data-scrolled', '');
    const door = page.locator('#atlas-grid .door.is-found a').nth(6);
    const no = await door.getAttribute('data-no');
    await page.waitForTimeout(300);
    const y = await page.evaluate(() => window.scrollY);
    await door.click();
    await expect(page.locator('.detail-hero__title')).toBeVisible();
    await page.goBack();
    await expect(page.locator('#atlas-grid .door.is-found')).not.toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(y - 120);
    await expect(page.locator(`#atlas-grid .door[data-no="${no}"]`)).toHaveClass(/is-selected/);
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
    const found = data.filter((j) => j.entrance);
    await expect(grid.locator('.door.is-found a')).toHaveCount(found.length);
    await expect(page.locator('.home-atlas__mist')).toContainText(String(100 - found.length));
    await grid.scrollIntoViewIfNeeded();
    await expect(page.locator('#atlas-found')).toHaveText(String(total), { timeout: 4000 });
    // Pointing at a door (and resting there) shows it in the card
    const pick = found.find((j) => j.entrance.no === 15) || found[1];
    const [name, place] = pick.title.split(' · ');
    await grid.locator(`a[data-no="${pick.entrance.no}"]`).hover();
    await expect(page.locator('#door-body .door-card__title')).toContainText(name);
    if (place) await expect(page.locator('#door-body .door-card__title .t-place')).toHaveText(place);
    await expect(page.locator('#door-card')).toHaveAttribute('href', `#/journey/${pick.slug}`);
    await expect(page.locator('#door-body .door-card__clock')).toContainText(/\d{2}:\d{2}/);
    // A realm filter dims every other door
    const realm = pick.entrance.realm;
    await page.locator(`#atlas-filters [data-filter="${realm}"]`).click();
    await expect(page.locator(`#atlas-filters [data-filter="${realm}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(grid.locator('.door.is-found:not(.is-dim)')).toHaveCount(found.filter((j) => j.entrance.realm === realm).length);
    // Arrow keys move between doors; the wall is one tab stop
    await page.locator(`#atlas-filters [data-filter=""]`).click();
    await expect(grid.locator('a[tabindex="0"]')).toHaveCount(1);
    await grid.locator('a[tabindex="0"]').focus();
    const before = await grid.locator('a[tabindex="0"]').getAttribute('data-no');
    await page.keyboard.press('ArrowRight');
    await expect(grid.locator('a[tabindex="0"]')).not.toHaveAttribute('data-no', before);
    // The opening: the brand scene plus three doors, each numbered, with a pause control
    await expect(page.locator('.home-hero__dot')).toHaveCount(4);
    await expect(page.locator('#hero-pause')).toBeVisible();
    await expect(page.locator('#hero-now time')).toHaveText(/^\d{2}:\d{2}$/);
  });
});
