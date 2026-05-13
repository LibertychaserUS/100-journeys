const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  
  await page.goto('http://localhost:8090');
  await page.evaluate(() => {
    localStorage.setItem('ai-pet-profile', JSON.stringify({ name: '小旅', type: 'dog', firstVisit: false }));
  });
  
  await page.goto('http://localhost:8090');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/screenshot-home2.png' });
  
  await page.goto('http://localhost:8090/#/explore');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/screenshot-explore2.png' });
  
  await page.goto('http://localhost:8090/#/journey/bolivia-salt-flat-trek');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/screenshot-detail2.png' });
  
  await browser.close();
  console.log('done');
})();
