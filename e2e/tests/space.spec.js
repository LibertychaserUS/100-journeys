const { test, expect } = require('@playwright/test');
const { freshPage, registerAndLogin } = require('./helpers');

const SLUG = 'bolivia-salt-flat-trek';
const token = (page) => page.evaluate(() => localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token'));

test.describe('Find your type → your space', () => {
  test.beforeEach(async ({ page }) => {
    await freshPage(page);
  });

  // E2E-SPACE-001: home invitation → type cards → straight into the space, which shows the reveal and picks
  test('self-select path lands in your space', async ({ page }) => {
    await page.goto('/#/');
    await page.locator('#invite-self').click();
    await expect(page).toHaveURL(/#\/find$/);
    await expect(page.locator('.type-card')).toHaveCount(16);
    await page.locator('.type-card[data-code="INFP"]').click();

    await expect(page).toHaveURL(/#\/space$/);
    await expect(page.locator('.space__head h1')).toContainText('INFP');
    await expect(page.locator('.space__reveal')).toBeVisible();
    await expect(page.locator('#space-picks .journey-card').first()).toBeVisible();
    await expect(page.locator('#space-first')).toBeVisible();
    await expect(page.locator('#nav-space')).toHaveAttribute('aria-current', 'page');

    // Coming back home offers the way back instead of the invitation.
    await page.goto('/#/');
    await expect(page.locator('#invite-space')).toBeVisible();
    await expect(page.locator('#invite-self')).toHaveCount(0);
  });

  // E2E-SPACE-002: the guide's walk shows progress, survives a reload mid-way and ends in a reveal
  test('guide walk resumes after reload and reveals a type', async ({ page }) => {
    await page.goto('/#/');
    await page.locator('#invite-pet').click();
    await expect(page).toHaveURL(/#\/guide$/);
    await page.locator('#guide-start').click();
    await expect(page.locator('.guide__progress')).toHaveAttribute('aria-label', '第 1 步，共 6 步');
    await page.locator('.guide__option[data-key="c"]').click();
    await page.locator('.guide__option[data-key="b"]').click();
    await expect(page.locator('.guide__progress')).toHaveAttribute('aria-label', '第 3 步，共 6 步');

    await page.reload();
    await expect(page.locator('.guide__progress')).toHaveAttribute('aria-label', '第 3 步，共 6 步');
    await page.locator('#guide-back').click();
    await expect(page.locator('.guide__progress')).toHaveAttribute('aria-label', '第 2 步，共 6 步');
    for (const key of ['b', 'b', 'c', 'c', 'a']) await page.locator(`.guide__option[data-key="${key}"]`).click();

    await expect(page.locator('.guide__reveal h1')).toContainText('INFP');
    await page.locator('#guide-enter').click();
    await expect(page).toHaveURL(/#\/space$/);
    await expect(page.locator('.space__head h1')).toContainText('INFP');
  });

  // E2E-SPACE-003: "not sure" on the cards hands over to the guide; an empty space offers both paths
  test('not sure hands over to the guide, and an empty space never dead-ends', async ({ page }) => {
    await page.goto('/#/space');
    await expect(page.locator('.space__empty')).toBeVisible();
    await expect(page.locator('.space__empty a[href="#/find"]')).toBeVisible();
    await page.locator('.space__empty a[href="#/find"]').click();
    await page.locator('#find-unsure').click();
    await expect(page).toHaveURL(/#\/guide$/);
    await expect(page.locator('#guide-start')).toBeVisible();
  });

  // E2E-SPACE-004: a guest's type and fork pick move into the account on sign-up
  test('guest progress merges into the account on sign-up', async ({ page }) => {
    const { data: j } = await (await page.request.get(`/api/journeys/${SLUG}`)).json();
    const option = j.content.choice.options[0];

    await page.goto('/#/find');
    await page.locator('.type-card[data-code="ISTJ"]').click();
    await expect(page).toHaveURL(/#\/space$/);
    await page.goto(`/#/journey/${SLUG}`);
    await page.locator(`.fork__option[data-key="${option.key}"]`).click();
    await page.goto('/#/space');
    await expect(page.locator('#space-keeps')).toContainText(option.keeps);
    await expect(page.locator('.space__guest')).toBeVisible();

    await registerAndLogin(page, { prefix: 'merge', next: '/space' });
    await expect(page.locator('.space__guest')).toHaveCount(0);
    await expect(page.locator('.space__head h1')).toContainText('ISTJ');
    await expect(page.locator('#space-keeps')).toContainText(option.keeps);

    const auth = { headers: { Authorization: `Bearer ${await token(page)}` } };
    await expect.poll(async () => (await (await page.request.get('/api/auth/me', auth)).json()).data.mbti_type).toBe('ISTJ');
    const choices = (await (await page.request.get('/api/auth/choices', auth)).json()).data;
    expect(choices[SLUG]).toBe(option.key);

    // The pick shows on the journey from the account, with the guest copy cleared.
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('guest_state')).choices)).toEqual({});
    await page.goto(`/#/journey/${SLUG}`);
    await expect(page.locator(`.fork__option[data-key="${option.key}"]`)).toHaveAttribute('aria-pressed', 'true');
  });

  // E2E-SPACE-005: the whole path in English
  test('the flow reads in English', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' });
    const page = await context.newPage();
    await freshPage(page);
    await page.goto('/#/');
    await expect(page.locator('#home-invite-title')).toHaveText('Where is your entrance?');
    await page.locator('#invite-self').click();
    await expect(page.locator('.find__head h1')).toHaveText('What kind of traveller are you?');
    await page.locator('.type-card[data-code="ENTP"]').click();
    await expect(page.locator('.space__head h1')).toContainText('Entrances for the Debater');
    await expect(page.locator('#nav-space')).toHaveText('Your space');
    await context.close();
  });

  // E2E-ADMIN-FUNNEL-001: the admin dashboard shows each funnel step with visitors and rate
  test('admin dashboard shows the funnel', async ({ page }) => {
    const me = { id: 1, username: 'admin', email: 'admin@example.com', role: 'admin', balance: 0, points: 0, level: 1 };
    const steps = ['arrive', 'path_pick', 'type_found', 'space_enter', 'entrance_open', 'register'];
    const funnel = steps.map((step, i) => ({ step, visitors: 100 - i * 15, rate: 100 - i * 15 }));
    await page.addInitScript(() => localStorage.setItem('auth_token', 'test-admin'));
    await page.route('**/api/auth/me', (r) => r.fulfill({ json: { data: me, error: null } }));
    await page.route('**/api/admin/users', (r) => r.fulfill({ json: { data: [], error: null } }));
    await page.route('**/api/admin/stats', (r) => r.fulfill({ json: { data: { funnel }, error: null } }));
    await page.goto('/#/admin');
    const panel = page.locator('#admin-funnel');
    await expect(panel.locator('.admin-bar')).toHaveCount(6);
    await expect(panel.locator('[data-step="type_found"]')).toContainText('找到类型');
    await expect(panel.locator('[data-step="type_found"]')).toContainText('70 位访客 · 70%');
  });
});
