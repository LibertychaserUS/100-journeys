/**
 * nav.js — top bar, account menu, mobile drawer, theme + language switches, footer.
 */
const Nav = (() => {
  let el;
  let footer;
  let menuOpen = false;
  let drawerOpen = false;

  const theme = () => document.documentElement.getAttribute('data-theme') || 'dark';

  function setTheme(next) {
    const root = document.documentElement;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.classList.add('theme-switching');
      clearTimeout(setTheme._t);
      setTheme._t = setTimeout(() => root.classList.remove('theme-switching'), 320);
    }
    root.setAttribute('data-theme', next);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', next === 'dark' ? '#0d0f13' : '#f3f3f1');
    try { localStorage.setItem('theme', next); } catch {}
    const focused = document.activeElement && document.activeElement.id;
    render();
    if (focused) document.getElementById(focused)?.focus();
  }

  function activeSection() {
    const path = (window.location.hash.replace(/^#/, '').split('?')[0]) || '/';
    if (path.startsWith('/explore') || path.startsWith('/journey')) return 'explore';
    if (path.startsWith('/space') || path.startsWith('/find') || path.startsWith('/guide')) return 'space';
    if (path.startsWith('/station')) return 'station';
    if (path.startsWith('/profile') || path.startsWith('/recharge')) return 'me';
    if (path.startsWith('/admin')) return 'admin';
    if (path.startsWith('/about')) return 'about';
    return '';
  }

  function link(href, key, section, extra = '') {
    const current = activeSection() === section ? ' aria-current="page"' : '';
    return `<a href="${href}"${current} ${extra}>${UI.esc(t(key))}</a>`;
  }

  function render() {
    if (!el) return;
    const user = Session.user;
    const authed = API.isLoggedIn();
    const dark = theme() === 'dark';
    const esc = UI.esc;
    const avatar = esc((user && user.avatar_url) || API.mediaUrl('generated/guide-light-128.png'));
    const name = esc((user && (user.username || user.email)) || '');
    const balance = user ? I18n.num(user.balance) : '—';

    el.innerHTML = `
      <div class="container nav">
        <a class="nav__brand" href="#/" aria-label="${esc(t('brand'))}">
          <img src="${API.mediaUrl('generated/brand-mark-128.png')}" alt="" width="28" height="28">
          <span>${esc(t('brand'))}</span>
        </a>
        <nav class="nav__links" aria-label="${esc(t('nav.main'))}">
          ${link('#/explore', 'nav.explore', 'explore')}
          ${link('#/station', 'nav.station', 'station', 'id="nav-station"')}
          ${link('#/space', 'nav.space', 'space', 'id="nav-space"')}
          ${link('#/about', 'nav.about', 'about')}
          ${user && user.role === 'admin' ? link('#/admin', 'nav.admin', 'admin', 'id="nav-admin"') : ''}
        </nav>
        <div class="nav__actions">
          <button class="icon-btn nav__lang hide-sm" id="nav-lang" type="button" aria-label="${esc(`${t('nav.langShort')} · ${t('nav.langSwitch')}`)}" lang="${I18n.lang === 'zh' ? 'en' : 'zh-CN'}">${esc(t('nav.langShort'))}</button>
          <button class="icon-btn hide-sm" id="nav-theme" type="button" aria-label="${esc(t(dark ? 'nav.themeToLight' : 'nav.themeToDark'))}">${UI.icon(dark ? 'sun' : 'moon')}</button>
          ${authed ? `
            <a class="nav__wallet" id="nav-wallet" href="#/recharge" aria-label="${esc(t('nav.wallet', { n: balance }))}">
              <img src="${API.mediaUrl('generated/guide-light-128.png')}" alt="" width="24" height="24"><b class="num">${balance}</b><span class="nav__wallet-unit"> ${esc(t('common.coins'))}</span>
            </a>
            <button class="nav__user hide-sm" id="nav-user" type="button" aria-haspopup="menu" aria-expanded="${menuOpen}" aria-controls="nav-menu-list" aria-label="${name ? `${name} · ` : ''}${esc(t('nav.account'))}">
              <img src="${avatar}" alt="" width="30" height="30"><span>${name}</span>
            </button>` : `
            <a class="btn btn--ghost btn--sm" id="nav-login" href="#/login">${esc(t('nav.login'))}</a>
            <a class="btn btn--primary btn--sm hide-sm" id="nav-register" href="#/register">${esc(t('nav.register'))}</a>`}
          <button class="icon-btn nav__menu-btn" id="nav-menu" type="button" aria-expanded="${drawerOpen}" aria-controls="nav-drawer" aria-label="${esc(t(drawerOpen ? 'nav.menuClose' : 'nav.menu'))}">${UI.icon(drawerOpen ? 'close' : 'menu')}</button>
        </div>
      </div>
      ${authed && menuOpen ? `
        <div class="menu" id="nav-menu-list" role="menu" aria-label="${esc(t('nav.account'))}">
          <p class="menu__meta">${esc(t('nav.signedInAs', { name: name || '…' }))}</p>
          <a role="menuitem" id="nav-profile" href="#/profile">${UI.icon('user')}${esc(t('nav.me'))}</a>
          ${user && user.role === 'admin' ? `<a role="menuitem" href="#/admin">${UI.icon('chart')}${esc(t('nav.admin'))}</a>` : ''}
          <hr>
          <button role="menuitem" type="button" id="nav-logout">${UI.icon('logout')}${esc(t('nav.logout'))}</button>
        </div>` : ''}
      ${drawerOpen ? `
        <div class="drawer" id="nav-drawer">
          <div class="container">
            <nav class="drawer__links" aria-label="${esc(t('nav.main'))}">
              ${link('#/explore', 'nav.explore', 'explore')}
              ${link('#/station', 'nav.station', 'station')}
              ${link('#/space', 'nav.space', 'space')}
              ${authed ? link('#/profile', 'nav.me', 'me') : ''}
              ${link('#/about', 'nav.about', 'about')}
              ${user && user.role === 'admin' ? link('#/admin', 'nav.admin', 'admin') : ''}
              ${authed ? `<button type="button" id="drawer-logout">${esc(t('nav.logout'))}${UI.icon('logout')}</button>` : ''}
            </nav>
            ${authed ? '' : `<div class="drawer__row">
              <a class="btn btn--ghost" id="drawer-login" href="#/login">${esc(t('nav.login'))}</a>
              <a class="btn btn--primary" id="drawer-register" href="#/register">${esc(t('nav.register'))}</a>
            </div>`}
            <div class="drawer__prefs">
              <button class="btn btn--ghost" type="button" data-action="lang" lang="${I18n.lang === 'zh' ? 'en' : 'zh-CN'}">${esc(t('nav.language'))}</button>
              <button class="btn btn--ghost" type="button" data-action="theme">${UI.icon(dark ? 'sun' : 'moon')}${esc(t(dark ? 'nav.themeToLight' : 'nav.themeToDark'))}</button>
            </div>
          </div>
        </div>` : ''}
    `;
    document.body.dataset.auth = authed ? 'user' : 'guest';
  }

  function renderFooter() {
    if (!footer) return;
    footer.innerHTML = `
      <div class="container">
        <p class="site-footer__line"><span>${UI.esc(t('footer.line'))}</span><small>${UI.esc(t('footer.lineBy'))}</small></p>
        <span>${UI.esc(t('footer.note'))}</span>
        <nav aria-label="Footer">
          <a href="#/about">${UI.esc(t('nav.about'))}</a>
          <a href="#/explore">${UI.esc(t('nav.explore'))}</a>
          <a href="https://github.com/LibertychaserUS/100-journeys" rel="noopener" target="_blank">GitHub</a>
        </nav>
      </div>`;
  }

  function closeAll() {
    if (!menuOpen && !drawerOpen) return;
    menuOpen = false;
    drawerOpen = false;
    render();
  }

  function onClick(e) {
    const target = e.target.closest('button, a');
    if (!target) return;
    const id = target.id;
    if (id === 'nav-theme' || target.dataset.action === 'theme') return setTheme(theme() === 'dark' ? 'light' : 'dark');
    if (id === 'nav-lang' || target.dataset.action === 'lang') {
      drawerOpen = false;
      I18n.setLang(I18n.lang === 'zh' ? 'en' : 'zh');
      if (id === 'nav-lang') document.getElementById('nav-lang')?.focus();
      return;
    }
    if (id === 'nav-user') {
      menuOpen = !menuOpen;
      render();
      if (menuOpen) el.querySelector('#nav-menu-list [role="menuitem"]')?.focus();
      return;
    }
    if (id === 'nav-menu') { drawerOpen = !drawerOpen; menuOpen = false; render(); return; }
    if (id === 'nav-logout' || id === 'drawer-logout') {
      menuOpen = false;
      drawerOpen = false;
      Session.signOut();
      Router.navigate('/');
      return;
    }
    if (target.matches('a')) { menuOpen = false; drawerOpen = false; }
  }

  function init() {
    el = document.getElementById('main-nav');
    footer = document.getElementById('main-footer');
    if (!el) return;
    el.addEventListener('click', onClick);
    document.addEventListener('click', (e) => { if (menuOpen && !e.target.closest('#nav-user, #nav-menu-list')) closeAll(); });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || (!menuOpen && !drawerOpen)) return;
      const opener = menuOpen ? 'nav-user' : 'nav-menu';
      closeAll();
      document.getElementById(opener)?.focus();
    });
    window.addEventListener('session:updated', render);
    window.addEventListener('route:changed', () => { menuOpen = false; drawerOpen = false; render(); });
    const applyStatic = () => {
      const skip = document.getElementById('skip-link');
      if (skip) skip.textContent = t('skip');
    };
    I18n.onChange(() => { applyStatic(); render(); renderFooter(); });
    applyStatic();
    render();
    renderFooter();
    Session.refresh();
  }

  window.addEventListener('DOMContentLoaded', init);
  return { render };
})();
