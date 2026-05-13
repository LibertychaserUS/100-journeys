var Pages = window.Pages || {};

Pages.Register = {
  render() {
    const main = document.getElementById('main-content');
    if (!main) return;

    main.innerHTML = `
      <section class="auth-page">
        <div class="auth-card">
          <h1 class="auth-title">注册</h1>
          <p class="auth-subtitle">开启你的100种不可思议旅行</p>

          <form class="auth-form" id="register-form">
            <div class="auth-field">
              <label for="reg-username">用户名</label>
              <input type="text" id="reg-username" required placeholder="2-30位字符" minlength="2" maxlength="30" />
            </div>
            <div class="auth-field">
              <label for="reg-email">邮箱</label>
              <input type="email" id="reg-email" required placeholder="your@email.com" />
            </div>
            <div class="auth-field">
              <label for="reg-password">密码</label>
              <input type="password" id="reg-password" required placeholder="至少6位字符" minlength="6" />
            </div>
            <button type="submit" class="auth-submit">注册</button>
          </form>

          <p class="auth-switch">
            已有账号？<a href="#/login">立即登录</a>
          </p>

          <p class="auth-error" id="register-error"></p>
        </div>
      </section>
    `;

    const form = document.getElementById('register-form');
    const errorEl = document.getElementById('register-error');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.textContent = '';

      const username = document.getElementById('reg-username').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;

      try {
        const res = await API.register({ username, email, password });
        const data = res.data || res;
        if (data.token) {
          API.setToken(data.token);
          if (window.App && window.App.updateNav) window.App.updateNav();
          Router.navigate('#/');
        }
      } catch (err) {
        errorEl.textContent = err.message || '注册失败，邮箱可能已被使用';
      }
    });
  },
};
