const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { freshPage, registerAndLogin, logout, settle } = require('./helpers');

const slip = (page, group, key) => page.locator(`#slip-${group}-${key}`);

test.describe('The Ticket Road', () => {
  // Reduced motion takes the press-and-hold path of the rubbing and skips the flights.
  test.use({ reducedMotion: 'reduce' });

  // E2E-ROAD-001: the whole road — a guest rubs a door, pieces a ticket from its slips, signs up,
  // hangs the ticket at the station; another traveller turns it over and lights it; it hangs by the door.
  test('rub, compose, post, light, and find it by the door', async ({ page }) => {
    test.setTimeout(90000);
    await freshPage(page);

    // 1. A guest reaches the end of door 6, picks a side of its fork and takes a rubbing.
    await page.goto('/#/journey/norway-aurora-hunt');
    await page.locator('.fork__option[data-key="pencil"]').click();
    const hold = page.locator('.rubbing__hold');
    await hold.scrollIntoViewIfNeeded();
    await expect(page.locator('.rubbing .rslip')).toHaveCount(4); // place, hour, season, keepsake
    await hold.hover();
    await page.mouse.down();
    await page.waitForTimeout(1900);
    await page.mouse.up();
    await expect(page.locator('.rubbing.is-settled')).toBeVisible();
    await expect(page.locator('.slipbox__n')).toHaveText('4');
    const rubbed = await page.evaluate(() => JSON.parse(localStorage.getItem('guest_state')).rubbings);
    expect(Object.keys(rubbed).sort()).toEqual(['hour:night', 'keepsake:keep-6-pencil', 'place:tromso', 'season:polar-night']);

    // The journey's lantern and an empty or filled line wait below.
    await expect(page.locator('#road-lamp .lantern__body')).toBeVisible();
    await expect(page.locator('#road-rack .rack')).toBeVisible();

    // 2. In the compose game those slips are solid; doors not walked are outlines that point the way.
    await page.goto('/#/compose');
    await expect(slip(page, 'place', 'tromso')).toBeVisible();
    await expect(slip(page, 'place', 'uyuni')).toHaveCount(0);
    const outline = page.locator('.slips[data-group="place"] .slip-outline').first();
    await outline.click();
    await expect(page.locator('.outline-pop')).toContainText('№1 · 镜与盐');
    await expect(page.locator('.outline-pop a')).toHaveAttribute('href', '#/journey/bolivia-salt-flat-trek');
    for (const [g, k] of [['place', 'tromso'], ['hour', 'night'], ['season', 'polar-night'], ['stay', 'day'], ['keepsake', 'keep-6-pencil']]) await slip(page, g, k).click();
    await expect(page.locator('#compose-ticket .cline[data-group="place"] .cline__mark')).toContainText('№6');
    await expect(page.locator('#compose-ticket .cline[data-group="keepsake"] .cline__mark')).toContainText('№6');
    await expect(page.locator('#compose-ticket .cline[data-group="stay"] .cline__mark')).toHaveCount(0);
    await page.locator('#compose-keep').click();
    await expect(page.locator('.toast')).toContainText('先收在这台设备上了');

    // 3. Signing up moves the ticket and the rubbings into the account.
    await registerAndLogin(page, { prefix: 'roadauthor', next: '/compose' });
    await expect(page.locator('#compose-mine .kept')).toHaveCount(1);
    await expect.poll(async () => page.evaluate(async () => Object.keys((await API.rubbings()).data).length)).toBe(4);
    const code = await page.evaluate(async () => (await API.listCompositions()).data[0].code);

    // 4. Hang it at the station with a printed luggage tag.
    await page.locator(`#compose-mine [data-action="post"][data-code="${code}"]`).click();
    const sheet = page.locator('.sheet');
    await expect(sheet.locator('h2')).toHaveText('挂上票台');
    await sheet.locator('.ltag--btn[data-tag="aurora"]').click();
    await expect(sheet.locator('.ltag--btn[data-tag="aurora"]')).toHaveAttribute('aria-pressed', 'true');
    await sheet.locator('button[type="submit"]').click();
    await expect(page.locator('.toast')).toContainText('挂上去了');
    await expect(page.locator('#compose-mine .kept__tag--posted')).toHaveText('挂在票台上');
    // Its author finds it on the line by the door it borrowed from straight away.
    await page.goto('/#/journey/norway-aurora-hunt');
    await page.locator('#road-rack').scrollIntoViewIfNeeded();
    await expect(page.locator(`#road-rack .stub[data-code="${code}"]`)).toBeVisible();
    await expect(page.locator(`#road-rack .stub[data-code="${code}"]`)).toContainText('你的票');

    // 5. The station finds it by platform, tag and enquiry; its back shows the door it borrowed from.
    await page.goto('/#/station?realm=ice-night&sort=new');
    const stub = page.locator(`.racks__grid .stub[data-code="${code}"]`);
    await expect(stub).toBeVisible();
    await expect(stub).toContainText('极夜的特罗姆瑟');
    await expect(stub.locator('.postmark')).toContainText('6');
    await page.goto('/#/station?tag=aurora&sort=new');
    await expect(stub).toBeVisible();
    await page.goto(`/#/station?q=${encodeURIComponent('特罗姆瑟')}&sort=new`);
    await expect(stub).toBeVisible();
    await stub.click();
    const back = page.locator('.ticket-open__back');
    await expect(back).toBeVisible();
    await expect(back.locator('.back__doors li')).toHaveCount(1);
    await expect(back.locator('.back__doors a')).toHaveAttribute('href', '#/journey/norway-aurora-hunt');
    await expect(back.locator('.lantern__own')).toBeVisible(); // no lantern on your own ticket
    await page.keyboard.press('Escape');

    // 6. Another traveller turns it over, waits a moment and lights it.
    await logout(page);
    await registerAndLogin(page, { prefix: 'roadlighter' });
    await page.goto('/#/station?realm=ice-night&sort=new');
    await page.locator(`.racks__grid .stub[data-code="${code}"]`).click();
    const real = page.locator('.cord[data-axis="real"] .cord__bead');
    await expect(real).toHaveAttribute('aria-disabled', 'true');
    await expect(real).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15000 });
    await real.focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
    await expect(real).toHaveAttribute('aria-valuenow', '4');
    await expect(real).toHaveAttribute('aria-valuetext', '很亮');
    await page.locator('.cord[data-axis="moved"] .cord__bead').focus();
    await page.keyboard.press('End');
    await page.locator('.stamp[data-stamp="stopped"]').click();
    await page.locator('.lantern__release').click();
    await expect(page.locator('.lantern [data-lit-status]')).toHaveText('你的灯升上去了。'); // heard, not shown: the light says it
    await expect(page.locator('.lantern__verdict')).toContainText('灯还没点满'); // nothing public before five travellers
    const mine = await page.evaluate(async (c) => (await API.myLamp('ticket', c)).data.mine, code);
    expect(mine).toMatchObject({ real: 4, moved: 5, fit: 0, stamp: 'stopped' });
    await page.keyboard.press('Escape');

    // 7. For everyone else the line by door 6 rotates (one ticket per author, six at most); the API
    //    lists this ticket among the door's candidates whenever the line is not full.
    await page.goto('/#/journey/norway-aurora-hunt');
    await page.locator('#road-rack').scrollIntoViewIfNeeded();
    await expect(page.locator('#road-rack .rack')).toBeVisible();
    const rack = await page.evaluate(async () => (await API.rack('norway-aurora-hunt', 'night')).data);
    expect(rack.length).toBeLessThanOrEqual(6);
    expect(new Set(rack.map((v) => v.aid)).size).toBe(rack.length);
    if (rack.length < 6) expect(rack.map((v) => v.code)).toContain(code);
  });

  // E2E-ROAD-002: the station's controls live in the hash, so a view can be passed on as a link.
  test('station filters, order and enquiry are written to the hash', async ({ page }) => {
    await freshPage(page);
    await page.goto('/#/station');
    await expect(page.locator('.station__title')).toHaveText('夜站');
    await expect(page.locator('.platform')).toHaveCount(9);
    await page.locator('.platform[data-realm="ice-night"]').click();
    await expect(page).toHaveURL(/realm=ice-night/);
    await expect(page.locator('.platform[data-realm="ice-night"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.sortboard__opt[data-sort="new"]').click();
    await expect(page).toHaveURL(/sort=new/);
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/sort=borrowed/);
    await page.locator('#station-tt-btn').click();
    await expect(page.locator('#station-timetable')).toBeVisible();
    const dial = page.locator('.clock__dial');
    await expect(dial).toBeFocused();
    await page.keyboard.press('End');
    await expect(page).toHaveURL(/hour=midnight/);
    await expect(page.locator('.station')).toHaveAttribute('data-hour', 'midnight');
    await expect(dial).toHaveAttribute('aria-valuetext', '子夜');
    await page.locator('.ring__s[data-season="polar-night"]').click();
    await expect(page).toHaveURL(/season=polar-night/);
    await page.locator('#station-q').fill('last train');
    await page.locator('#station-q').press('Enter');
    await expect(page).toHaveURL(/q=last\+train/);
    await expect(page.locator('#station-tt-label')).toHaveText('时刻表 · 2');

    // The same link restores the same view.
    await page.reload();
    await expect(page.locator('.platform[data-realm="ice-night"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.sortboard__opt[data-sort="borrowed"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#station-q')).toHaveValue('last train');
    await page.locator('#station-tt-btn').click();
    await page.locator('#tt-clear').click();
    await expect(page).not.toHaveURL(/hour=|season=|q=/);
  });

  // E2E-ROAD-003: an opened ticket (its back, the lantern with cords, stamps and flags) and an
  // entrance's ending after a rubbing pass axe in both themes.
  for (const theme of ['dark', 'light']) {
    test(`ticket back and a rubbed entrance end have no WCAG A/AA violations (${theme})`, async ({ page }) => {
      await freshPage(page);
      await page.addInitScript((th) => localStorage.setItem('theme', th), theme);
      const scan = async () => {
        await settle(page);
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('.home-hero__particles').analyze();
        return results.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`);
      };
      await page.goto('/#/journey/bolivia-salt-flat-trek');
      await page.locator('.fork__option').first().click();
      const hold = page.locator('.rubbing__hold');
      await hold.scrollIntoViewIfNeeded();
      await hold.hover();
      await page.mouse.down();
      await page.waitForTimeout(1900);
      await page.mouse.up();
      await expect(page.locator('.rubbing.is-settled')).toBeVisible();
      let summary = await scan();
      expect(summary, summary.join('\n')).toEqual([]);

      await page.goto('/#/station?sort=new');
      await expect(page.locator('#station-grid')).not.toHaveAttribute('aria-busy', 'true');
      const first = page.locator('.racks__grid .stub__open').first();
      test.skip(!(await first.count()), 'no ticket on the station yet');
      await first.click();
      await expect(page.locator('.ticket-open__back .lantern__cords')).toBeVisible();
      await page.locator('.lantern__flags summary').click();
      summary = await scan();
      expect(summary, summary.join('\n')).toEqual([]);
    });
  }
});
