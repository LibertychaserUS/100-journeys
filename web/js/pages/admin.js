var Pages = window.Pages || {};

Pages.Admin = {
  render() {
    const main = document.getElementById('main-content');
    if (!main) return;

    main.innerHTML = `
      <section class="admin-page">
        <div class="container">
          <h1 class="admin-title">管理员控制台</h1>
          <div class="admin-grid">
            <div class="admin-card">
              <h3>用户统计</h3>
              <p class="admin-stat" id="admin-stat-users">—</p>
            </div>
            <div class="admin-card">
              <h3>旅程数量</h3>
              <p class="admin-stat" id="admin-stat-journeys">—</p>
            </div>
            <div class="admin-card">
              <h3>总积分发放</h3>
              <p class="admin-stat" id="admin-stat-points">—</p>
            </div>
          </div>
          <p class="admin-note">更多管理功能（用户列表、旅程CRUD）将在后续版本上线。</p>
        </div>
      </section>
    `;

    this._loadStats();
  },

  async _loadStats() {
    try {
      const token = API.getToken();
      const res = await fetch(`${window.APP_CONFIG.apiBase}/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const stats = data.data || {};
      document.getElementById('admin-stat-users').textContent = stats.total_users ?? '—';
      document.getElementById('admin-stat-journeys').textContent = stats.total_journeys ?? '—';
      document.getElementById('admin-stat-points').textContent = stats.total_points ?? '—';
    } catch (err) {
      console.error('Admin stats load failed:', err);
    }
  },
};
