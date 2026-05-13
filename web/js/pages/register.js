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
            <div class="auth-field captcha-field">
              <label for="reg-captcha">验证码</label>
              <div class="captcha-row">
                <input type="text" id="reg-captcha" required placeholder="输入答案" />
                <span class="captcha-question" id="reg-captcha-q">加载中...</span>
                <button type="button" class="captcha-refresh" id="reg-captcha-refresh" title="换一题">↻</button>
              </div>
              <input type="hidden" id="reg-captcha-id" />
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
    const captchaIdEl = document.getElementById('reg-captcha-id');
    const captchaQEl = document.getElementById('reg-captcha-q');
    const captchaRefreshBtn = document.getElementById('reg-captcha-refresh');

    async function loadCaptcha() {
      try {
        const res = await API.getCaptcha();
        const data = res.data || res;
        captchaIdEl.value = data.id;
        captchaQEl.textContent = data.question;
        document.getElementById('reg-captcha').value = '';
      } catch (err) {
        captchaQEl.textContent = '加载失败';
      }
    }

    captchaRefreshBtn.addEventListener('click', loadCaptcha);
    loadCaptcha();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.textContent = '';

      const username = document.getElementById('reg-username').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;
      const captchaId = captchaIdEl.value;
      const captchaAnswer = document.getElementById('reg-captcha').value.trim();

      try {
        const res = await API.register({ username, email, password, captcha_id: captchaId, captcha_answer: captchaAnswer });
        const data = res.data || res;
        if (data.token) {
          API.setToken(data.token);
          if (window.App && window.App.updateNav) window.App.updateNav();
          Router.navigate('#/');
        }
      } catch (err) {
        errorEl.textContent = err.message || '注册失败，邮箱可能已被使用';
        loadCaptcha();
      }
    });
  },
};
