/**
 * api.js — HTTP client. Every call goes through request(); base URLs come from APP_CONFIG.
 * Errors carry { status, apiError } from the { data, error } envelope; pages turn them into
 * readable copy with I18n.error(err). Journey reads pass the UI language (?lang=).
 */
const API = (() => {
  const base = () => window.APP_CONFIG.apiBase;
  const TOKEN_KEY = 'auth_token';

  function storedToken() {
    try { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
  }

  async function request(path, options = {}) {
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const headers = { ...(isFormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers };
    let res;
    try {
      res = await fetch(`${base()}${path}`, { ...options, headers });
    } catch (cause) {
      const e = new Error('network error');
      e.network = true;
      e.cause = cause;
      throw e;
    }
    let body = null;
    try { body = await res.json(); } catch {}
    if (!res.ok) {
      const e = new Error((body && (body.error || body.message)) || `HTTP ${res.status}`);
      e.status = res.status;
      e.apiError = body && body.error;
      if (res.status === 401 && storedToken() && path.startsWith('/auth/')) {
        // Expired or revoked token: drop it so the UI shows the signed-out state.
        clearToken();
        window.dispatchEvent(new CustomEvent('auth:changed'));
      }
      throw e;
    }
    return body;
  }

  const withLang = (params = {}) => ({ ...params, lang: I18n.apiLang });
  const qs = (params) => {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    const s = new URLSearchParams(clean).toString();
    return s ? `?${s}` : '';
  };

  function authHeader() {
    const token = storedToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
  function authed(path, options = {}) {
    return request(path, { ...options, headers: { ...authHeader(), ...options.headers } });
  }
  const post = (path, body) => authed(path, { method: 'POST', body: JSON.stringify(body || {}) });

  function setToken(token, remember = true) {
    try {
      if (remember) {
        localStorage.setItem(TOKEN_KEY, token);
        sessionStorage.removeItem(TOKEN_KEY);
      } else {
        sessionStorage.setItem(TOKEN_KEY, token);
        localStorage.removeItem(TOKEN_KEY);
      }
    } catch {}
  }
  function clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {}
  }

  return {
    // Journeys
    getJourneys: (params = {}) => request(`/journeys${qs(withLang(params))}`),
    getJourney: (slug) => request(`/journeys/${encodeURIComponent(slug)}${qs(withLang())}`),
    getTags: () => request('/tags'),

    // Auth
    getCaptcha: () => request('/captcha'),
    register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    me: () => authed('/auth/me'),
    uploadAvatar: (file) => {
      const form = new FormData();
      form.append('avatar', file);
      return authed('/auth/avatar', { method: 'POST', body: form });
    },
    updateMBTI: (code) => authed('/auth/mbti', { method: 'PUT', body: JSON.stringify({ mbti_type: code }) }),

    // The guide: a model reply (source "deepseek") or the server's fallback (source "mock")
    aiChat: (data) => request('/ai/chat', { method: 'POST', body: JSON.stringify(data) }),

    // Fork picks and the one-time guest merge
    listChoices: () => authed('/auth/choices'),
    setChoice: (slug, key) => authed(`/auth/choices/${encodeURIComponent(slug)}`, { method: 'PUT', body: JSON.stringify({ key }) }),
    mergeGuest: (state) => authed('/auth/guest/merge', { method: 'POST', body: JSON.stringify(state) }),

    // Saved journeys
    listSaved: () => authed(`/auth/saved${qs(withLang())}`),
    saveJourney: (slug) => authed(`/auth/saved/${encodeURIComponent(slug)}`, { method: 'PUT' }),
    unsaveJourney: (slug) => authed(`/auth/saved/${encodeURIComponent(slug)}`, { method: 'DELETE' }),

    // Orders
    createOrder: (items) => post('/orders', { items }),
    listOrders: () => authed('/orders'),
    getOrder: (id) => authed(`/orders/${encodeURIComponent(id)}`),
    payOrder: (id) => post(`/orders/${encodeURIComponent(id)}/pay`),

    // Payments
    rechargeTiers: () => request('/payments/tiers'),
    recharge: (amount) => post('/payments/recharge', { amount }),
    listTransactions: () => authed('/payments/transactions'),

    // Admin
    adminStats: () => authed('/admin/stats'),
    adminUsers: () => authed('/admin/users'),
    adminExport: (format = 'csv') => fetch(`${base()}/admin/export?format=${format}`, { headers: authHeader() }),

    // Analytics (fire-and-forget)
    // meta lands in analytics_events.metadata with the anonymous visitor id used by the funnel.
    track: (type, slug, meta = {}) => {
      try {
        const vid = window.Guest ? Guest.vid() : '';
        const payload = JSON.stringify({ type, journey_slug: slug || '', metadata: JSON.stringify({ vid, ...meta }) });
        const url = `${base()}/analytics/events`;
        if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }))) return;
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
      } catch {}
    },

    // Media URL helper — CDN-aware
    mediaUrl: (path) => `${window.APP_CONFIG.mediaBase}/${path}`,

    // Auth state
    isLoggedIn: () => !!storedToken(),
    getToken: storedToken,
    setToken,
    clearToken,
  };
})();
