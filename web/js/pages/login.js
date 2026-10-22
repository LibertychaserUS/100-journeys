/**
 * Login + shared auth helpers (split layout, captcha, password toggle, inline errors).
 */
var Pages = window.Pages || {};

const AuthForm = {
  layout(inner, { admin = false } = {}) {
    const esc = UI.esc;
    return `
      <div class="auth ${admin ? 'auth--admin' : ''}">
        <div class="auth__art" aria-hidden="true">
          <img src="${API.mediaUrl('generated/hero-taoyuan-v2-960.jpg')}" alt="" width="960" height="540">
          <div class="auth__quote"><p>${esc(t('auth.quote'))}</p><span>${esc(t('auth.quoteBy'))}</span></div>
        </div>
        <div class="auth__panel">${inner}</div>
      </div>`;
  },

  field({ id, label, type = 'text', placeholder = '', autocomplete = '', attrs = '', help = '', trailing = '' }) {
    const esc = UI.esc;
    return `
      <div class="field">
        <label for="${id}">${esc(label)}</label>
        <div class="input">
          <input id="${id}" name="${id}" type="${type}" placeholder="${esc(placeholder)}" ${autocomplete ? `autocomplete="${autocomplete}"` : ''} aria-describedby="${id}-error${help ? ` ${id}-help` : ''}" ${attrs}>
          ${trailing}
        </div>
        ${help ? `<p class="field__help" id="${id}-help">${esc(help)}</p>` : ''}
        <p class="field__error" id="${id}-error" hidden></p>
      </div>`;
  },

  passwordToggle(id) {
    return `<button class="input__btn" type="button" data-toggle-password="${id}" aria-label="${UI.esc(t('login.showPassword'))}" aria-pressed="false">${UI.icon('eye')}</button>`;
  },

  captcha(prefix) {
    const esc = UI.esc;
    return `
      <div class="field">
        <label for="${prefix}-captcha">${esc(t('login.captcha'))}</label>
        <div class="input">
          <input id="${prefix}-captcha" inputmode="numeric" autocomplete="off" placeholder="${esc(t('login.captchaPh'))}" aria-describedby="${prefix}-captcha-q ${prefix}-captcha-error">
          <span class="auth-captcha num"><span id="${prefix}-captcha-q" aria-live="polite">${esc(t('common.loading'))}</span>
            <button type="button" class="input__btn" id="${prefix}-captcha-refresh" aria-label="${esc(t('login.captchaRefresh'))}">${UI.icon('refresh', 'icon--sm')}</button></span>
        </div>
        <input type="hidden" id="${prefix}-captcha-id">
        <p class="field__error" id="${prefix}-captcha-error" hidden></p>
      </div>`;
  },

  bindCommon(root, prefix) {
    root.querySelectorAll('[data-toggle-password]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = root.querySelector(`#${btn.dataset.togglePassword}`);
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-pressed', String(show));
        btn.setAttribute('aria-label', t(show ? 'login.hidePassword' : 'login.showPassword'));
        btn.innerHTML = UI.icon(show ? 'eyeOff' : 'eye');
      });
    });
    const load = async () => {
      const q = root.querySelector(`#${prefix}-captcha-q`);
      try {
        const res = await API.getCaptcha();
        root.querySelector(`#${prefix}-captcha-id`).value = res.data.id;
        root.querySelector(`#${prefix}-captcha`).value = '';
        q.textContent = res.data.question;
      } catch {
        q.textContent = t('login.captchaFailed');
      }
    };
    root.querySelector(`#${prefix}-captcha-refresh`).addEventListener('click', load);
    load();
    return load;
  },

  setFieldError(root, id, message) {
    const input = root.querySelector(`#${id}`);
    const box = root.querySelector(`#${id}-error`);
    if (!input || !box) return;
    input.closest('.input')?.classList.toggle('is-invalid', !!message);
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    box.hidden = !message;
    box.textContent = message || '';
  },

  setFormError(root, id, message) {
    const box = root.querySelector(`#${id}`);
    if (!box) return;
    box.hidden = !message;
    box.querySelector('span').textContent = message || '';
    if (message) box.focus();
  },

  busy(button, on, label) {
    button.disabled = on;
    button.setAttribute('aria-busy', String(on));
    if (label) button.textContent = label;
  },

  next() { return Router.safeNext(Router.query.get('next'), '/'); },
};

Pages.Login = {
  render() {
    const esc = UI.esc;
    const main = document.getElementById('main-content');
    main.innerHTML = AuthForm.layout(`
      <form class="auth-form" id="login-form" novalidate>
        <div>
          <h1 class="auth-title">${esc(t('login.title'))}</h1>
          <p class="auth-sub">${esc(t('login.sub'))}</p>
        </div>
        <div class="alert" id="login-error-box" role="alert" tabindex="-1" hidden>${UI.icon('alert')}<span id="login-error"></span></div>
        ${AuthForm.field({ id: 'login-email', label: t('login.email'), type: 'email', placeholder: 'you@example.com', autocomplete: 'email', attrs: 'required' })}
        ${AuthForm.field({ id: 'login-password', label: t('login.password'), type: 'password', placeholder: t('login.passwordPh'), autocomplete: 'current-password', attrs: 'required', trailing: AuthForm.passwordToggle('login-password') })}
        ${AuthForm.captcha('login')}
        <label class="check"><input type="checkbox" id="login-remember" checked> ${esc(t('login.remember'))}</label>
        <button type="submit" class="btn btn--primary btn--lg btn--block auth-submit">${esc(t('login.submit'))}</button>
        <p class="auth-switch">${esc(t('login.switch'))} <a class="link" href="#/register${Router.query.get('next') ? `?next=${encodeURIComponent(Router.query.get('next'))}` : ''}">${esc(t('login.switchLink'))}</a></p>
      </form>`);

    const form = main.querySelector('#login-form');
    const reloadCaptcha = AuthForm.bindCommon(form, 'login');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = form.querySelector('#login-email').value.trim();
      const password = form.querySelector('#login-password').value;
      const answer = form.querySelector('#login-captcha').value.trim();
      AuthForm.setFormError(form, 'login-error-box', '');
      AuthForm.setFieldError(form, 'login-email', email ? '' : t('err.required'));
      AuthForm.setFieldError(form, 'login-password', password ? '' : t('err.required'));
      AuthForm.setFieldError(form, 'login-captcha', answer ? '' : t('err.required'));
      if (!email || !password || !answer) { form.querySelector('[aria-invalid="true"]')?.focus(); return; }

      const submit = form.querySelector('.auth-submit');
      AuthForm.busy(submit, true, t('login.submitting'));
      try {
        const res = await API.login({ email, password, captcha_id: form.querySelector('#login-captcha-id').value, captcha_answer: answer });
        API.setToken(res.data.token, form.querySelector('#login-remember').checked);
        await Session.refresh();
        Router.navigate(AuthForm.next());
      } catch (err) {
        AuthForm.busy(submit, false, t('login.submit'));
        const message = I18n.error(err);
        if (/captcha|验证码/i.test(err.apiError || '')) AuthForm.setFieldError(form, 'login-captcha', message);
        else AuthForm.setFormError(form, 'login-error-box', message);
        reloadCaptcha();
      }
    });
  },
};
