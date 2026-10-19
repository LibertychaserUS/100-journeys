// Which characters each page renders in the story font, at each weight, in both languages.
// Output feeds scripts/fonts/build.py (see there). Needs Playwright (the e2e folder has it):
//   NODE_PATH=e2e/node_modules node scripts/fonts/measure.cjs http://localhost:8080 > scripts/fonts/usage.json
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const base = (process.argv[2] || 'http://localhost:8080').replace(/\/$/, '') + '/';
const slugs = fs.readdirSync(path.join(__dirname, '../../internal/content/entrances'))
  .filter((f) => f.endsWith('.json')).map((f) => f.replace(/^\d+-/, '').replace(/\.json$/, '')).sort();
const routes = ['#/', '#/explore', '#/station', '#/about', '#/find', '#/space', '#/login', '#/register', '#/compose', '#/guide',
  ...slugs.map((s) => `#/journey/${s}`)];

(async () => {
  const browser = await chromium.launch();
  const result = {};
  for (const lang of ['zh', 'en']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: lang === 'zh' ? 'zh-CN' : 'en-US' });
    await ctx.addInitScript((l) => { try { localStorage.setItem('lang', l); } catch {} }, lang);
    const page = await ctx.newPage();
    for (const r of routes) {
      await page.goto(base + r, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      // walk down once so sections that render on scroll are there
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise((res) => setTimeout(res, 60)); }
        scrollTo(0, 0);
      });
      await page.waitForTimeout(300);
      result[`${lang} ${r}`] = await page.evaluate(() => {
        const acc = { 400: new Set(), 700: new Set() };
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walker.nextNode())) {
          const el = n.parentElement;
          if (!el || !n.data.trim()) continue;
          const cs = getComputedStyle(el);
          if (!/Story Serif/.test(cs.fontFamily.split(',').slice(0, 6).join(','))) continue;
          const k = Number(cs.fontWeight) >= 600 ? 700 : 400;
          for (const ch of n.data) acc[k].add(ch);
        }
        return { 400: [...acc[400]].sort().join(''), 700: [...acc[700]].sort().join('') };
      });
    }
    await ctx.close();
  }
  process.stdout.write(JSON.stringify(result, null, 0) + '\n');
  await browser.close();
})();
