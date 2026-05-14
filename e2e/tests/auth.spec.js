const { test, expect } = require('@playwright/test');
const { login, logout, registerAndLogin, solveCaptcha } = require('./helpers');

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
    await registerAndLogin(page, { prefix: 'testuser' });
    await expect(page.locator('.home-hero__title')).toBeVisible();
  });

  test('login with valid credentials', async ({ page }) => {
    const { email, password } = await registerAndLogin(page, { prefix: 'logintest' });
    await logout(page);
    await login(page, email, password);
  });

  test('login with wrong password shows error', async ({ page }) => {
    await page.goto('/#/login');
    await page.locator('#login-email').fill('wrong@example.com');
    await page.locator('#login-password').fill('Wrongpass123');
    await solveCaptcha(page, 'login');
    await page.locator('#login-form').locator('button[type="submit"]').click();

    await expect(page.locator('#login-error')).not.toHaveText('');
  });

  test('nav shows logout when logged in', async ({ page }) => {
    await registerAndLogin(page, { prefix: 'navtest' });
    await expect(page.locator('#nav-logout')).toBeVisible();
    await expect(page.locator('#nav-login')).toBeHidden();
    await expect(page.locator('#nav-register')).toBeHidden();
  });

  test('logout clears auth state', async ({ page }) => {
    await registerAndLogin(page, { prefix: 'logouttest' });
    await logout(page);
  });

  test('profile link navigates to profile', async ({ page }) => {
    await registerAndLogin(page, { prefix: 'profiletest' });
    await page.locator('#nav-profile').click();
    await expect(page).toHaveURL(/#\/profile/);
    await expect(page.locator('.profile-name')).toBeVisible();
  });
});
