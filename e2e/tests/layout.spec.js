const { test, expect } = require('@playwright/test');
const { textProblems } = require('./text-layout');

const PAGES = ['/#/', '/#/explore', '/#/journey/antarctica-port-lockroy', '/#/station'];

// Walk a page top to bottom (lazy sections render on the way) and collect what reads as broken,
// plus any sideways scroll.
async function sweep(browser, lang, width) {
  const context = await browser.newContext({
    viewport: { width, height: width > 800 ? 900 : 812 }, reducedMotion: 'reduce', locale: lang === 'en' ? 'en-US' : 'zh-CN',
  });
  await context.addInitScript((l) => {
    try { localStorage.setItem('lang', l); localStorage.setItem('ai_pet_profile', JSON.stringify({ firstVisit: false })); } catch (e) {}
  }, lang);
  const page = await context.newPage();
  const found = [];
  for (const url of PAGES) {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const height = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < height; y += Math.round(page.viewportSize().height * 0.8)) {
      await page.evaluate((v) => scrollTo(0, v), y);
      await page.waitForTimeout(150);
      for (const p of await textProblems(page)) found.push(`${url} @${width}: ${p}`);
    }
    // nothing pushes the page wider than the screen
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (over > 1) found.push(`${url} @${width}: page scrolls sideways by ${over}px`);
  }
  await context.close();
  return [...new Set(found)];
}

test.describe('Text layout', () => {
  test.describe.configure({ timeout: 120000 });

  // E2E-LAYOUT-001: English (longer words, longer lines) never breaks a word, stacks text on text,
  // squeezes a column to a word per line or scrolls sideways, on desktop, laptop, tablet and phone
  test('english text is never broken, stacked or squeezed', async ({ browser }) => {
    const problems = [];
    for (const width of [1440, 1024, 768, 375]) problems.push(...await sweep(browser, 'en', width));
    expect(problems).toEqual([]);
  });

  // E2E-LAYOUT-002: the same for Chinese, on desktop, laptop and phone
  test('chinese text is never broken, stacked or squeezed', async ({ browser }) => {
    const problems = [];
    for (const width of [1440, 1024, 375]) problems.push(...await sweep(browser, 'zh', width));
    expect(problems).toEqual([]);
  });
});
