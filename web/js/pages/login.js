var Pages = window.Pages || {};

Pages.Login = {
  render() {
    const main = document.getElementById('main-content');
    if (!main) return;

    main.innerHTML = `
      <section class="auth-page">
        <div class="auth-card">
          <h1 class="auth-title">登录</h1>
          <p class="auth-subtitle">继续你的不可思议之旅</p>

          <form class="auth-form" id="login-form">
            <div class="auth-field">
              <label for="login-email">邮箱</label>
              <input type="email" id="login-email" required placeholder="your@email.com" />
            </div>
            <div class="auth-field">
              <label for="login-password">密码</label>
              <input type="password" id="login-password" required placeholder="至少6位字符" minlength="6" />
            </div>
            <div class="auth-field captcha-field">
              <label for="login-captcha">验证码</label>
              <div class="captcha-row">
                <input type="text" id="login-captcha" required placeholder="输入答案" />
                <span class="captcha-question" id="login-captcha-q">加载中...</span>
                <button type="button" class="captcha-refresh" id="login-captcha-refresh" title="换一题">↻</button>
              </div>
              <input type="hidden" id="login-captcha-id" />
            </div>
            <button type="submit" class="auth-submit">登录</button>
          </form>

          <p class="auth-switch">
            还没有账号？<a href="#/register">立即注册</a>
          </p>

          <p class="auth-error" id="login-error"></p>
        </div>
      </section>
    `;

    const form = document.getElementById('login-form');
    const errorEl = document.getElementById('login-error');
    const captchaIdEl = document.getElementById('login-captcha-id');
    const captchaQEl = document.getElementById('login-captcha-q');
    const captchaRefreshBtn = document.getElementById('login-captcha-refresh');

    async function loadCaptcha() {
      try {
        const res = await API.getCaptcha();
        const data = res.data || res;
        captchaIdEl.value = data.id;
        captchaQEl.textContent = data.question;
        document.getElementById('login-captcha').value = '';
      } catch (err) {
        captchaQEl.textContent = '加载失败';
      }
    }

    captchaRefreshBtn.addEventListener('click', loadCaptcha);
    loadCaptcha();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.textContent = '';

      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const captchaId = captchaIdEl.value;
      const captchaAnswer = document.getElementById('login-captcha').value.trim();

      try {
        const res = await API.login({ email, password, captcha_id: captchaId, captcha_answer: captchaAnswer });
        const data = res.data || res;
        if (data.token) {
          API.setToken(data.token);
          // Update nav auth state
          if (window.App && window.App.updateNav) window.App.updateNav();
          Router.navigate('#/');
        }
      } catch (err) {
        errorEl.textContent = err.message || '登录失败，请检查邮箱和密码';
        loadCaptcha();
      }
    });
  },
};
