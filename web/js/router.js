/**
 * router.js — Hash-based SPA router
 * Routes: / | /explore | /journey/:slug | /login | /register | /profile | /admin-login | /admin | /recharge | /about
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

    const handler = routes[path] || routes[root];
    if (handler) {
      handler();
    } else {
      Pages.Error.render(500, '你寻找的旅程不在地图上，也许它正在某个未知的角落等待被发现。');
    }
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
Router.define('/admin-login',     Pages.AdminLogin.render, Pages.AdminLogin);
Router.define('/admin',           Pages.Admin.render,   Pages.Admin);
Router.define('/recharge',        Pages.Recharge.render, Pages.Recharge);
Router.define('/about',           Pages.About.render,   Pages.About);
