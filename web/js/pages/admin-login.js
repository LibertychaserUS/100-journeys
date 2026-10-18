/**
 * Admin login — same auth layout; only admin accounts get through to the dashboard.
 */
var Pages = window.Pages || {};

Pages.AdminLogin = {
  render() {
    const esc = UI.esc;
    const main = document.getElementById('main-content');
    main.innerHTML = AuthForm.layout(`
      <form class="auth-form" id="admin-login-form" novalidate>
        <div>
          <p class="auth-kicker">${esc(t('adminLogin.kicker'))}</p>
          <h1 class="auth-title">${esc(t('adminLogin.title'))}</h1>
          <p class="auth-sub">${esc(t('adminLogin.sub'))}</p>
        </div>
        <div class="alert" id="admin-login-error-box" role="alert" tabindex="-1" hidden>${UI.icon('alert')}<span id="admin-login-error"></span></div>
        ${AuthForm.field({ id: 'admin-login-email', label: t('login.email'), type: 'email', placeholder: 'admin@example.com', autocomplete: 'username', attrs: 'required' })}
        ${AuthForm.field({ id: 'admin-login-password', label: t('login.password'), type: 'password', placeholder: t('login.passwordPh'), autocomplete: 'current-password', attrs: 'required', trailing: AuthForm.passwordToggle('admin-login-password') })}
        ${AuthForm.captcha('admin-login')}
        <button type="submit" class="btn btn--primary btn--lg btn--block auth-submit">${esc(t('adminLogin.submit'))}</button>
        <p class="auth-switch"><a class="link" href="#/">${esc(t('adminLogin.back'))}</a></p>
      </form>`, { admin: true });

    const form = main.querySelector('#admin-login-form');
    const reloadCaptcha = AuthForm.bindCommon(form, 'admin-login');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = form.querySelector('#admin-login-email').value.trim();
      const password = form.querySelector('#admin-login-password').value;
      const answer = form.querySelector('#admin-login-captcha').value.trim();
      AuthForm.setFormError(form, 'admin-login-error-box', '');
      AuthForm.setFieldError(form, 'admin-login-email', email ? '' : t('err.required'));
      AuthForm.setFieldError(form, 'admin-login-password', password ? '' : t('err.required'));
      AuthForm.setFieldError(form, 'admin-login-captcha', answer ? '' : t('err.required'));
      if (!email || !password || !answer) return;

      const submit = form.querySelector('.auth-submit');
      AuthForm.busy(submit, true, t('login.submitting'));
      try {
        const res = await API.login({ email, password, captcha_id: form.querySelector('#admin-login-captcha-id').value, captcha_answer: answer });
        if (!res.data.user || res.data.user.role !== 'admin') {
          AuthForm.busy(submit, false, t('adminLogin.submit'));
          AuthForm.setFormError(form, 'admin-login-error-box', t('adminLogin.notAdmin'));
          reloadCaptcha();
          return;
        }
        API.setToken(res.data.token, false);
        await Session.refresh();
        Router.navigate('/admin');
      } catch (err) {
        AuthForm.busy(submit, false, t('adminLogin.submit'));
        AuthForm.setFormError(form, 'admin-login-error-box', I18n.error(err));
        reloadCaptcha();
      }
    });
  },
};
