/**
 * router.js — hash router with a page lifecycle.
 * Routes: / | /explore | /journey/:slug | /login | /register | /profile | /recharge
 *         /admin-login | /admin | /about | anything else → 404
 *
 * Page contract: render(ctx), optional update(ctx) for query-only changes on the same
 * route, optional destroy() to release timers and listeners. ctx = { path, params, query }.
 */
const Router = (() => {
  const routes = [];
  let current = null; // { route, key }
  let firstRender = true;
  let depth = 0; // in-app navigations, so "back" knows whether history.back() stays in the app

  function define(pattern, page) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    routes.push({ pattern, page, re, keys });
  }

  function parse() {
    const raw = window.location.hash.replace(/^#/, '') || '/';
    const [path, search = ''] = raw.split('?');
    return { path: path || '/', query: new URLSearchParams(search) };
  }

  function match(path) {
    for (const route of routes) {
      const m = path.match(route.re);
      if (m) {
        const params = {};
        route.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        return { route, params };
      }
    }
    return null;
  }

  function resolve(force = false) {
    const { path, query } = parse();
    const found = match(path);
    const ctx = { path, query, params: found ? found.params : {} };
    const key = found ? `${found.route.pattern}:${JSON.stringify(found.params)}` : `404:${path}`;

    if (!force && current && current.key === key && found && found.route.page.update) {
      found.route.page.update(ctx);
      return;
    }

    if (current && current.route && current.route.page.destroy) {
      try { current.route.page.destroy(); } catch (e) { console.error(e); }
    }
    delete document.body.dataset.mediaHeader;
    delete document.body.dataset.bookbar;
    delete document.body.dataset.scrolled;
    document.body.dataset.page = found ? found.route.pattern.split('/')[1] || 'home' : 'notfound';
    current = { route: found && found.route, key };

    if (!force) window.scrollTo(0, 0);
    if (found) found.route.page.render(ctx);
    else Pages.Error.render(404);

    window.dispatchEvent(new CustomEvent('route:changed', { detail: ctx }));
    if (!firstRender && !force) {
      const main = document.getElementById('main-content');
      if (main) main.focus({ preventScroll: true });
    }
    firstRender = false;
  }

  function navigate(path) {
    const target = path.startsWith('#') ? path : `#${path}`;
    if (window.location.hash === target) resolve(true);
    else window.location.hash = target;
  }

  /** Replace the query of the current route without re-rendering (filters, tabs). */
  function replaceQuery(params) {
    const { path } = parse();
    const s = new URLSearchParams(params).toString();
    history.replaceState(null, '', `#${path}${s ? `?${s}` : ''}`);
  }

  /** Safe in-app redirect target from a ?next= value. */
  function safeNext(value, fallback = '/') {
    return value && /^\/[a-z0-9\-/?=&%._]*$/i.test(value) && !value.startsWith('//') ? value : fallback;
  }

  window.addEventListener('hashchange', () => { depth++; resolve(); });
  window.addEventListener('DOMContentLoaded', () => resolve());
  I18n.onChange(() => resolve(true));

  // Nav over media headers turns solid after a little scroll.
  window.addEventListener('scroll', () => {
    if (!document.body.dataset.mediaHeader) return;
    if (window.scrollY > 24) document.body.dataset.scrolled = '';
    else delete document.body.dataset.scrolled;
  }, { passive: true });

  function back(fallback = '/explore') {
    if (depth > 0) history.back();
    else navigate(fallback);
  }

  return { define, navigate, replaceQuery, safeNext, back, refresh: () => resolve(true), get query() { return parse().query; } };
})();

Router.define('/', Pages.Home);
Router.define('/explore', Pages.Explore);
Router.define('/journey/:slug', Pages.Detail);
Router.define('/find', Pages.Find);
Router.define('/guide', Pages.Guide);
Router.define('/space', Pages.Space);
Router.define('/login', Pages.Login);
Router.define('/register', Pages.Register);
Router.define('/profile', Pages.Profile);
Router.define('/recharge', Pages.Recharge);
Router.define('/admin-login', Pages.AdminLogin);
Router.define('/admin', Pages.Admin);
Router.define('/about', Pages.About);
