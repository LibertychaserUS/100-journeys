/**
 * config.js — App configuration
 * Go server injects window.APP_CONFIG before this script loads via template.
 * CDN switchover: change mediaBase in server config only, no frontend changes needed.
 */
window.APP_CONFIG = window.APP_CONFIG || {
  apiBase:   '/api',
  mediaBase: '/static/assets/images',  // local default; overridden by server injection
};
