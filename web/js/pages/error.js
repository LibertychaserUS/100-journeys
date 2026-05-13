var Pages = window.Pages || {};

Pages.Error = {
  // Render an error page. Supports:
  //   code: 500 | 403 | 503 | 0 (network/offline) | 'timeout' | any
  //   message: optional override text
  render(code, message) {
    const main = document.getElementById('main-content');
    if (!main) return;

    const cfg = this._config(code, message);

    main.innerHTML = `
      <section class="error-page">
        <div class="error-icon">${cfg.icon}</div>
        <div class="error-code">${cfg.codeLabel}</div>
        <h1 class="error-title">${cfg.title}</h1>
        <p class="error-desc">${cfg.desc}</p>
        <div class="error-actions">
          <a href="#/" class="error-btn error-btn--primary">返回首页</a>
          ${cfg.showRetry ? '<button class="error-btn error-btn--ghost" id="error-retry">重试</button>' : ''}
        </div>
      </section>
    `;

    if (cfg.showRetry) {
      document.getElementById('error-retry')?.addEventListener('click', () => {
        window.location.reload();
      });
    }
  },

  _config(code, message) {
    const defaults = {
      500: { icon: '&#9888;', codeLabel: '500', title: '服务器开小差了', desc: '服务器暂时无法处理你的请求，请稍后再试。', showRetry: true },
      403: { icon: '&#128683;', codeLabel: '403', title: '禁止访问', desc: '你没有权限查看此内容。', showRetry: false },
      503: { icon: '&#128295;', codeLabel: '503', title: '服务维护中', desc: '系统正在维护，请稍后回来。', showRetry: true },
      0:   { icon: '&#128246;', codeLabel: 'OFFLINE', title: '网络断开', desc: '无法连接到服务器，请检查网络。', showRetry: true },
      timeout: { icon: '&#9203;', codeLabel: 'TIMEOUT', title: '请求超时', desc: '服务器响应太慢，请检查网络或稍后重试。', showRetry: true },
    };

    const base = defaults[code] || defaults[500];
    if (message) base.desc = message;
    return base;
  },

  // Helper: show error from an API call
  fromError(err) {
    let code = 500;
    let msg = err?.message || '未知错误';
    if (msg.includes('403') || msg.includes('Forbidden')) code = 403;
    else if (msg.includes('503')) code = 503;
    else if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed')) code = 0;
    else if (msg.includes('timeout')) code = 'timeout';
    this.render(code, msg);
  },
};
