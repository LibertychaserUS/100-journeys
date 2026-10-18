const { test, expect } = require('@playwright/test');
const { freshPage, registerAndLogin } = require('./helpers');

const SLUG = 'bolivia-salt-flat-trek';

test.describe('Detail Page', () => {
  test.beforeEach(async ({ page }) => {
    await freshPage(page);
  });

  // E2E-DETAIL-001: hero, the authored story and the booking ticket render with real data
  test('detail page renders journey content', async ({ page }) => {
    const { data: j } = await (await page.request.get(`/api/journeys/${SLUG}`)).json();
    const c = j.content;
    await page.goto(`/#/journey/${SLUG}`);
    await expect(page.locator('.detail-hero__title')).toHaveText(j.title);
    await expect(page.locator('.detail-hero__no')).toContainText(`第 ${j.entrance.no} 号入口`);
    await expect(page.locator('.detail-hero__badge')).toHaveText('独处治愈'); // localized, not "solitude"
    await expect(page.locator('.detail-hero__opens dd')).toHaveText(c.opens);
    // prologue + chapters + fork + ending
    await expect(page.locator('.chapter')).toHaveCount(c.chapters.length + 3);
    await expect(page.locator('#ch-role')).toHaveText(c.role);
    await expect(page.locator('.fork__option')).toHaveCount(c.choice.options.length);
    await expect(page.locator('.prep .clue')).toHaveCount(3);
    await expect(page.locator('.truth__facts li')).toHaveCount(c.facts.length);
    await expect(page.locator('.truth__facts a').first()).toHaveAttribute('rel', /noopener/);
    await expect(page.locator('#detail-ticket')).toContainText('匹配 5/5'); // 1–5 score, not "5%"
    await expect(page.locator('#detail-cta-buy')).toBeVisible();
    await expect(page.locator('#detail-cta-save')).toBeVisible();
    // Story text is visible without scrolling into view (no reveal-to-black)
    await expect(page.locator('.chapter p').first()).toHaveCSS('opacity', '1');
  });

  // E2E-DETAIL-008: the fork shows what you leave with, marks the ticket and is remembered
  test('choosing at the fork updates the ticket and persists', async ({ page }) => {
    const { data: j } = await (await page.request.get(`/api/journeys/${SLUG}`)).json();
    const option = j.content.choice.options[1];
    await page.goto(`/#/journey/${SLUG}`);
    await expect(page.locator('#ticket-keeps')).toHaveClass(/is-empty/);
    const btn = page.locator(`.fork__option[data-key="${option.key}"]`);
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#fork-keeps')).toContainText(option.keeps);
    await expect(page.locator('#ticket-keeps')).toHaveText(option.keeps);
    await page.reload();
    await expect(page.locator(`.fork__option[data-key="${option.key}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#ticket-keeps')).not.toHaveClass(/is-empty/);
  });

  // E2E-DETAIL-002: back returns to the previous page
  test('back button returns to previous page', async ({ page }) => {
    await page.goto('/#/explore');
    await page.locator(`.journey-card[data-slug="${SLUG}"]`).click();
    await expect(page.locator('.detail-hero__title')).toBeVisible();
    await page.locator('#detail-back').click();
    await expect(page).toHaveURL(/#\/explore/);
  });

  // E2E-DETAIL-003: share copies the link and confirms with a toast
  test('share button copies the link', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(`/#/journey/${SLUG}`);
    await page.locator('#detail-share').click();
    await expect(page.locator('#toast-region')).toContainText('链接已复制');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`#/journey/${SLUG}`);
  });

  // E2E-DETAIL-004: unknown journey shows a 404 with ways back
  test('non-existent journey shows 404', async ({ page }) => {
    await page.goto('/#/journey/nonexistent-slug-xyz-123');
    await expect(page.locator('.detail-notfound')).toBeVisible();
    await expect(page.locator('.detail-notfound__title')).toHaveText('旅程未找到');
    await expect(page.locator('.detail-notfound a[href="#/explore"]')).toBeVisible();
  });

  // E2E-DETAIL-005: guests are asked to log in before saving
  test('saving as a guest prompts to log in', async ({ page }) => {
    await page.goto(`/#/journey/${SLUG}`);
    await page.locator('#detail-cta-save').click();
    await expect(page.locator('#toast-region')).toContainText('登录后可以收藏旅程');
    await expect(page.locator('#detail-cta-save')).toHaveAttribute('aria-pressed', 'false');
  });

  // E2E-DETAIL-006: saved state persists on the server and shows in My trips
  test('save persists and appears in the saved tab', async ({ page }) => {
    await registerAndLogin(page, { prefix: 'saver' });
    await page.goto(`/#/journey/${SLUG}`);
    const save = page.locator('#detail-cta-save');
    await save.click();
    await expect(save).toHaveAttribute('aria-pressed', 'true');
    await expect(save).toHaveClass(/is-saved/);

    await page.reload();
    await expect(page.locator('#detail-cta-save')).toHaveAttribute('aria-pressed', 'true');

    await page.goto('/#/profile?tab=saved');
    await expect(page.locator(`#profile-saved .journey-card[data-slug="${SLUG}"]`)).toBeVisible();

    await page.goto(`/#/journey/${SLUG}`);
    await page.locator('#detail-cta-save').click();
    await expect(page.locator('#detail-cta-save')).toHaveAttribute('aria-pressed', 'false');
    await page.goto('/#/profile?tab=saved');
    await expect(page.locator('#panel-saved .state__title')).toHaveText('还没有收藏');
  });

  // E2E-DETAIL-007: unknown routes get a 404 page (was a "500 server error")
  test('unknown route shows 404 page', async ({ page }) => {
    await page.goto('/#/definitely-not-a-page');
    await expect(page.locator('.error-code')).toHaveText('404');
    await expect(page.locator('#error-picks .journey-card')).not.toHaveCount(0);
  });
});
