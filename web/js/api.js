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

  return {
    // Journeys
    getJourneys: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/journeys${qs ? '?' + qs : ''}`);
    },
    getJourney: (slug) => request(`/journeys/${slug}`),

    // Tags
    getTags: () => request('/tags'),

    // Media URL helper — CDN-aware
    mediaUrl: (path) => `${window.APP_CONFIG.mediaBase}/${path}`,
  };
})();
