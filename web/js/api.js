/**
 * api.js — Centralized HTTP client
 * All fetch calls go through here; base URLs from APP_CONFIG.
 */

const API = (() => {
  const base = () => window.APP_CONFIG.apiBase;

  async function request(path, options = {}) {
    const res = await fetch(`${base()}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    return res.json();
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
