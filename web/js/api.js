/**
 * api.js — Centralized HTTP client
 * All fetch calls go through here; base URLs from APP_CONFIG.
 */

const API = (() => {
  const base = () => window.APP_CONFIG.apiBase;

  async function request(path, options = {}) {
    try {
      const res = await fetch(`${base()}${path}`, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        const e = new Error(err.message || `HTTP ${res.status}`);
        e.status = res.status;
        throw e;
      }
      return res.json();
    } catch (err) {
      if (err.name === 'TypeError' || err.message.includes('fetch') || err.message.includes('Failed')) {
        Pages.Error?.render(0, '网络断开，无法连接到服务器。');
      } else if (err.status === 403) {
        Pages.Error?.render(403);
      } else if (err.status === 503) {
        Pages.Error?.render(503);
      }
      throw err;
    }
  }

  // Auth helpers
  function authRequest(path, body) {
    return request(path, { method: 'POST', body: JSON.stringify(body) });
  }

  function authHeader() {
    const token = localStorage.getItem('auth_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function authedRequest(path, options = {}) {
    return request(path, { ...options, headers: { ...authHeader(), ...options.headers } });
  }

  return {
    // Journeys
    getJourneys: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/journeys${qs ? '?' + qs : ''}`);
    },
    getJourney: (slug) => request(`/journeys/${slug}`),

    // Tags
    getTags: () => request('/tags'),

    // Captcha
    getCaptcha: () => request('/captcha'),

    // Auth
    register: (data) => authRequest('/auth/register', data),
    login: (data) => authRequest('/auth/login', data),
    me: () => authedRequest('/auth/me'),

    // Orders
    createOrder: (items) => authedRequest('/orders', { method: 'POST', body: JSON.stringify({ items }) }),
    listOrders: () => authedRequest('/orders'),
    payOrder: (id) => authedRequest(`/orders/${id}/pay`, { method: 'POST' }),

    // Payments
    recharge: (amount) => authedRequest('/payments/recharge', { method: 'POST', body: JSON.stringify({ amount }) }),
    listTransactions: () => authedRequest('/payments/transactions'),

    // Media URL helper — CDN-aware
    mediaUrl: (path) => `${window.APP_CONFIG.mediaBase}/${path}`,

    // Auth state
    isLoggedIn: () => !!localStorage.getItem('auth_token'),
    getToken: () => localStorage.getItem('auth_token'),
    setToken: (t) => localStorage.setItem('auth_token', t),
    clearToken: () => localStorage.removeItem('auth_token'),
  };
})();
