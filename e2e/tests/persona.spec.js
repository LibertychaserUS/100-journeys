const { test, expect } = require('@playwright/test');
const { freshPage, registerAndLogin } = require('./helpers');

test.describe('Travel personality', () => {
  test.beforeEach(async ({ page }) => {
    await freshPage(page);
  });

  // E2E-PERSONA-001: the MBTI picked on the profile is stored on the account
  test('picking an MBTI saves it to the account', async ({ page }) => {
    await registerAndLogin(page, { prefix: 'persona' });
    await page.goto('/#/profile?tab=persona');
    await expect(page.locator('#profile-mbti')).toHaveText('未测人格');
    await page.locator('#panel-persona [data-code="INFP"]').click();
    await expect(page.locator('#panel-persona [data-code="INFP"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#profile-mbti')).toContainText('INFP');
    await expect(page.locator('#persona-picks .journey-card[data-slug]')).not.toHaveCount(0);

    await page.reload();
    await expect(page.locator('#profile-mbti')).toContainText('INFP');
  });

  // E2E-PERSONA-002: the guide's walk, started from the guide widget, saves the type when signed in
  test('guide walk saves a personality', async ({ page }) => {
    await registerAndLogin(page, { prefix: 'quiz' });
    await page.locator('#ai-pet-avatar').click();
    await page.locator('#ai-pet-chat [data-pet-action="quiz"]').first().click();
    await expect(page).toHaveURL(/#\/guide$/);
    await expect(page.locator('#ai-pet-chat')).toBeHidden();
    await page.locator('#guide-start').click();
    for (let i = 0; i < 6; i++) await page.locator('.guide__option[data-key="a"]').click();
    await expect(page.locator('.guide__reveal h1')).toBeVisible();
    await page.goto('/#/profile?tab=persona');
    await expect(page.locator('#profile-mbti')).not.toHaveText('未测人格');
  });

  // E2E-PET-001: the guide is a real dialog button and answers recommendations with links
  test('guide recommends journeys', async ({ page }) => {
    await page.goto('/#/');
    const avatar = page.locator('#ai-pet-avatar');
    await expect(avatar).toHaveAttribute('aria-expanded', 'false');
    await avatar.click();
    await expect(page.locator('#ai-pet-chat')).toBeVisible();
    await page.locator('#ai-pet-input').fill('推荐旅行');
    await page.keyboard.press('Enter');
    await page.locator('#ai-pet-chat [data-pet-action="recommend"]').last().click();
    await expect(page.locator('.ai-pet__links a')).not.toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('#ai-pet-chat')).toBeHidden();
    await expect(avatar).toBeFocused();
  });

  // E2E-PET-002: a model reply shows its text and links only to real journeys
  test('guide shows a model reply with journey links', async ({ page }) => {
    await page.route('**/api/ai/chat', async (route) => {
      const body = route.request().postDataJSON();
      expect(body.lang).toBe('zh');
      await route.fulfill({ json: { data: { reply: '天亮前一刻钟，盐沼会把天空借给你。', source: 'deepseek', actions: [{ type: 'recommend', data: { journeys: [{ slug: 'bolivia-salt-flat-trek', title: '镜面 · 乌尤尼盐沼' }] } }] }, error: null } });
    });
    await page.goto('/#/');
    await page.locator('#ai-pet-avatar').click();
    await page.locator('#ai-pet-input').fill('想找个安静的地方');
    await page.keyboard.press('Enter');
    const last = page.locator('#ai-pet-messages .ai-pet__msg--pet').last();
    await expect(last).toContainText('盐沼会把天空借给你');
    await expect(last.locator('a[href="#/journey/bolivia-salt-flat-trek"]')).toHaveText('镜面 · 乌尤尼盐沼');
  });

  // E2E-PET-003: without a model reply the local rules answer in the reader's language
  test('guide falls back to its own rules', async ({ page }) => {
    await page.route('**/api/ai/chat', (route) => route.fulfill({ json: { data: { reply: 'server rules', source: 'mock' }, error: null } }));
    await page.goto('/#/');
    await page.locator('#ai-pet-avatar').click();
    await page.locator('#ai-pet-input').fill('推荐旅行');
    await page.keyboard.press('Enter');
    await expect(page.locator('#ai-pet-chat [data-pet-action="recommend"]').last()).toBeVisible();
    await expect(page.locator('#ai-pet-messages')).not.toContainText('server rules');
    await expect(page.locator('.ai-pet__typing')).toHaveCount(0);
  });

  // E2E-PET-004: a rate-limited guide (429 from the edge) answers from its own rules
  test('guide falls back when rate limited', async ({ page }) => {
    await page.route('**/api/ai/chat', (route) => route.fulfill({ status: 429, json: { data: null, error: 'too many requests' } }));
    await page.goto('/#/');
    await page.locator('#ai-pet-avatar').click();
    await page.locator('#ai-pet-input').fill('推荐旅行');
    await page.keyboard.press('Enter');
    await expect(page.locator('#ai-pet-chat [data-pet-action="recommend"]').last()).toBeVisible();
    await expect(page.locator('.ai-pet__typing')).toHaveCount(0);
    await expect(page.locator('#ai-pet-messages')).not.toContainText('too many requests');
  });
});
