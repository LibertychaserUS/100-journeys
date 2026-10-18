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
    await expect(page.locator('.detail-hero__no')).toContainText(`No.${String(j.entrance.no).padStart(3, '0')}`);
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
    // Scenes reveal as they arrive and never stay hidden once in view
    await page.locator('#ch-1').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-scene="ch-1"]')).toHaveClass(/is-in/);
    await expect(page.locator('[data-scene="ch-1"] .scene__prose p').first()).toHaveCSS('opacity', '1', { timeout: 4000 });
  });

  // E2E-SCENES-001: the journey's own art direction drives the page (motif, texture, arc, beats)
  test('the journey brings its own scene', async ({ page }) => {
    const { data: j } = await (await page.request.get(`/api/journeys/${SLUG}`)).json();
    await page.goto(`/#/journey/${SLUG}`);
    const root = page.locator('article.scenes');
    await expect(root).toHaveClass(new RegExp(`motif-${j.scene.motif}`));
    await expect(root).toHaveClass(new RegExp(`tex-${j.scene.texture}`));
    await expect(page.locator('.scenes__motif > *').first()).toBeAttached();
    await expect(page.locator('[data-scene^="ch-"][data-beat]')).toHaveCount(j.scene.beats.filter(Boolean).length);
    // Walking down the page moves the lighting arc away from the opening tone.
    const h0 = await root.evaluate((el) => getComputedStyle(el).getPropertyValue('--arc-h').trim());
    await page.locator('#fork').scrollIntoViewIfNeeded();
    await expect.poll(() => root.evaluate((el) => getComputedStyle(el).getPropertyValue('--arc-h').trim())).not.toBe(h0);
    // No guide-style labels around the story.
    await expect(page.locator('.scene__eyebrow')).toHaveCount(0);
  });

  // E2E-SCENES-002: with reduced motion every scene is readable at once
  test('reduced motion shows every scene without waiting', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', locale: 'zh-CN' });
    const page = await context.newPage();
    await freshPage(page);
    await page.goto(`/#/journey/${SLUG}`);
    await expect(page.locator('.scene.is-in')).toHaveCount(await page.locator('.scene').count());
    await expect(page.locator('.scene--ending .ending')).toHaveCSS('opacity', '1');
    await context.close();
  });

  // E2E-SEO-001: crawlers get a real robots.txt and a sitemap of every journey's share page
  test('robots.txt and the sitemap list the journeys', async ({ page }) => {
    const robots = await (await page.request.get('/robots.txt')).text();
    expect(robots).toContain('User-agent: *');
    expect(robots).toMatch(/Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/);
    const res = await page.request.get('/sitemap.xml');
    expect(res.headers()['content-type']).toContain('xml');
    expect(await res.text()).toContain(`/j/${SLUG}</loc>`);
  });

  // E2E-SHARE-001: a journey share link carries its preview tags and opens the journey
  test('share links preview the journey and open it', async ({ page }) => {
    const html = await (await page.request.get(`/j/${SLUG}`)).text();
    const { data: j } = await (await page.request.get(`/api/journeys/${SLUG}`)).json();
    expect(html).toContain(`<meta property="og:title" content="${j.title} · 桃源百旅" />`);
    expect(html).toContain('property="og:image"');
    expect((html.match(/property="og:title"/g) || []).length).toBe(1);
    await page.goto(`/j/${SLUG}`);
    await expect(page).toHaveURL(new RegExp(`/#/journey/${SLUG}$`));
    await expect(page.locator('.detail-hero__title')).toHaveText(j.title);
    await expect(page).toHaveTitle(`${j.title} · 桃源百旅`);
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
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`/j/${SLUG}`);
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
