const { expect } = require('@playwright/test');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** Skip nothing the user would see, but keep tests independent of a previous pet session. */
async function freshPage(page) {
  await page.addInitScript(() => {
    try { localStorage.setItem('ai_pet_profile', JSON.stringify({ firstVisit: false })); } catch (e) {}
  });
}

async function solveCaptcha(page, prefix) {
  const question = page.locator(`#${prefix}-captcha-q`);
  await expect(question).toHaveText(/\d+\s*[+-]\s*\d+/);
  const text = (await question.textContent()) || '';
  const match = text.match(/(-?\d+)\s*([+-])\s*(-?\d+)/);
  if (!match) throw new Error(`Cannot parse captcha question: ${text}`);
  const answer = match[2] === '+' ? Number(match[1]) + Number(match[3]) : Number(match[1]) - Number(match[3]);
  await page.locator(`#${prefix}-captcha`).fill(String(answer));
}

async function expectSignedIn(page) {
  await expect(page.locator('body')).toHaveAttribute('data-auth', 'user', { timeout: 10000 });
  await expect(page.locator('#nav-wallet')).toBeVisible();
}

async function registerAndLogin(page, options = {}) {
  const ts = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = options.email || `${options.prefix || 'user'}${ts}@example.com`;
  const username = options.username || `${options.prefix || 'user'}${ts}`.slice(0, 30);
  const password = options.password || 'Password123';

  await page.goto(options.next ? `/#/register?next=${encodeURIComponent(options.next)}` : '/#/register');
  await page.locator('#reg-username').fill(username);
  await page.locator('#reg-email').fill(email);
  await page.locator('#reg-password').fill(password);
  await page.locator('#reg-gender').selectOption(options.gender || 'prefer_not_to_say');
  await solveCaptcha(page, 'reg');
  await page.locator('#register-form button[type="submit"]').click();

  await expect(page).toHaveURL(options.next ? new RegExp(`#${escapeRegex(options.next)}`) : /#\/$/);
  await expectSignedIn(page);
  return { email, password, username };
}

async function login(page, email, password = 'Password123') {
  await page.goto('/#/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await solveCaptcha(page, 'login');
  await page.locator('#login-form button[type="submit"]').click();
  await expect(page).toHaveURL(/#\/$/);
  await expectSignedIn(page);
}

async function logout(page) {
  if (await page.locator('#nav-user').isVisible()) {
    await page.locator('#nav-user').click();
    await page.locator('#nav-logout').click();
  } else {
    await page.locator('#nav-menu').click();
    await page.locator('#drawer-logout').click();
  }
  await expect(page.locator('body')).toHaveAttribute('data-auth', 'guest');
  await expect(page.locator('#nav-login')).toBeVisible();
}

/** Top up through the recharge page; returns after the wallet in the nav shows the new balance. */
async function recharge(page, amount) {
  await page.goto('/#/recharge');
  await expect(page.locator('.recharge-tier[data-amount]')).not.toHaveCount(0);
  const tier = page.locator(`.recharge-tier[data-amount="${amount}"]`);
  if (await tier.count()) {
    await tier.click();
  } else {
    await page.locator('.recharge-tier[data-amount="custom"]').click();
    await page.locator('#recharge-custom-input').fill(String(amount));
  }
  const before = await page.locator('#nav-wallet b').textContent();
  await page.locator('#recharge-submit').click();
  await expect(page.locator('#nav-wallet b')).not.toHaveText(before || '');
}

module.exports = { freshPage, solveCaptcha, expectSignedIn, registerAndLogin, login, logout, recharge };
