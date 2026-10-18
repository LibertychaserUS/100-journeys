const { test, expect } = require('@playwright/test');
const { freshPage, registerAndLogin, logout } = require('./helpers');

const ZH_TITLE = '雨季的乌尤尼，天亮前一刻钟，你有一整天不必赶路。';

/** Records funnel events sent through API.track. */
async function recordTracking(page) {
  await page.evaluate(() => {
    window.__tracked = [];
    const send = API.track;
    API.track = (type, slug) => { window.__tracked.push(type); send(type, slug); };
  });
}

async function tabTo(page, selector, max = 40) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (await page.locator(selector).evaluate((el) => el === document.activeElement).catch(() => false)) return;
  }
  throw new Error(`Tab never reached ${selector}`);
}

const slip = (page, group, key) => page.locator(`#slip-${group}-${key}`);
const line = (page, group) => page.locator(`#compose-ticket .cline[data-group="${group}"]`);

test.describe('Compose: draw your own entrance', () => {
  test.beforeEach(async ({ page }) => {
    await freshPage(page);
  });

  // E2E-COMPOSE-001: mouse path — click and drag slips in, take one back, keep the ticket with a stamp
  test('mouse: tap and drag slips into the frame and keep the ticket', async ({ page }) => {
    await page.goto('/#/compose');
    await expect(page.locator('h1')).toHaveText('画一个自己的入口');
    await expect(page.locator('#compose-keep')).toBeDisabled();
    await expect(page.locator('#compose-ticket .cline.is-empty')).toHaveCount(6);
    await recordTracking(page);

    await slip(page, 'place', 'uyuni').click();
    await expect(slip(page, 'place', 'uyuni')).toHaveAttribute('aria-pressed', 'true');
    await expect(line(page, 'place')).toContainText('乌尤尼盐沼');
    await slip(page, 'season', 'rainy').dragTo(page.locator('#compose-frame'));
    await slip(page, 'hour', 'predawn').click();
    await slip(page, 'stay', 'day').dragTo(page.locator('#compose-frame'));
    await expect(page.locator('#compose-ticket-title')).toHaveText(ZH_TITLE);
    await expect(page.locator('#compose-progress')).toContainText('已放入 4 / 6');
    await expect(page.locator('#compose-ticket .cline.is-empty')).toHaveCount(2);
    await expect(page.locator('#compose-hint')).toHaveText('还差 2 张纸笺。也可以现在就收起这张票，以后再补。');
    await expect(page.locator('#compose-ticket .cticket__link')).toHaveAttribute('href', '#/journey/bolivia-salt-flat-trek');

    // Tapping a placed line on the ticket takes it back; tapping the slip again does too.
    await slip(page, 'keepsake', 'salt').click();
    await expect(page.locator('.cticket__story')).toHaveText('回来时，你带着一粒盐。');
    await line(page, 'keepsake').locator('button').click();
    await expect(line(page, 'keepsake')).toHaveClass(/is-empty/);
    await expect(slip(page, 'keepsake', 'salt')).toHaveAttribute('aria-pressed', 'false');
    await slip(page, 'place', 'koyasan').click();
    await expect(slip(page, 'place', 'uyuni')).toHaveAttribute('aria-pressed', 'false');
    await slip(page, 'place', 'uyuni').click();

    await page.locator('#compose-keep').click();
    await expect(page.locator('#compose-ticket .cticket__stamp')).toBeVisible();
    await expect(page.locator('#compose-new')).toBeFocused();
    const kept = page.locator('#compose-mine .kept');
    await expect(kept).toHaveCount(1);
    await expect(kept.locator('.cticket__title')).toHaveText(ZH_TITLE);
    await expect(kept.locator('.kept__tag')).toHaveText('只在这台设备上');
    expect(await page.evaluate(() => window.__tracked)).toEqual(['compose_start', 'compose_complete']);

    // "Draw another" clears the frame; "open" brings the kept ticket back.
    await page.locator('#compose-new').click();
    await expect(page.locator('#compose-ticket .cline.is-empty')).toHaveCount(6);
    await kept.locator('[data-action="open"]').click();
    await expect(page.locator('#compose-ticket-title')).toHaveText(ZH_TITLE);
    await expect(page.locator('#compose-ticket .cticket__stamp')).toBeVisible();

    // Tear it up (two-step, no native confirm).
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
    await kept.locator('[data-action="tear"]').click();
    await expect(kept.locator('[data-action="tear"]')).toHaveText('确定撕掉？');
    await kept.locator('[data-action="tear"]').click();
    await expect(page.locator('#compose-mine .kept')).toHaveCount(0);
    await expect(page.locator('#compose-mine')).toContainText('还没有收起过票');
    expect(dialogs).toEqual([]);
  });

  // E2E-COMPOSE-002: keyboard only — Tab between piles, arrows within, Enter places, Backspace takes back
  test('keyboard: arrows, Enter and Backspace compose a ticket', async ({ page }) => {
    await page.goto('/#/compose');
    await expect(slip(page, 'place', 'uyuni')).toBeVisible();
    await tabTo(page, '#slip-place-uyuni');
    await expect(page.locator('#compose-tray .slips').first()).toHaveAttribute('role', 'toolbar');

    await page.keyboard.press('ArrowRight');
    await expect(slip(page, 'place', 'snaefellsnes-tube')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft'); // wraps to the last place
    await expect(page.locator('#compose-tray [data-group="place"] .slip').last()).toBeFocused();
    await page.keyboard.press('Home');
    await expect(slip(page, 'place', 'uyuni')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(slip(page, 'place', 'uyuni')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#compose-status')).toHaveText('地方：乌尤尼盐沼，已放进灯框');

    // One Tab stop per pile: the next Tab lands in the hours.
    await page.keyboard.press('Tab');
    await expect(slip(page, 'hour', 'predawn')).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect(slip(page, 'season', 'rainy')).toBeFocused();
    await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowRight');
    await expect(slip(page, 'stay', 'day')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#compose-ticket-title')).toHaveText(ZH_TITLE);

    await page.keyboard.press('Backspace');
    await expect(line(page, 'stay')).toHaveClass(/is-empty/);
    await expect(page.locator('#compose-status')).toHaveText('停留多久：一整天不赶路，已取回');
    await expect(slip(page, 'stay', 'day')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#compose-ticket-title')).toHaveText(ZH_TITLE);

    // The tray scrolls focused slips into view and the frame's actions are reachable by Tab.
    await tabTo(page, '#compose-keep');
    await page.keyboard.press('Enter');
    await expect(page.locator('#compose-ticket .cticket__stamp')).toBeVisible();
    await expect(page.locator('#compose-new')).toBeFocused();
    await expect(page.locator('#compose-mine .kept')).toHaveCount(1);
  });

  // E2E-COMPOSE-003: a guest's ticket survives a reload and moves into the account on sign-up
  test('guest ticket is kept on the device, then replayed into the new account', async ({ page }) => {
    await page.goto('/#/compose');
    await slip(page, 'place', 'tromso').click();
    await slip(page, 'season', 'polar-night').click();
    await slip(page, 'ritual', 'quiet').click();
    await page.locator('#compose-keep').click();
    await expect(page.locator('.toast')).toContainText('先收在这台设备上了');
    const id = await page.evaluate(() => JSON.parse(localStorage.getItem('guest_state')).composed[0].id);

    await page.reload();
    await expect(page.locator('#compose-mine .kept.is-local')).toHaveCount(1);
    await expect(page.locator('#compose-ticket-title')).toHaveText('极夜的特罗姆瑟。');
    await expect(page.locator('.cticket__story').first()).toHaveText('你录下三十秒的安静。');

    // Sharing needs an account.
    await page.locator('#compose-share').click();
    await expect(page.locator('.toast')).toContainText('登录后，才能把这张票分享出去');

    await registerAndLogin(page, { prefix: 'compose', next: '/compose' });
    await expect(page.locator('#compose-mine .kept')).toHaveCount(1);
    await expect(page.locator('#compose-mine .kept.is-local')).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('guest_state')).composed)).toEqual([]);
    const res = await page.evaluate(async () => (await API.listCompositions()).data);
    expect(res.map((x) => x.id)).toEqual([id]);
    expect(res[0].picks).toEqual({ place: 'tromso', season: 'polar-night', ritual: 'quiet' });
  });

  // E2E-COMPOSE-004: a share link opens the ticket read-only for anyone
  test('share link opens a read-only ticket', async ({ page, context, browser }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await registerAndLogin(page, { prefix: 'sharer', next: '/compose' });
    await slip(page, 'place', 'back-alley').click();
    await slip(page, 'hour', 'midnight').click();
    await slip(page, 'keepsake', 'echo').click();
    await page.locator('#compose-share').click(); // keeps first, then copies
    await expect(page.locator('.toast')).toContainText('链接已复制');
    await expect(page.locator('#compose-ticket .cticket__stamp')).toBeVisible();
    const url = await page.evaluate(() => navigator.clipboard.readText());
    expect(url).toMatch(/#\/compose\/[a-z0-9]{12}$/);
    await expect(page.locator('#compose-mine [data-action="share-kept"]')).toHaveCount(1);

    // On a shared device the account's ticket leaves with the account (signing out goes home first).
    await logout(page);
    await page.goto('/#/compose');
    await expect(page.locator('#compose-tray .slip').first()).toBeVisible();
    await expect(page.locator('#compose-ticket .cline.is-empty')).toHaveCount(6);
    await expect(page.locator('#compose-mine .kept')).toHaveCount(0);

    const guest = await browser.newContext({ locale: 'zh-CN' });
    const other = await guest.newPage();
    await freshPage(other);
    await other.goto(url);
    await expect(other.locator('.compose-shared h1')).toHaveText('一张别人拼的票');
    await expect(other.locator('#shared-ticket-title')).toHaveText('家楼下那条巷子，子夜。');
    await expect(other.locator('.compose-shared .cticket__stamp')).toBeVisible();
    await expect(other.locator('.slip, #compose-keep, [data-take]')).toHaveCount(0);
    await other.locator('.compose-shared__actions a', { hasText: '画一个自己的' }).click();
    await expect(other).toHaveURL(/#\/compose$/);
    await expect(other.locator('#compose-tray')).toBeVisible();

    await other.goto(url.replace(/[a-z0-9]{12}$/, 'zzzzzzzzzzzz'));
    await expect(other.locator('.state__title')).toHaveText('这张票找不到了');
    await guest.close();
  });

  // E2E-COMPOSE-005: a placed slip flies onto its line and inks in; with reduced motion it simply appears
  test('motion: slip flight and ink, and none of it with reduced motion', async ({ page }) => {
    await page.goto('/#/compose');
    await expect(page.locator('.compose.is-entering')).toHaveCount(0, { timeout: 3000 });
    await slip(page, 'place', 'uyuni').click();
    await expect(page.locator('.slip--flight')).toHaveCount(1);
    expect(await page.locator('#compose-ticket .ink.is-new').evaluate((el) => getComputedStyle(el).animationName)).toContain('ink-phrase');
    expect(await line(page, 'place').locator('dd').evaluate((el) => getComputedStyle(el).animationDelay)).not.toBe('0s');
    await expect(page.locator('.slip--flight')).toHaveCount(0); // the paper copy dissolves when it lands

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await slip(page, 'hour', 'dawn').click();
    await expect(page.locator('.slip--flight')).toHaveCount(0);
    const ink = page.locator('#compose-ticket .ink.is-new');
    await expect(ink).toHaveText('第一缕光落下时');
    expect(await ink.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    expect(await page.locator('#compose-progress b.is-new').evaluate((el) => getComputedStyle(el, '::after').animationName)).toBe('none');
    expect(await line(page, 'hour').locator('dd').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    await page.locator('#compose-keep').click();
    const stamp = page.locator('#compose-ticket .cticket__stamp');
    await expect(stamp).toBeVisible();
    expect(await stamp.evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).opacity])).toEqual(['none', '1']);
  });

  // E2E-COMPOSE-006: the sentence is built from per-language templates; switching language keeps the work
  test('zh and en build the ticket sentence in their own words', async ({ page }) => {
    await page.goto('/#/compose');
    await slip(page, 'place', 'uyuni').click();
    await slip(page, 'season', 'rainy').click();
    await slip(page, 'hour', 'predawn').click();
    await slip(page, 'stay', 'day').click();
    await slip(page, 'ritual', 'postcard').click();
    await slip(page, 'keepsake', 'salt').click();
    await expect(page.locator('#compose-ticket-title')).toHaveText(ZH_TITLE);
    await expect(page.locator('.cticket__story')).toHaveText('你写一张不寄出的明信片；回来时，带着一粒盐。');
    await expect(page.locator('#compose-hint')).toHaveText('六行都写满了。收起它，它就是你的。');

    await page.locator('#nav-lang').click();
    await expect(page.locator('h1')).toHaveText('Draw your own entrance');
    await expect(page.locator('#compose-ticket-title')).toHaveText('Uyuni in the rainy season, a quarter hour before dawn — a whole day with nowhere to be.');
    await expect(page.locator('.cticket__story')).toHaveText("You write a postcard you won't send, and come home with a grain of salt.");
    await expect(slip(page, 'place', 'uyuni')).toContainText('Salar de Uyuni');
    await expect(line(page, 'keepsake')).toContainText('A grain of salt');

    await line(page, 'place').locator('button').click();
    await line(page, 'season').locator('button').click();
    await expect(page.locator('#compose-ticket-title')).toHaveText('A quarter hour before dawn — a whole day with nowhere to be.');
    await slip(page, 'season', 'midnight-sun').click();
    await expect(page.locator('#compose-ticket-title')).toHaveText('Somewhere under the midnight sun, a quarter hour before dawn — a whole day with nowhere to be.');
  });

  // E2E-COMPOSE-007: Explore invites into the game; "hand me a random slip" fills the next blank line
  test('explore entry card and the random slip', async ({ page }) => {
    await page.goto('/#/explore');
    await page.locator('#compose-invite').click();
    await expect(page).toHaveURL(/#\/compose$/);
    await expect(page.locator('#compose-tray')).toBeVisible();
    await page.locator('#compose-shuffle').click();
    await expect(page.locator('#compose-tray [data-group="place"] .slip[aria-pressed="true"]')).toHaveCount(1);
    await expect(page.locator('#compose-shuffle')).toBeFocused();
    for (let i = 0; i < 5; i++) await page.locator('#compose-shuffle').click();
    await expect(page.locator('#compose-tray .slip[aria-pressed="true"]')).toHaveCount(6);
    await expect(page.locator('#compose-progress')).toContainText('已放入 6 / 6');
    await page.locator('#compose-shuffle').click(); // full: swaps one slip, still six
    await expect(page.locator('#compose-tray .slip[aria-pressed="true"]')).toHaveCount(6);
  });
});
