const { test, expect } = require('@playwright/test');
const { freshPage, login, logout, registerAndLogin, solveCaptcha } = require('./helpers');

test.describe('Auth Flow', () => {
  test.beforeEach(async ({ page }) => {
    await freshPage(page);
  });

  test('register page loads with form', async ({ page }) => {
    await page.goto('/#/register');
    await expect(page.locator('.auth-title')).toHaveText('创建账号');
    for (const id of ['#reg-username', '#reg-email', '#reg-password', '#reg-gender']) {
      await expect(page.locator(id)).toBeVisible();
    }
    // Every field has a programmatic label
    await expect(page.getByLabel('用户名')).toBeVisible();
    await expect(page.getByLabel('验证码')).toBeVisible();
  });

  test('login page loads with form', async ({ page }) => {
    await page.goto('/#/login');
    await expect(page.locator('.auth-title')).toHaveText('欢迎回来');
    await expect(page.getByLabel('邮箱')).toBeVisible();
    await expect(page.getByLabel('密码', { exact: true })).toBeVisible();
  });

  test('register creates account and redirects home', async ({ page }) => {
    await registerAndLogin(page, { prefix: 'testuser' });
    await expect(page.locator('.home-hero__title')).toBeVisible();
  });

  test('register validates fields before submitting', async ({ page }) => {
    await page.goto('/#/register');
    await page.locator('#reg-username').fill('ok_name');
    await page.locator('#reg-email').fill('not-an-email');
    await page.locator('#reg-password').fill('short');
    await page.locator('#register-form button[type="submit"]').click();
    await expect(page.locator('#reg-email-error')).toHaveText('请输入有效的邮箱地址。');
    await expect(page.locator('#reg-password-error')).toContainText('8–72');
    await expect(page.locator('#reg-gender-error')).toBeVisible();
    await expect(page.locator('#reg-email')).toBeFocused();
  });

  test('login with valid credentials', async ({ page }) => {
    const { email, password } = await registerAndLogin(page, { prefix: 'logintest' });
    await logout(page);
    await login(page, email, password);
  });

  // Regression: errors used to read "HTTP 401"
  test('login with wrong password shows a readable error', async ({ page }) => {
    await page.goto('/#/login');
    await page.locator('#login-email').fill('wrong@example.com');
    await page.locator('#login-password').fill('Wrongpass123');
    await solveCaptcha(page, 'login');
    await page.locator('#login-form button[type="submit"]').click();
    await expect(page.locator('#login-error')).toHaveText('邮箱或密码不正确，请重新输入。');
    await expect(page.locator('#login-error-box')).toBeFocused();
    await expect(page.locator('#login-captcha')).toHaveValue(''); // fresh captcha issued
  });

  test('wrong captcha is reported on the captcha field', async ({ page }) => {
    await page.goto('/#/login');
    await page.locator('#login-email').fill('someone@example.com');
    await page.locator('#login-password').fill('Password123');
    await expect(page.locator('#login-captcha-q')).toHaveText(/\d/);
    await page.locator('#login-captcha').fill('-999');
    await page.locator('#login-form button[type="submit"]').click();
    await expect(page.locator('#login-captcha-error')).toContainText('验证码');
  });

  test('nav shows the account menu when logged in', async ({ page }) => {
    await registerAndLogin(page, { prefix: 'navtest' });
    await expect(page.locator('#nav-user')).toBeVisible();
    await expect(page.locator('#nav-login')).toHaveCount(0);
    await page.locator('#nav-user').click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.locator('#nav-user')).toBeFocused();
  });

  test('logout clears auth state', async ({ page }) => {
    await registerAndLogin(page, { prefix: 'logouttest' });
    await logout(page);
    expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toBeNull();
  });

  test('profile link navigates to profile', async ({ page }) => {
    await registerAndLogin(page, { prefix: 'profiletest' });
    if (await page.locator('#nav-user').isVisible()) {
      await page.locator('#nav-user').click();
      await page.locator('#nav-profile').click();
    } else {
      await page.locator('#nav-menu').click();
      await page.locator('#nav-drawer a[href="#/profile"]').click();
    }
    await expect(page).toHaveURL(/#\/profile/);
    await expect(page.locator('.profile-name')).not.toHaveText('加载中…');
  });

  test('logging in from a protected page returns to it', async ({ page }) => {
    const { email, password } = await registerAndLogin(page, { prefix: 'nexttest' });
    await logout(page);
    await page.goto('/#/profile');
    await expect(page).toHaveURL(/#\/login\?next=%2Fprofile/);
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill(password);
    await solveCaptcha(page, 'login');
    await page.locator('#login-form button[type="submit"]').click();
    await expect(page).toHaveURL(/#\/profile$/);
  });
});
