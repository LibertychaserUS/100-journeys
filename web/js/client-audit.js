(function () {
  function report(message, stack) {
    try {
      const payload = JSON.stringify({
        message: String(message || 'unknown frontend error').slice(0, 1200),
        stack: String(stack || '').slice(0, 4000),
        path: window.location.hash || window.location.pathname,
      });
      const url = `${window.APP_CONFIG.apiBase}/audit/client-error`;
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
        return;
      }
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }

  window.addEventListener('error', (event) => {
    report(event.message, event.error && event.error.stack);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason || {};
    report(reason.message || String(reason), reason.stack);
  });
})();
