/**
 * router.js — Hash-based SPA router
 * Routes: / | /explore | /journey/:slug | /login | /register | /profile | /admin
 */

const Router = (() => {
  const routes = {};

  function define(path, handler, ctx) {
    routes[path] = ctx ? handler.bind(ctx) : handler;
  }

  function resolve() {
    const hash   = window.location.hash.slice(1) || '/';
    const path   = hash.split('?')[0];
    const parts  = path.split('/').filter(Boolean);
    const root   = '/' + (parts[0] || '');

    // Dynamic route: /journey/:slug
    if (root === '/journey' && parts[1]) {
      return routes['/journey/:slug']?.(parts[1]);
    }

    const handler = routes[path] || routes[root] || routes['/'];
    handler?.();
  }

  function navigate(path) {
    window.location.hash = path;
  }

  // Init
  window.addEventListener('hashchange', resolve);
  window.addEventListener('DOMContentLoaded', resolve);

  return { define, navigate };
})();

// --- Route definitions ---
Router.define('/',                Pages.Home.render,    Pages.Home);
Router.define('/explore',         Pages.Explore.render, Pages.Explore);
Router.define('/journey/:slug',   Pages.Detail.render,  Pages.Detail);
Router.define('/login',           Pages.Login.render,   Pages.Login);
Router.define('/register',        Pages.Register.render, Pages.Register);
Router.define('/profile',         Pages.Profile.render, Pages.Profile);
Router.define('/admin',           Pages.Admin.render,   Pages.Admin);
