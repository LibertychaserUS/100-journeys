const { expect } = require('@playwright/test');

async function solveCaptcha(page, prefix) {
  const question = page.locator(`#${prefix}-captcha-q`);
  await expect(question).not.toContainText('加载中');
  await expect(question).not.toContainText('加载失败');
  const text = (await question.textContent()) || '';
  const match = text.match(/(-?\d+)\s*([+-])\s*(-?\d+)/);
  if (!match) throw new Error(`Cannot parse captcha question: ${text}`);
  const left = Number(match[1]);
  const right = Number(match[3]);
  const answer = match[2] === '+' ? left + right : left - right;
  await page.locator(`#${prefix}-captcha`).fill(String(answer));
}

async function registerAndLogin(page, options = {}) {
  const ts = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = options.email || `${options.prefix || 'user'}${ts}@example.com`;
  const username = options.username || `${options.prefix || 'user'}${ts}`.slice(0, 30);
  const password = options.password || 'Password123';

  await page.goto('/#/register');
  await page.locator('#reg-username').fill(username);
  await page.locator('#reg-email').fill(email);
  await page.locator('#reg-password').fill(password);
  await page.locator('#reg-gender').selectOption(options.gender || 'prefer_not_to_say');
  await solveCaptcha(page, 'reg');
  await page.locator('#register-form').locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator('#nav-logout')).toBeVisible({ timeout: 10000 });
  return { email, password, username };
}

async function login(page, email, password = 'Password123') {
  await page.goto('/#/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await solveCaptcha(page, 'login');
  await page.locator('#login-form').locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator('#nav-logout')).toBeVisible({ timeout: 10000 });
}

async function logout(page) {
  await page.locator('#nav-logout').click();
  await expect(page.locator('#nav-login')).toBeVisible();
  await expect(page.locator('#nav-register')).toBeVisible();
}

module.exports = {
  login,
  logout,
  registerAndLogin,
  solveCaptcha,
};
