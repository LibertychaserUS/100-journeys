var Pages = window.Pages || {};

Pages.Profile = {
  _mbtiData: {
    nt: {
      name: '紫人 · 理性组',
      color: '#8b5cf6',
      desc: '以逻辑与远见驱动世界，在未知中寻找最优解。',
      types: [
        { code: 'INTJ', name: '建筑师', trait: '策略型探索者，偏爱计划和深度', travel: '冰岛熔岩隧道、巴塔哥尼亚徒步、挪威极光' },
        { code: 'INTP', name: '逻辑学家', trait: '好奇的分析师，追求知识与创新', travel: '秘鲁马丘比丘、纳米比亚死亡谷、玻利维亚盐沼' },
        { code: 'ENTJ', name: '指挥官', trait: '果断的领导者，追求效率与目标', travel: '格陵兰犬拉雪橇、巴塔哥尼亚徒步、新西兰皮划艇' },
        { code: 'ENTP', name: '辩论家', trait: '好奇的发明家，喜欢挑战与辩论', travel: '新西兰米尔福德峡湾、冰岛熔岩隧道、土耳其热气球' },
      ]
    },
    nf: {
      name: '绿人 · 理想组',
      color: '#22c55e',
      desc: '以共情与意义连接万物，在旅途中寻找灵魂共鸣。',
      types: [
        { code: 'INFJ', name: '提倡者', trait: '安静的理想主义者，寻求深层连接', travel: '挪威极光、纳米比亚死亡谷、日本温泉寺庙' },
        { code: 'INFP', name: '调停者', trait: '理想主义的旅行家，追求意义和内在体验', travel: '玻利维亚盐沼、纳米比亚死亡谷、摩洛哥撒哈拉' },
        { code: 'ENFJ', name: '主人公', trait: '魅力的激励者，关注他人成长', travel: '摩洛哥撒哈拉、马尔代夫海底餐厅、土耳其热气球' },
        { code: 'ENFP', name: '竞选者', trait: '充满热情的冒险家，渴望新鲜体验', travel: '摩洛哥撒哈拉、土耳其热气球、新西兰皮划艇' },
      ]
    },
    sp: {
      name: '黄人 · 冒险组',
      color: '#eab308',
      desc: '以感官与行动活在当下，每一秒都要真实触碰世界。',
      types: [
        { code: 'ISTP', name: '鉴赏家', trait: '冷静的实验者，擅长动手和观察', travel: '冰岛熔岩隧道、格陵兰犬拉雪橇、新西兰皮划艇' },
        { code: 'ISFP', name: '探险家', trait: '灵活的艺术家，享受当下感官体验', travel: '日本温泉寺庙、土耳其热气球、马尔代夫海底餐厅' },
        { code: 'ESTP', name: '企业家', trait: '活力四射的实干家，活在当下', travel: '格陵兰犬拉雪橇、新西兰米尔福德峡湾、挪威极光' },
        { code: 'ESFP', name: '表演者', trait: '自发的表演者，热爱社交和乐趣', travel: '土耳其热气球、马尔代夫海底餐厅、摩洛哥撒哈拉' },
      ]
    },
    sj: {
      name: '蓝人 · 守护组',
      color: '#3b82f6',
      desc: '以稳定与责任守护传统，在结构化中感受安全与归属。',
      types: [
        { code: 'ISTJ', name: '物流师', trait: '务实的组织者，偏爱结构化的行程', travel: '秘鲁马丘比丘、日本温泉寺庙、挪威极光' },
        { code: 'ISFJ', name: '守护者', trait: '细致体贴的旅行者，注重安全和舒适', travel: '日本温泉寺庙、马尔代夫海底餐厅、玻利维亚盐沼' },
        { code: 'ESTJ', name: '总经理', trait: '务实的管理者，重视传统和秩序', travel: '秘鲁马丘比丘、挪威极光、格陵兰犬拉雪橇' },
        { code: 'ESFJ', name: '执政官', trait: '热心的合作者，关注和谐和关怀', travel: '马尔代夫海底餐厅、挪威极光、日本温泉寺庙' },
      ]
    }
  },
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

          <h3 class="profile-section-title">🐾 旅行人格宠物</h3>
          <div class="mbti-companion" id="mbti-companion"></div>
        </div>
      </section>
    `;

    this._loadProfile();
    this._loadOrders();
    this._loadTransactions();
    this._renderMbtiCompanion();
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

  /* ================================================================
     MBTI Companion — Pet-like interactive personality selector
     ================================================================ */
  _renderMbtiCompanion() {
    const container = document.getElementById('mbti-companion');
    if (!container) return;

    const saved = localStorage.getItem('user_mbti');
    const selected = saved ? JSON.parse(saved) : null;

    if (selected) {
      this._showMbtiDetail(container, selected);
      return;
    }

    container.innerHTML = `
      <div class="mbti-intro">
        <p class="mbti-intro__text">选择你的 MBTI 类型，解锁专属旅行人格宠物。</p>
        <p class="mbti-intro__hint">它会根据你的性格，推荐最适合你的不可思议旅程。</p>
      </div>
      <div class="mbti-groups">
        ${Object.entries(this._mbtiData).map(([key, group]) => `
          <div class="mbti-group" data-group="${key}">
            <div class="mbti-group__header" style="--group-color: ${group.color}">
              <span class="mbti-group__badge" style="background: ${group.color}">${group.name}</span>
              <p class="mbti-group__desc">${group.desc}</p>
            </div>
            <div class="mbti-group__grid">
              ${group.types.map(t => `
                <button class="mbti-type" data-code="${t.code}" data-group="${key}">
                  <span class="mbti-type__code">${t.code}</span>
                  <span class="mbti-type__name">${t.name}</span>
                </button>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;

    container.querySelectorAll('.mbti-type').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.dataset.code;
        const groupKey = btn.dataset.group;
        const group = this._mbtiData[groupKey];
        const type = group.types.find(t => t.code === code);
        if (type) {
          localStorage.setItem('user_mbti', JSON.stringify({ ...type, groupName: group.name, groupColor: group.color }));
          this._showMbtiDetail(container, { ...type, groupName: group.name, groupColor: group.color });
          // Update profile badge
          const mbtiBadge = document.getElementById('profile-mbti');
          if (mbtiBadge) mbtiBadge.textContent = code;
        }
      });
    });
  },

  _showMbtiDetail(container, data) {
    container.innerHTML = `
      <div class="mbti-result">
        <div class="mbti-result__header" style="--group-color: ${data.groupColor}">
          <span class="mbti-result__badge" style="background: ${data.groupColor}">${data.groupName}</span>
          <h4 class="mbti-result__title">${data.code} · ${data.name}</h4>
        </div>
        <div class="mbti-result__body">
          <p class="mbti-result__trait">${data.trait}</p>
          <div class="mbti-result__travel">
            <span class="mbti-result__label">适合旅程</span>
            <p class="mbti-result__journeys">${data.travel}</p>
          </div>
        </div>
        <button class="mbti-result__reset" onclick="Pages.Profile._resetMbti()">重新选择</button>
      </div>
    `;
  },

  _resetMbti() {
    localStorage.removeItem('user_mbti');
    this._renderMbtiCompanion();
    const mbtiBadge = document.getElementById('profile-mbti');
    if (mbtiBadge) mbtiBadge.textContent = '未测试';
  },
};
