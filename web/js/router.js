/**
 * router.js — hash router with a page lifecycle.
 * Routes: / | /explore | /journey/:slug | /station | /compose | /compose/:code | /login | /register | /profile | /recharge
 *         /admin-login | /admin | /about | anything else → 404
 *
 * Page contract: render(ctx), optional update(ctx) for query-only changes on the same
 * route, optional destroy() to release timers and listeners. ctx = { path, params, query }.
 */
const Router = (() => {
  const routes = [];
  let current = null; // { route, key }
  let firstRender = true;
  // True while a page re-renders in place (a language switch, a refresh): pages skip their arrival.
  let swapping = false;
  let depth = 0; // in-app navigations, so "back" knows whether history.back() stays in the app
  let routeHash = window.location.hash.startsWith('#/') ? window.location.hash : '#/';
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  // Each history entry keeps its scroll position and whatever the page saves (the selected door,
  // the slide), so Back returns to the same place. Forward navigations start at the top.
  const state = () => history.state || {};
  function saveState(extra) {
    history.replaceState({ ...state(), y: window.scrollY, ...extra }, '');
  }

  // A hash that is not a route (the skip link, an in-page anchor) moves focus and keeps the route.
  function inPageAnchor() {
    const h = window.location.hash;
    if (!h || h === '#' || h.startsWith('#/')) return false;
    let el = null;
    try { el = document.getElementById(decodeURIComponent(h.slice(1))); } catch (e) { el = null; }
    history.replaceState(history.state, '', routeHash);
    if (el) {
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      el.focus();
    }
    return true;
  }

  // The nav over a full-bleed opening turns solid once the opening is behind it.
  function updateScrolled() {
    if (!('mediaHeader' in document.body.dataset)) return;
    const end = document.querySelector('[data-media-end]');
    const limit = end ? end.offsetTop + end.offsetHeight - 80 : 24;
    if (window.scrollY > limit) document.body.dataset.scrolled = '';
    else delete document.body.dataset.scrolled;
    // Over the last stretch of the picture the bar darkens to night, so nothing on the picture
    // ever slides under a clear bar.
    const scrim = end ? Math.min(1, Math.max(0, (window.scrollY - (limit - 320)) / 320)) : 0;
    document.body.style.setProperty('--nav-scrim', scrim.toFixed(3));
  }

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
    if (inPageAnchor()) return;
    routeHash = window.location.hash || '#/';
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

    const page = found ? found.route.page : null;
    const name = document.body.dataset.page;
    const restoreY = typeof state().y === 'number' ? state().y : null;
    const run = () => {
      if (!force) window.scrollTo(0, 0);
      UI.setMeta({ title: name === 'home' ? '' : (t(`meta.page.${name}`) !== `meta.page.${name}` ? t(`meta.page.${name}`) : '') });
      swapping = !!force && !firstRender;
      let out;
      try { out = page ? page.render(ctx) : Pages.Error.render(404); } finally { swapping = false; }
      // Coming back to an entry (Back, Forward, a reload, a language switch): return to its place.
      const back = force ? window.scrollY : restoreY;
      if (back) requestAnimationFrame(() => requestAnimationFrame(() => { window.scrollTo(0, back); updateScrolled(); }));
      else requestAnimationFrame(updateScrolled);
      // Wait briefly for an async page (detail) so the transition captures the new state.
      return out && typeof out.then === 'function' ? Promise.race([out, new Promise((r) => setTimeout(r, 700))]) : undefined;
    };
    const motion = document.startViewTransition && document.visibilityState === 'visible'
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animate = !firstRender && motion;
    if (animate) {
      // re-rendering in place is a quick crossfade of the words, not an arrival
      const html = document.documentElement;
      if (force) html.classList.add('vt-swap');
      // The update must run exactly once even if the browser never paints the old state
      // (an occluded window): fall back to a plain swap after a short wait.
      let ran = false;
      const once = () => { if (ran) return undefined; ran = true; return run(); };
      const vt = document.startViewTransition(once);
      if (vt.finished) vt.finished.finally(() => html.classList.remove('vt-swap', 'vt-open', 'vt-arch'));
      setTimeout(() => { if (!ran) { if (vt.skipTransition) vt.skipTransition(); once(); } }, 350);
    } else run();

    window.dispatchEvent(new CustomEvent('route:changed', { detail: ctx }));
    if (!firstRender && !force) {
      const main = document.getElementById('main-content');
      if (main) main.focus({ preventScroll: true });
    }
    if (firstRender) document.documentElement.dataset.booted = '';
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
    routeHash = `#${path}${s ? `?${s}` : ''}`;
    history.replaceState(history.state, '', routeHash);
  }

  /** Safe in-app redirect target from a ?next= value. */
  function safeNext(value, fallback = '/') {
    return value && /^\/[a-z0-9\-/?=&%._]*$/i.test(value) && !value.startsWith('//') ? value : fallback;
  }

  window.addEventListener('hashchange', () => { if (inPageAnchor()) return; depth++; resolve(); });
  window.addEventListener('DOMContentLoaded', () => resolve());
  I18n.onChange(() => resolve(true));

  let saveTimer = 0;
  window.addEventListener('scroll', () => {
    updateScrolled();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveState(), 150);
  }, { passive: true });

  function back(fallback = '/explore') {
    if (depth > 0) history.back();
    else navigate(fallback);
  }

  return {
    define, navigate, replaceQuery, safeNext, back, refresh: () => resolve(true), get query() { return parse().query; },
    get swapping() { return swapping; },
    /** What the current history entry remembers (e.g. a page's own selection), and how to add to it. */
    state, saveState,
  };
})();

Router.define('/', Pages.Home);
Router.define('/explore', Pages.Explore);
Router.define('/journey/:slug', Pages.Detail);
Router.define('/find', Pages.Find);
Router.define('/guide', Pages.Guide);
Router.define('/space', Pages.Space);
Router.define('/station', Pages.Station);
Router.define('/compose', Pages.Compose);
Router.define('/compose/:code', Pages.Compose);
Router.define('/login', Pages.Login);
Router.define('/register', Pages.Register);
Router.define('/profile', Pages.Profile);
Router.define('/recharge', Pages.Recharge);
Router.define('/admin-login', Pages.AdminLogin);
Router.define('/admin', Pages.Admin);
Router.define('/about', Pages.About);
