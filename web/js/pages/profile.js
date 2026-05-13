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
                <span class="profile-badge__label">不思议币</span>
                <span class="profile-badge__value" id="profile-balance">—</span>
              </div>
              <div class="profile-badge">
                <span class="profile-badge__label">MBTI</span>
                <span class="profile-badge__value" id="profile-mbti">—</span>
              </div>
            </div>
            <div class="profile-actions">
              <a href="#/recharge" class="profile-btn profile-btn--primary">充值不思议币</a>
            </div>
          </div>

          <h3 class="profile-section-title">我的订单</h3>
          <div class="profile-orders" id="profile-orders">
            <p class="profile-empty">暂无订单</p>
          </div>

          <h3 class="profile-section-title">交易记录</h3>
          <div class="profile-txns" id="profile-txns">
            <p class="profile-empty">暂无交易记录</p>
          </div>

          <h3 class="profile-section-title">我的收藏</h3>
          <div class="profile-saved" id="profile-saved">
            <p class="profile-empty">暂无收藏的旅程</p>
          </div>
        </div>
      </section>
    `;

    this._loadProfile();
    this._loadOrders();
    this._loadTransactions();
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
      document.getElementById('profile-level').textContent = 'Lv' + (user.level ?? 1);
      document.getElementById('profile-points').textContent = (user.points ?? 0).toLocaleString();
      document.getElementById('profile-balance').textContent = (user.balance ?? 0).toLocaleString();
      document.getElementById('profile-mbti').textContent = user.mbti_type || '未测试';
      document.getElementById('profile-avatar-text').textContent = (user.username || '?')[0].toUpperCase();
    } catch (err) {
      console.error('Profile load failed:', err);
      Router.navigate('#/login');
    }
  },

  async _loadOrders() {
    try {
      const res = await API.listOrders();
      const orders = res.data || res || [];
      const container = document.getElementById('profile-orders');
      if (!orders.length) {
        container.innerHTML = '<p class="profile-empty">暂无订单</p>';
        return;
      }
      container.innerHTML = orders.map(o => `
        <div class="profile-order-card">
          <div class="profile-order-header">
            <span class="profile-order-no">${o.order_no}</span>
            <span class="profile-order-status profile-order-status--${o.status}">${this._statusText(o.status)}</span>
          </div>
          <div class="profile-order-items">
            ${(o.items || []).map(it => `<div class="profile-order-item">${it.journey_title} x${it.quantity} — ${it.subtotal.toLocaleString()} 币</div>`).join('')}
          </div>
          <div class="profile-order-footer">
            <span>合计: ${o.total_amount.toLocaleString()} 不思议币</span>
            ${o.status === 'pending' ? `<button class="profile-btn profile-btn--small" onclick="Pages.Profile._payOrder(${o.id})">立即支付</button>` : ''}
          </div>
        </div>
      `).join('');
    } catch (err) {
      console.error('Orders load failed:', err);
    }
  },

  async _loadTransactions() {
    try {
      const res = await API.listTransactions();
      const txns = res.data || res || [];
      const container = document.getElementById('profile-txns');
      if (!txns.length) {
        container.innerHTML = '<p class="profile-empty">暂无交易记录</p>';
        return;
      }
      container.innerHTML = txns.map(t => `
        <div class="profile-txn-row">
          <span class="profile-txn-type profile-txn-type--${t.txn_type}">${this._txnText(t.txn_type)}</span>
          <span class="profile-txn-amount ${t.amount > 0 ? 'profile-txn-amount--plus' : 'profile-txn-amount--minus'}">${t.amount > 0 ? '+' : ''}${t.amount.toLocaleString()}</span>
          <span class="profile-txn-balance">余额 ${t.balance_after.toLocaleString()}</span>
          <span class="profile-txn-date">${new Date(t.created_at).toLocaleString()}</span>
        </div>
      `).join('');
    } catch (err) {
      console.error('Transactions load failed:', err);
    }
  },

  async _payOrder(id) {
    try {
      await API.payOrder(id);
      alert('支付成功！');
      this._loadOrders();
      this._loadTransactions();
      this._loadProfile();
    } catch (err) {
      alert('支付失败: ' + (err.message || '余额不足'));
    }
  },

  _statusText(status) {
    const map = { pending: '待支付', paid: '已支付', cancelled: '已取消', refunded: '已退款' };
    return map[status] || status;
  },

  _txnText(type) {
    const map = { recharge: '充值', purchase: '消费', refund: '退款', bonus: '奖励' };
    return map[type] || type;
  },
};
