var Pages = window.Pages || {};

Pages.Profile = {
  render() {
    const main = document.getElementById('main-content');
    if (!main) return;

    main.innerHTML = `
      <section class="profile-page">
        <div class="container">
          <div class="profile-card" id="profile-card">
            <div class="profile-avatar">
              <span id="profile-avatar-text">?</span>
            </div>
            <h2 class="profile-name" id="profile-name">加载中…</h2>
            <p class="profile-email" id="profile-email"></p>
            <div class="profile-meta">
              <div class="profile-badge">
                <span class="profile-badge__label">等级</span>
                <span class="profile-badge__value" id="profile-level">—</span>
              </div>
              <div class="profile-badge">
                <span class="profile-badge__label">积分</span>
                <span class="profile-badge__value" id="profile-points">—</span>
              </div>
              <div class="profile-badge">
                <span class="profile-badge__label">MBTI</span>
                <span class="profile-badge__value" id="profile-mbti">—</span>
              </div>
            </div>
          </div>

          <h3 class="profile-section-title">我的收藏</h3>
          <div class="profile-saved" id="profile-saved">
            <p class="profile-empty">暂无收藏的旅程</p>
          </div>
        </div>
      </section>
    `;

    this._loadProfile();
  },

  async _loadProfile() {
    try {
      const res = await API.me();
      const user = res.data || res;
      if (!user || !user.id) {
        Router.navigate('#/login');
        return;
      }

      document.getElementById('profile-name').textContent = user.username || '旅行者';
      document.getElementById('profile-email').textContent = user.email || '';
      document.getElementById('profile-level').textContent = user.level ?? 1;
      document.getElementById('profile-points').textContent = user.points ?? 0;
      document.getElementById('profile-mbti').textContent = user.mbti_type || '未测试';
      document.getElementById('profile-avatar-text').textContent = (user.username || '?')[0].toUpperCase();
    } catch (err) {
      console.error('Profile load failed:', err);
      Router.navigate('#/login');
    }
  },
};
