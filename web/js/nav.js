/**
 * nav.js — Builds and updates the main navigation bar.
 */

const Nav = {
  init() {
    this.el = document.getElementById('main-nav');
    if (!this.el) return;
    this.render();
    this.updateAuth();
  },

  render() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const currentTheme = savedTheme || (prefersDark ? 'dark' : 'light');
    this._themeIcon = currentTheme === 'dark' ? '☀' : '☾';

    this.el.innerHTML = `
      <div class="nav">
        <a href="#/" class="nav__logo" aria-label="桃源百旅首页">
          <img class="nav__logo-mark" src="/static/assets/images/generated/brand-mark.png" alt="" aria-hidden="true">
          <span class="nav__logo-text">桃源百旅</span>
        </a>
        <div class="nav__links" id="nav-links">
          <a href="#/explore" class="nav__link">探索</a>
          <a href="#/profile" class="nav__link" id="nav-profile" style="display:none;">清单</a>
          <a href="#/admin" class="nav__link" id="nav-admin" style="display:none;">管理</a>
          <a href="#/login" class="nav__link" id="nav-login">登录</a>
          <a href="#/register" class="nav__link nav__link--ghost" id="nav-register">注册</a>
          <a href="#/profile" class="nav__user" id="nav-user" style="display:none;" aria-label="账户状态"></a>
          <button class="nav__link" id="nav-logout" style="display:none;">退出</button>
          <button class="nav__theme-toggle" id="nav-theme" title="切换主题">${this._themeIcon}</button>
        </div>
      </div>
    `;

    // Theme toggle
    const themeBtn = document.getElementById('nav-theme');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const html = document.documentElement;
        const isDark = html.getAttribute('data-theme') === 'dark';
        const next = isDark ? 'light' : 'dark';
        html.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        themeBtn.textContent = next === 'dark' ? '☀' : '☾';
      });
    }

    // Logout handler
    const logoutBtn = document.getElementById('nav-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        API.clearToken();
        this.updateAuth();
        Router.navigate('#/');
      });
    }
  },

  async updateAuth() {
    const loginLink = document.getElementById('nav-login');
    const registerLink = document.getElementById('nav-register');
    const profileLink = document.getElementById('nav-profile');
    const adminLink = document.getElementById('nav-admin');
    const userEl = document.getElementById('nav-user');
    const logoutBtn = document.getElementById('nav-logout');
    if (!loginLink) return;

    // Reset
    adminLink.style.display = 'none';

    if (API.isLoggedIn()) {
      loginLink.style.display = 'none';
      registerLink.style.display = 'none';
      profileLink.style.display = '';
      logoutBtn.style.display = '';

      try {
        const res = await API.me();
        const user = res.data || res;
        userEl.style.display = '';
        const avatar = this._escapeHtml(user.avatar_url || '/static/assets/images/generated/guide-light.png');
        const name = this._escapeHtml(user.username || user.email || '旅人');
        userEl.innerHTML = `
          <img class="nav__avatar" src="${avatar}" alt="" aria-hidden="true">
          <span class="nav__user-name">${name}</span>
          <span class="nav__wallet">${(user.balance ?? 0).toLocaleString()}币</span>
          <span class="nav__points">${(user.points ?? 0).toLocaleString()}积分</span>
        `;
        if (user.role === 'admin') {
          adminLink.style.display = '';
        }
      } catch {
        userEl.style.display = 'none';
      }
    } else {
      loginLink.style.display = '';
      registerLink.style.display = '';
      profileLink.style.display = 'none';
      userEl.style.display = 'none';
      logoutBtn.style.display = 'none';
    }
  },

  _escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
};

// Expose updateNav globally so login/register pages can refresh nav
window.App = window.App || {};
window.App.updateNav = () => Nav.updateAuth();

window.addEventListener('DOMContentLoaded', () => Nav.init());
