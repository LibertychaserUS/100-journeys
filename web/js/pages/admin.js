var Pages = window.Pages || {};

Pages.Admin = {
  _refreshTimer: null,

  async render() {
    const main = document.getElementById('main-content');
    if (!main) return;
    if (this._refreshTimer) clearInterval(this._refreshTimer);

    if (!API.isLoggedIn()) {
      Router.navigate('#/admin-login');
      return;
    }

    let user;
    try {
      const res = await API.me();
      user = res.data || res;
    } catch {
      Router.navigate('#/admin-login');
      return;
    }

    if (user.role !== 'admin') {
      Pages.Error.render(403);
      return;
    }

    main.innerHTML = `
      <section class="admin-page">
        <div class="container">
          <div class="admin-hero">
            <p>实时运营看板</p>
            <h1>后台数据中枢</h1>
            <span id="admin-updated">等待同步...</span>
            <button class="admin-export" id="admin-export-csv" type="button">导出 CSV</button>
          </div>

          <div class="admin-grid admin-grid--metrics">
            ${this._metricCard('用户', 'admin-stat-users')}
            ${this._metricCard('旅程卡片', 'admin-stat-journeys')}
            ${this._metricCard('虚拟币余额', 'admin-stat-balance')}
            ${this._metricCard('剩余积分', 'admin-stat-points')}
            ${this._metricCard('订单', 'admin-stat-orders')}
            ${this._metricCard('购买收入', 'admin-stat-revenue')}
            ${this._metricCard('审计错误', 'admin-stat-audit-errors')}
            ${this._metricCard('埋点事件', 'admin-stat-events')}
          </div>

          <div class="admin-panels">
            ${this._panel('点击最多卡片', 'admin-top-clicked')}
            ${this._panel('购买最多卡片', 'admin-top-purchased')}
            ${this._panel('MBTI 分布', 'admin-mbti')}
            ${this._panel('用户性别比例', 'admin-gender')}
            ${this._panel('卡片购买性别比例', 'admin-purchase-gender')}
            ${this._panel('最近用户', 'admin-users')}
          </div>
        </div>
      </section>
    `;

    await this._loadStats();
    const exportBtn = document.getElementById('admin-export-csv');
    if (exportBtn) exportBtn.addEventListener('click', () => this._exportCSV());
    this._refreshTimer = setInterval(() => this._loadStats(), 5000);
  },

  async _loadStats() {
    try {
      const [statsRes, usersRes] = await Promise.all([API.adminStats(), API.adminUsers()]);
      const stats = statsRes.data || {};
      const users = usersRes.data || [];

      this._setText('admin-stat-users', stats.total_users ?? 0);
      this._setText('admin-stat-journeys', stats.total_journeys ?? 0);
      this._setText('admin-stat-balance', `${(stats.total_balance ?? 0).toLocaleString()} 币`);
      this._setText('admin-stat-points', `${(stats.total_points ?? 0).toLocaleString()} 分`);
      this._setText('admin-stat-orders', `${stats.paid_orders ?? 0}/${stats.total_orders ?? 0}`);
      this._setText('admin-stat-revenue', `${(stats.gross_revenue ?? 0).toLocaleString()} 币`);
      this._setText('admin-stat-audit-errors', `${stats.audit_errors ?? 0}/${stats.audit_logs ?? 0}`);
      this._setText('admin-stat-events', `${(stats.analytics_events ?? 0).toLocaleString()}`);
      this._setText('admin-updated', `最近同步 ${new Date().toLocaleTimeString()}`);

      this._renderMetricList('admin-top-clicked', stats.top_clicked_journeys, '暂无点击事件');
      this._renderMetricList('admin-top-purchased', stats.top_purchased_journeys, '暂无已支付订单', true);
      this._renderDistribution('admin-mbti', stats.mbti_distribution);
      this._renderDistribution('admin-gender', stats.gender_distribution);
      this._renderDistribution('admin-purchase-gender', stats.purchase_gender_distribution);
      this._renderUsers(users);
    } catch (err) {
      console.error('Admin stats load failed:', err);
      this._setText('admin-updated', '同步失败');
    }
  },

  _metricCard(label, id) {
    return `
      <article class="admin-card admin-card--metric">
        <h3>${label}</h3>
        <p class="admin-stat" id="${id}">-</p>
      </article>
    `;
  },

  _panel(title, id) {
    return `
      <article class="admin-card admin-card--panel">
        <h3>${title}</h3>
        <div id="${id}" class="admin-list">加载中...</div>
      </article>
    `;
  },

  _renderMetricList(id, rows, emptyText, showRevenue = false) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!rows || rows.length === 0) {
      el.innerHTML = `<p class="admin-empty">${emptyText}</p>`;
      return;
    }
    const max = Math.max(...rows.map(r => r.count || 0), 1);
    el.innerHTML = rows.map(row => {
      const width = Math.max(6, Math.round(((row.count || 0) / max) * 100));
      const title = this._escapeHtml(row.title || row.slug || '未命名卡片');
      const rate = typeof row.rate === 'number' ? ` · ${Math.round(row.rate * 100)}%` : '';
      const tail = showRevenue ? `${(row.revenue || 0).toLocaleString()} 币${rate}` : `${row.count || 0} 次`;
      return `
        <div class="admin-bar-row">
          <div class="admin-bar-row__top"><span>${title}</span><em>${tail}</em></div>
          <div class="admin-bar"><span style="width:${width}%"></span></div>
        </div>
      `;
    }).join('');
  },

  _renderDistribution(id, rows) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!rows || rows.length === 0) {
      el.innerHTML = '<p class="admin-empty">暂无数据</p>';
      return;
    }
    el.innerHTML = rows.map(row => {
      const pct = Math.round((row.percent || 0) * 100);
      return `
        <div class="admin-bar-row">
          <div class="admin-bar-row__top"><span>${this._escapeHtml(row.label)}</span><em>${row.count || 0} · ${pct}%</em></div>
          <div class="admin-bar"><span style="width:${Math.max(4, pct)}%"></span></div>
        </div>
      `;
    }).join('');
  },

  _renderUsers(users) {
    const el = document.getElementById('admin-users');
    if (!el) return;
    if (!users || users.length === 0) {
      el.innerHTML = '<p class="admin-empty">暂无注册用户</p>';
      return;
    }
    el.innerHTML = users.slice(0, 8).map(user => `
      <div class="admin-user-row">
        <span>${this._escapeHtml(user.username || user.email)}</span>
        <em>${this._escapeHtml(user.role)} · ${(user.balance || 0).toLocaleString()}币 · ${(user.points || 0).toLocaleString()}分</em>
      </div>
    `).join('');
  },

  _setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  },

  async _exportCSV() {
    try {
      const res = await fetch(`${window.APP_CONFIG.apiBase}/admin/export?format=csv`, {
        headers: { Authorization: `Bearer ${API.getToken()}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '100-journeys-admin-stats.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      this._setText('admin-updated', '导出失败');
    }
  },

  _escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
};
