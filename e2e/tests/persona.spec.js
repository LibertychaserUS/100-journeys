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

  // E2E-PERSONA-002: the guide's quiz produces a type and saves it when signed in
  test('guide quiz saves a personality', async ({ page }) => {
    await registerAndLogin(page, { prefix: 'quiz' });
    await page.goto('/#/profile?tab=persona');
    await page.locator('[data-action="quiz"]').click();
    const chat = page.locator('#ai-pet-chat');
    await expect(chat).toBeVisible();
    for (let i = 0; i < 5; i++) {
      const option = chat.locator('.ai-pet__msg:last-child .ai-pet__quiz-option').first();
      await expect(option).toBeEnabled();
      await option.click();
    }
    await expect(chat).toContainText('测试完成');
    await expect(chat).toContainText('已经保存到你的账户');
    await page.reload();
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
});
