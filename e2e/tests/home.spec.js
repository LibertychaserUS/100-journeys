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
    await expect(page.locator('html')).not.toHaveClass(/vt-step/); // the door has finished opening
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

  // E2E-HOME-010: doors keep their own hours to the minute: Edinburgh's gun is lit at 13:05 on a
  // Monday and dark on a Sunday, when the card gives the next opening in local time
  test('a door keeps its own hours', async ({ browser }) => {
    for (const [iso, open] of [['2026-10-19T12:05:00Z', true], ['2026-10-18T12:05:00Z', false]]) {
      const context = await browser.newContext({ locale: 'zh-CN' });
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date(iso));
      await page.goto('/#/');
      const door = page.locator('#atlas-grid .door[data-no="47"]');
      await expect(door).toHaveAttribute('data-open', String(open));
      await door.locator('a').focus();
      await expect(page.locator('#door-body .door-card__clock')).toContainText('当地此刻 13:05');
      if (open) await expect(page.locator('#door-body .door-card__clock')).toContainText('此刻开着');
      else await expect(page.locator('#door-body .door-card__clock')).toContainText('当地 13:00');
      await context.close();
    }
  });

  // E2E-HOME-011: scrolling from the opening through the threshold, no visible words pass under the
  // bar while it is still clear
  test('nothing visible slides under a clear bar', async ({ page }) => {
    await page.waitForTimeout(2000); // the opening has arrived
    const end = await page.evaluate(() => { const th = document.getElementById('home-threshold'); return th.offsetTop + th.offsetHeight; });
    const bad = [];
    for (let y = 0; y < end; y += 40) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(50);
      const hit = await page.evaluate(() => {
        const scrim = parseFloat(getComputedStyle(document.body).getPropertyValue('--nav-scrim') || '0');
        if ('scrolled' in document.body.dataset || scrim >= 0.9) return null;
        const bar = document.getElementById('main-nav').getBoundingClientRect().bottom;
        for (const el of document.querySelectorAll('.home-hero__copy, .home-hero__actions, .home-hero__foot, .home-threshold__beat')) {
          const b = el.getBoundingClientRect();
          let o = 1;
          for (let e = el; e && e !== document.body; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity);
          if (b.top < bar && b.bottom > 0 && o > 0.05) return `${el.className.split(' ')[0]} at opacity ${o.toFixed(2)}`;
        }
        return null;
      });
      if (hit) bad.push(`${y}px: ${hit}`);
    }
    expect(bad).toEqual([]);
  });

  // E2E-HOME-009: the example in the search box finds several doors, in both languages
  test('the search example finds doors', async ({ page, browser }) => {
    const example = async (p) => /[「“]([^」”]+)[」”]/.exec(await p.locator('#atlas-q').getAttribute('placeholder'))[1];
    const zh = await example(page);
    expect((await (await page.request.get(`/api/journeys?q=${encodeURIComponent(zh)}&lang=zh`)).json()).total).toBeGreaterThanOrEqual(3);
    const context = await browser.newContext({ locale: 'en-US' });
    const en = await context.newPage();
    await en.goto('/#/');
    const word = await example(en);
    expect((await (await en.request.get(`/api/journeys?q=${encodeURIComponent(word)}&lang=en`)).json()).total).toBeGreaterThanOrEqual(3);
    await context.close();
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
    await door.scrollIntoViewIfNeeded();
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

// E2E-HOME-012: the threshold's lines stay inside its arch, under its curve, and the arch never
// reaches the bar, on a phone and a desktop in both languages; at its end the door opens onto the
// page, and the bar (and the browser's own) turns to the page with it
test.describe('The threshold', () => {
  for (const lang of ['zh', 'en']) {
    for (const [width, height] of [[375, 812], [1440, 900]]) {
      test(`lines stay inside the arch (${lang} ${width})`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width, height }, locale: lang === 'en' ? 'en-US' : 'zh-CN' });
        await context.addInitScript((l) => {
          try { localStorage.setItem('lang', l); localStorage.setItem('theme', 'light'); localStorage.setItem('ai_pet_profile', JSON.stringify({ firstVisit: false })); } catch (e) {}
        }, lang);
        const page = await context.newPage();
        await page.goto('/#/');
        await page.evaluate(() => document.fonts.ready);
        await expect.poll(() => page.evaluate(() => document.querySelector('meta[name="theme-color"]').content)).toBe('#07080b');
        const at = (p) => page.evaluate((v) => { const th = document.getElementById('home-threshold'); window.scrollTo(0, th.offsetTop + v * (th.offsetHeight - window.innerHeight)); }, p);
        const bad = [];
        for (const p of [0.05, 0.2, 0.35, 0.5, 0.65, 0.75, 0.9]) {
          await at(p);
          await page.waitForTimeout(150);
          bad.push(...await page.evaluate((p) => {
            const out = [];
            const th = document.getElementById('home-threshold');
            const arch = th.querySelector('.home-threshold__frame').getBoundingClientRect();
            const bar = document.getElementById('main-nav').getBoundingClientRect().bottom;
            if (arch.top < bar + 16) out.push(`p${p}: arch top ${Math.round(arch.top)} reaches the bar (${bar})`);
            th.querySelectorAll('.home-threshold__beat').forEach((b) => {
              if (parseFloat(getComputedStyle(b).opacity) < 0.05) return;
              const r = document.createRange();
              r.selectNodeContents(b);
              for (const line of r.getClientRects()) {
                if (line.left < arch.left + 16 || line.right > arch.right - 16 || line.top < arch.top + arch.width / 2 - 2 || line.bottom > arch.bottom) {
                  out.push(`p${p}: "${b.textContent.slice(0, 16)}" [${Math.round(line.left)}–${Math.round(line.right)}, ${Math.round(line.top)}] outside the arch [${Math.round(arch.left)}–${Math.round(arch.right)}, ${Math.round(arch.top + arch.width / 2)}]`);
                }
              }
            });
            return out;
          }, p));
        }
        expect(bad).toEqual([]);
        await at(1);
        await expect(page.locator('#home-threshold')).toHaveAttribute('data-media-done', '');
        await expect(page.locator('body')).toHaveAttribute('data-scrolled', '');
        await expect.poll(() => page.evaluate(() => document.querySelector('meta[name="theme-color"]').content)).toBe('#f4efe6');
        await context.close();
      });
    }
  }
});

// E2E-HOME-013: "open right now" means one thing everywhere: no door is open around the clock, and
// the opening's count, the Open-now chip, the lit doors on the wall and the doors the filter keeps
// are the same doors, each of whose cards says it is open (on a clock where several doors are open)
test('open right now means the same doors everywhere', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'zh-CN' });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-10-20T06:00:00Z')); // 08:00 at Wieliczka: the first descent
  await page.goto('/#/');
  await expect(page.locator('#hero-now')).toBeVisible();
  await expect(page.locator('#atlas-grid .door[data-open="always"]')).toHaveCount(0);
  await expect(page.locator('#atlas-grid .door[data-no="15"]')).toHaveAttribute('data-open', 'true');
  const lit = await page.locator('#atlas-grid .door.is-found[data-open="true"]').evaluateAll((els) => els.map((el) => el.dataset.no));
  expect(lit.length).toBeGreaterThan(0);
  await expect(page.locator('#atlas-filters [data-filter="now"] .num')).toHaveText(String(lit.length));
  await expect(page.locator('#hero-now > span')).toContainText(String(lit.length));
  await page.locator('#atlas-filters [data-filter="now"]').click();
  const kept = await page.locator('#atlas-grid .door.is-found:not(.is-dim)').evaluateAll((els) => els.map((el) => el.dataset.no));
  expect(kept).toEqual(lit);
  for (const no of lit.slice(0, 3)) {
    await page.locator(`#atlas-grid .door[data-no="${no}"] a`).focus();
    await expect(page.locator('#door-body .door-card__clock')).toHaveClass(/is-open/);
  }
  await context.close();
});

// E2E-HOME-019: after the page has been drawn again (two language switches), Step in still opens the
// door: one transition, no errors, and the arch (not a plain cross-fade)
test('step in still opens the door after language switches', async ({ page }) => {
  await freshPage(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#/');
  await expect(page.getByRole('link', { name: '推门' })).toBeVisible();
  for (const lang of ['en', 'zh']) {
    await page.locator('#nav-lang').click();
    await expect(page.locator('html')).toHaveAttribute('lang', lang === 'en' ? 'en' : 'zh-CN');
    await expect(page.locator('html')).not.toHaveClass(/vt-swap/);
  }
  await page.evaluate(() => {
    window.__vts = 0;
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = (cb) => { window.__vts += 1; return start(cb); };
  });
  await page.locator('#hero-enter').click();
  await expect(page.locator('html')).toHaveClass(/vt-step/);
  await expect.poll(() => page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('atlas');
  expect(await page.evaluate(() => window.__vts)).toBe(1);
  expect(errors).toEqual([]);
});

// E2E-HOME-020: the Night Station's ticket labels follow the language, both ways round
test('ticket labels follow the language after a round trip', async ({ page }) => {
  await freshPage(page);
  await page.addInitScript(() => { try { if (!localStorage.getItem('lang')) localStorage.setItem('lang', 'en'); } catch (e) {} });
  await page.goto('/#/');
  const racks = page.locator('#home-station-racks');
  const labels = () => page.locator('#home-station .ltag').allTextContents();
  await racks.scrollIntoViewIfNeeded();
  await expect(page.locator('#home-station .ltag').first()).toBeVisible();
  for (const [lang, bad] of [['zh', /[A-Za-z]{3,}/], ['en', /[\u4e00-\u9fff]/], ['zh', /[A-Za-z]{3,}/]]) {
    await page.locator('#nav-lang').click();
    await expect(page.locator('html')).toHaveAttribute('lang', lang === 'en' ? 'en' : 'zh-CN');
    await racks.scrollIntoViewIfNeeded();
    await expect(page.locator('#home-station .ltag').first()).toBeVisible();
    await expect.poll(async () => (await labels()).filter((x) => bad.test(x)), { message: lang }).toEqual([]);
  }
});

// E2E-HOME-021: the opening-next cards show their keyboard focus once they have unrolled
test('opening-next cards show their focus ring', async ({ page }) => {
  await freshPage(page);
  await page.goto('/#/');
  const grid = page.locator('#featured-grid');
  await grid.scrollIntoViewIfNeeded();
  await expect(grid).toHaveClass(/is-done/, { timeout: 4000 });
  await grid.locator('.feature-card[data-slug]').first().focus();
  await page.keyboard.press('Tab');
  const look = await page.evaluate(() => {
    const el = document.activeElement;
    const cs = getComputedStyle(el);
    return { card: el.matches('.feature-card'), clip: cs.clipPath, outline: cs.outlineStyle };
  });
  expect(look.card).toBe(true);
  expect(look.clip).toBe('none');
  expect(look.outline).not.toBe('none');
});

// E2E-HOME-014: keyboard focus in the opening is always visible and never moves the page: every
// stop in the opening keeps the page at the top (desktop), and a focused control is drawn even
// where the opening has faded (phone)
test('focus in the opening is seen and keeps the page still', async ({ browser }) => {
  for (const [width, height] of [[1440, 900], [375, 812]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    await context.addInitScript(() => { try { localStorage.setItem('ai_pet_profile', JSON.stringify({ firstVisit: false })); } catch (e) {} });
    const page = await context.newPage();
    await page.goto('/#/');
    await expect(page.locator('#hero-now')).toBeVisible();
    await page.waitForTimeout(1500);
    const seen = [];
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const stop = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || !el.closest('.home-hero')) return null;
        let o = 1;
        for (let e = el; e && e !== document.body; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity);
        return { id: el.id || el.className, y: window.scrollY, o };
      });
      if (!stop) { if (seen.length) break; continue; }
      seen.push(stop);
    }
    expect(seen.length).toBeGreaterThan(2);
    for (const s of seen) {
      expect(s.o, `${width} ${s.id}`).toBeGreaterThan(0.95);
      if (width > 800) expect(s.y, `${width} ${s.id}`).toBe(0);
    }
    await context.close();
  }
});

// E2E-HOME-015: "Step in" goes straight to the doors (it does not scroll through the story on the
// way), and the bar is already the page's when it lands; it stays "Step in" on every scene, a door's
// scene adding a link to that door beside it
test('step in goes straight to the doors and stays step in', async ({ page }) => {
  await freshPage(page);
  await page.goto('/#/');
  await expect(page.locator('#hero-dots .home-hero__dot[data-go="1"]')).toBeVisible();
  await page.locator('#hero-dots .home-hero__dot[data-go="1"]').click();
  await expect(page.locator('#hero-door')).toBeVisible();
  await expect(page.locator('#hero-door')).toHaveAttribute('href', /#\/journey\//);
  await expect(page.locator('#hero-enter')).toHaveAttribute('href', '#atlas');
  await expect(page.locator('#hero-enter')).toHaveText('推门');
  const seen = [];
  await page.exposeFunction('seenY', (y) => seen.push(y));
  await page.evaluate(() => window.addEventListener('scroll', () => window.seenY(window.scrollY), { passive: true }));
  await page.locator('#hero-enter').click();
  await expect.poll(() => page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('atlas');
  await expect(page.locator('body')).toHaveAttribute('data-scrolled', '');
  const th = await page.evaluate(() => { const el = document.getElementById('home-threshold'); return [el.offsetTop, el.offsetTop + el.offsetHeight - window.innerHeight]; });
  expect(seen.filter((y) => y > th[0] + 40 && y < th[1] - 40)).toEqual([]);
});

// E2E-HOME-016: switching language keeps the visitor's pause and the scene they picked
test('language switch keeps the pause and the scene', async ({ page }) => {
  await freshPage(page);
  await page.goto('/#/');
  await expect(page.locator('#hero-pause')).toBeVisible();
  await page.locator('#hero-pause').click();
  await page.locator('#hero-dots .home-hero__dot[data-go="1"]').click();
  await expect(page.locator('.home-hero__img.is-active')).toHaveAttribute('data-scene', '1');
  await page.locator('#nav-lang').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#hero-pause')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#hero-dots .home-hero__dot[data-go="1"]')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.home-hero__img.is-active')).toHaveAttribute('data-scene', '1');
  await page.waitForTimeout(7500);
  await expect(page.locator('.home-hero__img.is-active')).toHaveAttribute('data-scene', '1');
});

// E2E-HOME-017: the wall's light comes from the doors' clocks: a door opening within three hours is
// warm and (among the five soonest) says when; closed doors carry their realm's colour, not grey
test('doors opening soon are warm and say when', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'zh-CN' });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-10-19T11:05:00Z')); // Edinburgh's gun fires at 13:00 there
  await page.goto('/#/');
  const gun = page.locator('#atlas-grid .door[data-no="47"]');
  await expect(gun).toHaveAttribute('data-soon', '');
  await expect(gun.locator('.door__soon')).toHaveText('55 分钟后');
  expect(await page.locator('#atlas-grid .door__soon').count()).toBeLessThanOrEqual(5);
  await page.locator('#atlas').scrollIntoViewIfNeeded();
  const closed = page.locator('#atlas-grid .door.is-found[data-open="false"]:not([data-soon]) .door__arch').first();
  await expect.poll(() => closed.evaluate((el) => getComputedStyle(el).backgroundBlendMode)).toContain('color');
  await context.close();
});

// E2E-HOME-018: coming back from a door, the page is where it was: the opening does not arrive
// again and the count does not climb again
test('back from a door does not replay the arrival', async ({ page }) => {
  await freshPage(page);
  await page.goto('/#/');
  await page.locator('#atlas').scrollIntoViewIfNeeded();
  await expect(page.locator('#atlas-found')).toHaveText('48');
  const door = page.locator('#atlas-grid .door.is-found a').nth(3);
  await door.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await door.click();
  await expect(page.locator('.detail-hero__title')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#atlas-grid .door.is-found')).not.toHaveCount(0);
  await expect(page.locator('.home-hero')).not.toHaveClass(/is-booting/);
  expect(await page.locator('#atlas-found').textContent()).toBe('48');
  await expect(page.locator('#atlas-grid')).toHaveClass(/is-lit/);
});

// E2E-HOME-022: the threshold scrolls without shifting the layout, the opening keeps the arch's
// half-circle top, and when its light has settled the doors' heading is already on screen
test('the threshold opens onto the doors without a blank screen', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => { try { localStorage.setItem('ai_pet_profile', JSON.stringify({ firstVisit: false })); } catch (e) {} });
  const page = await context.newPage();
  await page.goto('/#/');
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    window.__cls = 0;
    new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: false });
  });
  const span = await page.evaluate(() => { const th = document.getElementById('home-threshold'); return [th.offsetTop, th.offsetHeight - window.innerHeight]; });
  for (let p = 0; p <= 1.0001; p += 0.05) {
    await page.evaluate((y) => window.scrollTo(0, y), Math.round(span[0] + p * span[1]));
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__cls)).toBeLessThan(0.02);
  const look = await page.evaluate(() => {
    const open = getComputedStyle(document.querySelector('.home-threshold__open'));
    const r = document.getElementById('atlas-title').getBoundingClientRect();
    return { radius: open.borderTopLeftRadius, width: parseFloat(open.width), top: r.top, bottom: r.bottom };
  });
  expect(Math.abs(parseFloat(look.radius) - look.width / 2)).toBeLessThan(1);
  expect(look.bottom).toBeLessThan(900);
  await context.close();
});

// E2E-HOME-023: an open door keeps its light when it is pointed at or chosen (the hover adds a lift,
// it never puts the lamp out), and its seam of light shows
test('an open door keeps its light when pointed at', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'zh-CN' });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-10-20T06:00:00Z'));
  await page.goto('/#/');
  const lit = page.locator('#atlas-grid .door.is-found[data-open="true"]').first();
  await lit.scrollIntoViewIfNeeded();
  await expect(page.locator('#atlas-grid')).toHaveClass(/is-lit/);
  // after the wall's first light has played
  await lit.locator('.door__link').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished.catch(() => {}))));
  const glow = () => lit.locator('.door__link').evaluate((el) => getComputedStyle(el).boxShadow);
  expect(await glow()).toContain('40px');
  await lit.hover();
  await page.waitForTimeout(400);
  expect(await glow()).toContain('40px');
  expect(Number(await lit.locator('.door__seam').evaluate((el) => getComputedStyle(el).opacity))).toBeGreaterThan(0.8);
  await context.close();
});

// E2E-HOME-024: the opening loads one picture, the one for the screen's shape (the preload and the
// picture's sources agree): the landscape prologue on a desktop, its upright crops on a phone and a
// tablet held upright
test('the opening loads one picture for the screen', async ({ browser }) => {
  for (const [width, height, want] of [[1440, 900, /^hero-taoyuan\.\d+\.avif$/], [390, 844, /^hero-taoyuan-phone\.\d+\.avif$/], [768, 1024, /^hero-taoyuan-tablet\.\d+\.avif$/]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const got = [];
    page.on('response', (r) => { if (/hero-taoyuan/.test(r.url())) got.push(r.url().split('/').pop().split('?')[0]); });
    await page.goto('/');
    await expect(page.locator('.home-hero__slides img.is-active')).toBeVisible();
    await page.waitForLoadState('networkidle');
    const shown = await page.evaluate(() => document.querySelector('.home-hero__slides img.is-active').currentSrc.split('/').pop());
    expect(shown, `${width}`).toMatch(want);
    expect([...new Set(got)], `${width}`).toEqual([shown]);
    await context.close();
  }
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
