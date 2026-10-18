/**
 * Register — validates each field inline before calling the API, then uploads the
 * optional avatar against the new account.
 */
var Pages = window.Pages || {};

Pages.Register = {
  _avatarUrl: null,

  render() {
    const esc = UI.esc;
    const main = document.getElementById('main-content');
    const genders = ['female', 'male', 'non_binary', 'prefer_not_to_say'];
    main.innerHTML = AuthForm.layout(`
      <form class="auth-form" id="register-form" novalidate>
        <div>
          <h1 class="auth-title">${esc(t('register.title'))}</h1>
          <p class="auth-sub">${esc(t('register.sub'))}</p>
        </div>
        <div class="alert" id="register-error-box" role="alert" tabindex="-1" hidden>${UI.icon('alert')}<span id="register-error"></span></div>
        ${AuthForm.field({ id: 'reg-username', label: t('register.username'), placeholder: t('register.usernamePh'), autocomplete: 'nickname', attrs: 'required maxlength="30"', help: t('register.usernameHelp') })}
        ${AuthForm.field({ id: 'reg-email', label: t('register.email'), type: 'email', placeholder: 'you@example.com', autocomplete: 'email', attrs: 'required' })}
        ${AuthForm.field({ id: 'reg-password', label: t('register.password'), type: 'password', placeholder: t('register.passwordPh'), autocomplete: 'new-password', attrs: 'required maxlength="72"', trailing: AuthForm.passwordToggle('reg-password') })}
        <div class="field">
          <label for="reg-gender">${esc(t('register.gender'))}</label>
          <div class="input input--select">
            <select id="reg-gender" required aria-describedby="reg-gender-error">
              <option value="">${esc(t('register.genderPick'))}</option>
              ${genders.map((g) => `<option value="${g}">${esc(t(`gender.${g}`))}</option>`).join('')}
            </select>
          </div>
          <p class="field__error" id="reg-gender-error" hidden></p>
        </div>
        <div class="field">
          <span class="field__label" id="reg-avatar-label">${esc(t('register.avatar'))}</span>
          <div class="auth-avatar">
            <span class="auth-avatar__preview" id="reg-avatar-preview">${UI.icon('image')}</span>
            <label class="btn btn--ghost btn--sm" for="reg-avatar">${esc(t('register.avatarPick'))}</label>
            <input class="sr-only" type="file" id="reg-avatar" accept="image/png,image/jpeg,image/webp" aria-labelledby="reg-avatar-label" aria-describedby="reg-avatar-help reg-avatar-error">
            <span class="field__help" id="reg-avatar-help">${esc(t('register.avatarHelp'))}</span>
          </div>
          <p class="field__error" id="reg-avatar-error" hidden></p>
        </div>
        ${AuthForm.captcha('reg')}
        <button type="submit" class="btn btn--primary btn--lg btn--block auth-submit">${esc(t('register.submit'))}</button>
        <p class="auth-switch">${esc(t('register.switch'))} <a class="link" href="#/login${Router.query.get('next') ? `?next=${encodeURIComponent(Router.query.get('next'))}` : ''}">${esc(t('register.switchLink'))}</a></p>
      </form>`);

    const form = main.querySelector('#register-form');
    const reloadCaptcha = AuthForm.bindCommon(form, 'reg');
    const avatarInput = form.querySelector('#reg-avatar');
    avatarInput.addEventListener('change', () => {
      const file = avatarInput.files[0];
      const preview = form.querySelector('#reg-avatar-preview');
      if (this._avatarUrl) URL.revokeObjectURL(this._avatarUrl);
      this._avatarUrl = null;
      AuthForm.setFieldError(form, 'reg-avatar', '');
      if (!file) { preview.innerHTML = UI.icon('image'); return; }
      if (file.size > 512 * 1024) AuthForm.setFieldError(form, 'reg-avatar', t('err.avatarSize'));
      this._avatarUrl = URL.createObjectURL(file);
      preview.innerHTML = `<img src="${this._avatarUrl}" alt="">`;
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this._submit(form, reloadCaptcha);
    });
  },

  destroy() {
    if (this._avatarUrl) URL.revokeObjectURL(this._avatarUrl);
    this._avatarUrl = null;
  },

  _validate(form, v) {
    const errors = {
      'reg-username': !v.username ? t('err.required') : (/^[一-龥A-Za-z0-9_-]{2,30}$/.test(v.username) ? '' : t('err.username')),
      'reg-email': !v.email ? t('err.required') : (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email) ? '' : t('err.email')),
      'reg-password': !v.password ? t('err.required') : (/^[A-Za-z0-9!@#$%^&*()_+=,.?/-]{8,72}$/.test(v.password) && /[A-Za-z]/.test(v.password) && /\d/.test(v.password) ? '' : t('err.password')),
      'reg-gender': v.gender ? '' : t('err.gender'),
      'reg-captcha': v.captcha ? '' : t('err.required'),
      'reg-avatar': v.avatar && v.avatar.size > 512 * 1024 ? t('err.avatarSize') : '',
    };
    Object.entries(errors).forEach(([id, msg]) => AuthForm.setFieldError(form, id, msg));
    const first = Object.keys(errors).find((id) => errors[id]);
    if (first) form.querySelector(`#${first}`).focus();
    return !first;
  },

  async _submit(form, reloadCaptcha) {
    const v = {
      username: form.querySelector('#reg-username').value.trim(),
      email: form.querySelector('#reg-email').value.trim(),
      password: form.querySelector('#reg-password').value,
      gender: form.querySelector('#reg-gender').value,
      captcha: form.querySelector('#reg-captcha').value.trim(),
      avatar: form.querySelector('#reg-avatar').files[0],
    };
    AuthForm.setFormError(form, 'register-error-box', '');
    if (!this._validate(form, v)) return;

    const submit = form.querySelector('.auth-submit');
    AuthForm.busy(submit, true, t('register.submitting'));
    try {
      const res = await API.register({
        username: v.username, email: v.email, password: v.password, gender: v.gender,
        captcha_id: form.querySelector('#reg-captcha-id').value, captcha_answer: v.captcha,
      });
      API.setToken(res.data.token);
      if (v.avatar) {
        try { await API.uploadAvatar(v.avatar); }
        catch (err) { UI.toast(t('err.avatarUpload', { msg: I18n.error(err) })); }
      }
      await Session.refresh();
      Router.navigate(AuthForm.next());
    } catch (err) {
      AuthForm.busy(submit, false, t('register.submit'));
      const raw = err.apiError || '';
      const message = I18n.error(err);
      if (/captcha|验证码/i.test(raw)) AuthForm.setFieldError(form, 'reg-captcha', message);
      else if (/email already/i.test(raw)) AuthForm.setFieldError(form, 'reg-email', message);
      else if (/username/i.test(raw)) AuthForm.setFieldError(form, 'reg-username', message);
      else if (/password/i.test(raw)) AuthForm.setFieldError(form, 'reg-password', message);
      else AuthForm.setFormError(form, 'register-error-box', message);
      reloadCaptcha();
    }
  },
};
