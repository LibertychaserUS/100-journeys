var Pages = window.Pages || {};

Pages.AdminLogin = {
  render() {
    const main = document.getElementById('main-content');
    if (!main) return;

    main.innerHTML = `
      <section class="auth-page auth-page--admin">
        <div class="auth-card auth-card--admin">
          <p class="auth-kicker">restricted access</p>
          <h1 class="auth-title">后台入口</h1>
          <p class="auth-subtitle">仅限已授权管理员。普通用户请返回首页。</p>

          <form class="auth-form" id="admin-login-form">
            <div class="auth-field">
              <label for="admin-login-email">邮箱</label>
              <input type="email" id="admin-login-email" required autocomplete="username" placeholder="admin@example.com" />
            </div>
            <div class="auth-field">
              <label for="admin-login-password">密码</label>
              <input type="password" id="admin-login-password" required autocomplete="current-password" placeholder="后台密码" minlength="8" />
            </div>
            <div class="auth-field captcha-field">
              <label for="admin-login-captcha">验证码</label>
              <div class="captcha-row">
                <input type="text" id="admin-login-captcha" required placeholder="输入答案" />
                <span class="captcha-question" id="admin-login-captcha-q">加载中...</span>
                <button type="button" class="captcha-refresh" id="admin-login-captcha-refresh" title="换一题">↻</button>
              </div>
              <input type="hidden" id="admin-login-captcha-id" />
            </div>
            <button type="submit" class="auth-submit">进入后台</button>
          </form>

          <p class="auth-switch auth-switch--muted">
            没有后台权限？<a href="#/">返回首页</a>
          </p>

          <p class="auth-error" id="admin-login-error"></p>
        </div>
      </section>
    `;

    const form = document.getElementById('admin-login-form');
    const errorEl = document.getElementById('admin-login-error');
    const captchaIdEl = document.getElementById('admin-login-captcha-id');
    const captchaQEl = document.getElementById('admin-login-captcha-q');
    const captchaRefreshBtn = document.getElementById('admin-login-captcha-refresh');

    async function loadCaptcha() {
      try {
        const res = await API.getCaptcha();
        const data = res.data || res;
        captchaIdEl.value = data.id;
        captchaQEl.textContent = data.question;
        document.getElementById('admin-login-captcha').value = '';
      } catch {
        captchaQEl.textContent = '加载失败';
      }
    }

    captchaRefreshBtn.addEventListener('click', loadCaptcha);
    loadCaptcha();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.textContent = '';

      const email = document.getElementById('admin-login-email').value.trim();
      const password = document.getElementById('admin-login-password').value;
      const captchaId = captchaIdEl.value;
      const captchaAnswer = document.getElementById('admin-login-captcha').value.trim();

      try {
        const res = await API.login({ email, password, captcha_id: captchaId, captcha_answer: captchaAnswer });
        const data = res.data || res;
        if (!data.token) throw new Error('登录失败');
        API.setToken(data.token, false);

        const meRes = await API.me();
        const user = meRes.data || meRes;
        if (user.role !== 'admin') {
          API.clearToken();
          if (window.App && window.App.updateNav) window.App.updateNav();
          errorEl.textContent = '该账号没有后台权限';
          loadCaptcha();
          return;
        }

        if (window.App && window.App.updateNav) window.App.updateNav();
        Router.navigate('#/admin');
      } catch (err) {
        API.clearToken();
        errorEl.textContent = err.message || '后台登录失败';
        loadCaptcha();
      }
    });
  },
};
