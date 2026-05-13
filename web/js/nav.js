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
    this.el.innerHTML = `
      <div class="nav">
        <a href="#/" class="nav__logo">100种不可思议的旅行</a>
        <div class="nav__links" id="nav-links">
          <a href="#/explore" class="nav__link">探索</a>
          <a href="#/profile" class="nav__link" id="nav-profile" style="display:none;">我的</a>
          <a href="#/login" class="nav__link" id="nav-login">登录</a>
          <a href="#/register" class="nav__link" id="nav-register">注册</a>
          <span class="nav__user" id="nav-user" style="display:none;"></span>
          <button class="nav__link" id="nav-logout" style="display:none;">退出</button>
        </div>
      </div>
    `;

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
    const userEl = document.getElementById('nav-user');
    const logoutBtn = document.getElementById('nav-logout');
    if (!loginLink) return;

    if (API.isLoggedIn()) {
      loginLink.style.display = 'none';
      registerLink.style.display = 'none';
      profileLink.style.display = '';
      logoutBtn.style.display = '';

      try {
        const res = await API.me();
        const user = res.data || res;
        userEl.style.display = '';
        userEl.textContent = (user.username || user.email) + ' · ' + (user.balance ?? 0).toLocaleString() + '币';
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
};

// Expose updateNav globally so login/register pages can refresh nav
window.App = window.App || {};
window.App.updateNav = () => Nav.updateAuth();

window.addEventListener('DOMContentLoaded', () => Nav.init());
