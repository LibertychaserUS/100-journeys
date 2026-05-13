const { test, expect } = require('@playwright/test');

test.describe('Auth Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ai_pet_profile', JSON.stringify({ firstVisit: false, name: '小旅', type: 'dog' }));
    });
  });

  test('register page loads with form', async ({ page }) => {
    await page.goto('/#/register');
    await expect(page.locator('.auth-title')).toContainText('注册');
    await expect(page.locator('#register-form')).toBeVisible();
    await expect(page.locator('#reg-username')).toBeVisible();
    await expect(page.locator('#reg-email')).toBeVisible();
    await expect(page.locator('#reg-password')).toBeVisible();
  });

  test('login page loads with form', async ({ page }) => {
    await page.goto('/#/login');
    await expect(page.locator('.auth-title')).toContainText('登录');
    await expect(page.locator('#login-form')).toBeVisible();
    await expect(page.locator('#login-email')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();
  });

  test('register creates account and redirects', async ({ page }) => {
    await page.goto('/#/register');
    const ts = Date.now();
    const uniqueEmail = `test${ts}@example.com`;
    await page.locator('#reg-username').fill(`testuser${ts}`);
    await page.locator('#reg-email').fill(uniqueEmail);
    await page.locator('#reg-password').fill('password123');
    await page.locator('#register-form').locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/#\/$/);
    await expect(page.locator('.home-hero__title')).toBeVisible();
  });

  test('login with valid credentials', async ({ page }) => {
    // First register
    await page.goto('/#/register');
    const ts = Date.now();
    const email = `login${ts}@example.com`;
    await page.locator('#reg-username').fill(`logintest${ts}`);
    await page.locator('#reg-email').fill(email);
    await page.locator('#reg-password').fill('password123');
    await page.locator('#register-form').locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/#\/$/);

    // Then logout and login
    await page.locator('#nav-logout').click();
    await page.goto('/#/login');
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill('password123');
    await page.locator('#login-form').locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/#\/$/);
  });

  test('login with wrong password shows error', async ({ page }) => {
    await page.goto('/#/login');
    await page.locator('#login-email').fill('wrong@example.com');
    await page.locator('#login-password').fill('wrongpass');
    await page.locator('#login-form').locator('button[type="submit"]').click();

    await expect(page.locator('#login-error')).not.toHaveText('');
  });

  test('nav shows logout when logged in', async ({ page }) => {
    await page.goto('/#/register');
    const ts = Date.now();
    const email = `nav${ts}@example.com`;
    await page.locator('#reg-username').fill(`navtest${ts}`);
    await page.locator('#reg-email').fill(email);
    await page.locator('#reg-password').fill('password123');
    await page.locator('#register-form').locator('button[type="submit"]').click();

    await expect(page.locator('#nav-logout')).toBeVisible();
    await expect(page.locator('#nav-login')).toBeHidden();
    await expect(page.locator('#nav-register')).toBeHidden();
  });

  test('logout clears auth state', async ({ page }) => {
    await page.goto('/#/register');
    const ts = Date.now();
    const email = `logout${ts}@example.com`;
    await page.locator('#reg-username').fill(`logouttest${ts}`);
    await page.locator('#reg-email').fill(email);
    await page.locator('#reg-password').fill('password123');
    await page.locator('#register-form').locator('button[type="submit"]').click();

    await page.locator('#nav-logout').click();
    await expect(page.locator('#nav-login')).toBeVisible();
    await expect(page.locator('#nav-register')).toBeVisible();
  });

  test('profile link navigates to profile', async ({ page }) => {
    await page.goto('/#/register');
    const ts = Date.now();
    const email = `profile${ts}@example.com`;
    await page.locator('#reg-username').fill(`profiletest${ts}`);
    await page.locator('#reg-email').fill(email);
    await page.locator('#reg-password').fill('password123');
    await page.locator('#register-form').locator('button[type="submit"]').click();

    await page.locator('#nav-profile').click();
    await expect(page).toHaveURL(/#\/profile/);
    await expect(page.locator('.profile-name')).toBeVisible();
  });
});
