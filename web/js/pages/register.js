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
              <input type="text" id="reg-username" required placeholder="2-30位，中英文/数字/_/-" minlength="2" maxlength="30" pattern="[\\u4e00-\\u9fa5A-Za-z0-9_-]{2,30}" />
              <small class="auth-help">用户名可重复，真实身份以系统生成的用户 ID 为准。</small>
            </div>
            <div class="auth-field">
              <label for="reg-email">邮箱</label>
              <input type="email" id="reg-email" required placeholder="your@email.com" />
            </div>
            <div class="auth-field">
              <label for="reg-password">密码</label>
              <input type="password" id="reg-password" required placeholder="8-72位，需含字母和数字" minlength="8" maxlength="72" />
            </div>
            <div class="auth-field">
              <label for="reg-gender">性别</label>
              <select id="reg-gender" required>
                <option value="">请选择</option>
                <option value="female">女</option>
                <option value="male">男</option>
                <option value="non_binary">非二元/其他</option>
                <option value="prefer_not_to_say">不愿透露</option>
              </select>
            </div>
            <div class="auth-field">
              <label for="reg-avatar">头像</label>
              <input type="file" id="reg-avatar" accept="image/png,image/jpeg,image/webp" />
              <small class="auth-help">可选。PNG/JPG/WebP，最大 512KB，上传后绑定到用户唯一 ID。</small>
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
      const gender = document.getElementById('reg-gender').value;
      const avatarFile = document.getElementById('reg-avatar').files[0];
      const captchaId = captchaIdEl.value;
      const captchaAnswer = document.getElementById('reg-captcha').value.trim();

      if (!/^[\u4e00-\u9fa5A-Za-z0-9_-]{2,30}$/.test(username)) {
        errorEl.textContent = '用户名只能包含中英文、数字、下划线或短横线。';
        return;
      }
      if (!/^[A-Za-z0-9!@#$%^&*()_+=,.?/-]{8,72}$/.test(password) || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        errorEl.textContent = '密码需为8-72位，包含字母和数字，不能含空格/引号/尖括号/分号。';
        return;
      }
      if (avatarFile && avatarFile.size > 512 * 1024) {
        errorEl.textContent = '头像不能超过512KB。';
        return;
      }

      try {
        const res = await API.register({ username, email, password, gender, captcha_id: captchaId, captcha_answer: captchaAnswer });
        const data = res.data || res;
        if (data.token) {
          API.setToken(data.token);
          if (avatarFile) {
            await API.uploadAvatar(avatarFile);
          }
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
