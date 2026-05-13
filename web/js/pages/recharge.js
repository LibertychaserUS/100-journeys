var Pages = window.Pages || {};

Pages.Recharge = {
  tiers: [
    { amount: 60, label: '60', bonus: 0, tag: '' },
    { amount: 300, label: '300', bonus: 30, tag: '送30' },
    { amount: 680, label: '680', bonus: 88, tag: '送88' },
    { amount: 1280, label: '1,280', bonus: 198, tag: '送198' },
    { amount: 3280, label: '3,280', bonus: 688, tag: '送688' },
    { amount: 6480, label: '6,480', bonus: 1588, tag: '送1588' },
    { amount: 9980, label: '9,980', bonus: 2888, tag: '送2888 超值' },
  ],

  render() {
    const main = document.getElementById('main-content');
    if (!main) return;

    main.innerHTML = `
      <section class="recharge-page">
        <div class="recharge-card">
          <h1 class="recharge-title">充值不思议币</h1>
          <p class="recharge-subtitle">模拟充值 · 仅供体验 · 不扣真实费用</p>

          <div class="recharge-balance-row">
            <span class="recharge-balance-label">当前余额</span>
            <span class="recharge-balance-value" id="recharge-balance">—</span>
          </div>

          <div class="recharge-tiers" id="recharge-tiers">
            ${this.tiers.map((t, idx) => `
              <div class="recharge-tier ${idx === 2 ? 'recharge-tier--hot' : ''}" data-amount="${t.amount}" onclick="Pages.Recharge._selectTier(this, ${t.amount})">
                <div class="recharge-tier-amount">${t.label}</div>
                <div class="recharge-tier-unit">不思议币</div>
                ${t.tag ? `<div class="recharge-tier-tag">${t.tag}</div>` : ''}
              </div>
            `).join('')}
          </div>

          <div class="recharge-custom">
            <label>自定义金额</label>
            <input type="number" id="recharge-custom-input" min="1" placeholder="输入任意金额" />
          </div>

          <button class="recharge-submit" id="recharge-submit" onclick="Pages.Recharge._submit()">立即充值</button>
          <p class="recharge-error" id="recharge-error"></p>
        </div>
      </section>
    `;

    this._loadBalance();
  },

  async _loadBalance() {
    try {
      const res = await API.me();
      const user = res.data || res;
      const el = document.getElementById('recharge-balance');
      if (el) el.textContent = (user.balance ?? 0).toLocaleString() + ' 币';
    } catch (err) {
      console.error('Load balance failed:', err);
    }
  },

  _selectTier(el, amount) {
    document.querySelectorAll('.recharge-tier').forEach(t => t.classList.remove('recharge-tier--active'));
    el.classList.add('recharge-tier--active');
    this._selectedAmount = amount;
    document.getElementById('recharge-custom-input').value = '';
    document.getElementById('recharge-error').textContent = '';
  },

  async _submit() {
    const errorEl = document.getElementById('recharge-error');
    errorEl.textContent = '';

    let amount = this._selectedAmount;
    const custom = document.getElementById('recharge-custom-input').value.trim();
    if (custom) {
      amount = parseInt(custom, 10);
    }

    if (!amount || amount < 1) {
      errorEl.textContent = '请选择或输入充值金额';
      return;
    }

    try {
      await API.recharge(amount);
      errorEl.textContent = `成功充值 ${amount.toLocaleString()} 不思议币！`;
      errorEl.style.color = '#16a34a';
      this._loadBalance();
      if (window.App && window.App.updateNav) window.App.updateNav();
    } catch (err) {
      errorEl.textContent = err.message || '充值失败';
      errorEl.style.color = '';
    }
  },
};
