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
});
