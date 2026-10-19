/**
 * Profile ("My trips") — identity + wallet header, then tabs for orders, saved journeys,
 * transactions and travel personality. ?tab= selects a tab without re-rendering.
 */
var Pages = window.Pages || {};

Pages.Profile = {
  TABS: ['orders', 'saved', 'txns', 'persona'],
  _tab: 'orders',
  _user: null,
  _journeys: null,
  _seq: 0,
  _counts: {},

  async render(ctx) {
    if (!API.isLoggedIn()) {
      Router.navigate(`/login?next=${encodeURIComponent('/profile')}`);
      return;
    }
    const seq = ++this._seq;
    this._tab = this.TABS.includes(ctx.query.get('tab')) ? ctx.query.get('tab') : 'orders';
    this._counts = {};
    const esc = UI.esc;
    const main = document.getElementById('main-content');
    main.innerHTML = `
      <div class="page profile">
        <header class="container profile-head" id="profile-card">
          <div class="profile-id">
            <img class="profile-id__avatar skeleton" id="profile-avatar" src="${API.mediaUrl('generated/guide-light-128.png')}" alt="" width="72" height="72">
            <div>
              <h1 class="profile-name" id="profile-name">${esc(t('common.loading'))}</h1>
              <p class="profile-email" id="profile-email"></p>
              <div class="profile-tags" id="profile-tags"></div>
            </div>
          </div>
          <div class="profile-wallet">
            <div><p class="profile-wallet__k">${esc(t('profile.wallet'))}</p><p class="profile-wallet__v num" id="profile-balance">—</p></div>
            <div><p class="profile-wallet__k">${esc(t('profile.points'))}</p><p class="profile-wallet__v num" id="profile-points">—</p></div>
            <a class="btn btn--primary" href="#/recharge">${esc(t('profile.recharge'))}</a>
          </div>
        </header>
        <div class="container">
          <div class="tabs" role="tablist" aria-label="${esc(t('profile.tabs'))}">
            ${this.TABS.map((tab) => `<button role="tab" type="button" id="tab-${tab}" aria-controls="panel-${tab}" aria-selected="${tab === this._tab}" tabindex="${tab === this._tab ? 0 : -1}">${esc(t(`profile.tab.${tab}`))}<span class="count" data-count="${tab}"></span></button>`).join('')}
          </div>
          ${this.TABS.map((tab) => `<section class="profile-panel" role="tabpanel" id="panel-${tab}" aria-labelledby="tab-${tab}" ${tab === this._tab ? '' : 'hidden'}></section>`).join('')}
        </div>
      </div>`;

    const tablist = main.querySelector('[role="tablist"]');
    tablist.addEventListener('click', (e) => {
      const tab = e.target.closest('[role="tab"]');
      if (tab) this._select(tab.id.replace('tab-', ''), true);
    });
    tablist.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const i = this.TABS.indexOf(this._tab);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? this.TABS.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + this.TABS.length) % this.TABS.length;
      this._select(this.TABS[next], true);
      document.getElementById(`tab-${this.TABS[next]}`).focus();
    });
    main.addEventListener('click', (e) => this._onClick(e));

    const user = await Session.load(true);
    if (seq !== this._seq) return;
    if (!user) { Router.navigate(`/login?next=${encodeURIComponent('/profile')}`); return; }
    this._user = user;
    this._renderHead(user);
    this._loadPanel(this._tab);
    // Counts for the other tabs
    this.TABS.filter((tab) => tab !== this._tab).forEach((tab) => this._loadPanel(tab));
  },

  update(ctx) {
    const tab = ctx.query.get('tab');
    if (this.TABS.includes(tab)) this._select(tab, false);
  },

  destroy() { this._seq++; },

  _select(tab, pushUrl) {
    if (!this.TABS.includes(tab)) return;
    this._tab = tab;
    this.TABS.forEach((name) => {
      const btn = document.getElementById(`tab-${name}`);
      const panel = document.getElementById(`panel-${name}`);
      if (!btn || !panel) return;
      btn.setAttribute('aria-selected', String(name === tab));
      btn.tabIndex = name === tab ? 0 : -1;
      panel.hidden = name !== tab;
    });
    if (pushUrl) Router.replaceQuery(tab === 'orders' ? {} : { tab });
  },

  _renderHead(user) {
    const esc = UI.esc;
    const avatar = document.getElementById('profile-avatar');
    avatar.src = user.avatar_url || API.mediaUrl('generated/guide-light-128.png');
    avatar.classList.remove('skeleton');
    document.getElementById('profile-name').textContent = user.username || user.email;
    document.getElementById('profile-email').textContent = user.email || '';
    document.getElementById('profile-balance').textContent = I18n.num(user.balance);
    document.getElementById('profile-points').textContent = I18n.num(user.points);
    document.getElementById('profile-tags').innerHTML = `
      <span class="tag-code">${esc(t('profile.level', { n: user.level || 1 }))}</span>
      <span class="tag-code" id="profile-mbti">${user.mbti_type ? `${esc(user.mbti_type)} · ${esc(MBTI.name(user.mbti_type))}` : esc(t('profile.noMbti'))}</span>`;
  },

  _setCount(tab, n) {
    this._counts[tab] = n;
    const el = document.querySelector(`[data-count="${tab}"]`);
    if (el) el.textContent = n ? String(n) : '';
  },

  async _journeyMap() {
    if (this._journeys && this._journeys.lang === I18n.lang) return this._journeys.map;
    const res = await API.getJourneys({ limit: 100 });
    const map = new Map((res.data || []).map((j) => [j.id, j]));
    this._journeys = { lang: I18n.lang, map };
    return map;
  },

  _loadPanel(tab) {
    if (tab === 'orders') return this._loadOrders();
    if (tab === 'saved') return this._loadSaved();
    if (tab === 'txns') return this._loadTxns();
    if (tab === 'persona') return this._renderPersona();
  },

  _empty(titleKey, textKey, cta = true) {
    return `<div class="state"><p class="state__title">${UI.esc(t(titleKey))}</p><p class="state__text">${UI.esc(t(textKey))}</p>
      ${cta ? `<div class="state__actions"><a class="btn btn--primary" href="#/explore">${UI.esc(t('profile.goExplore'))}</a></div>` : ''}</div>`;
  },

  _failed(panel, err, tab) {
    panel.innerHTML = `<div class="state" role="alert"><p class="state__title">${UI.esc(t('profile.loadError'))}</p><p class="state__text">${UI.esc(I18n.error(err))}</p>
      <div class="state__actions"><button class="btn btn--ghost" type="button" data-reload="${tab}">${UI.icon('refresh')}${UI.esc(t('common.retry'))}</button></div></div>`;
  },

  async _loadOrders() {
    const panel = document.getElementById('panel-orders');
    if (!panel) return;
    const seq = this._seq;
    panel.innerHTML = '<div class="profile-list">' + '<div class="skeleton profile-row--skeleton"></div>'.repeat(2) + '</div>';
    try {
      const [ordersRes, map] = await Promise.all([API.listOrders(), this._journeyMap()]);
      if (seq !== this._seq) return;
      const orders = ordersRes.data || [];
      this._setCount('orders', orders.length);
      if (!orders.length) { panel.innerHTML = this._empty('profile.orders.empty', 'profile.orders.emptyText'); return; }
      const esc = UI.esc;
      panel.innerHTML = `<ul class="profile-list">${orders.map((o) => {
        const item = (o.items || [])[0] || {};
        const j = map.get(item.journey_id);
        const title = j ? j.title : item.journey_title;
        return `<li class="profile-order" data-order="${o.id}">
          ${j ? `<a href="#/journey/${encodeURIComponent(j.slug)}"><img src="${esc(j.image_url)}" alt="" width="64" height="64" loading="lazy"></a>` : '<span class="profile-order__ph"></span>'}
          <div class="profile-order__main">
            <b>${j ? `<a href="#/journey/${encodeURIComponent(j.slug)}">${esc(title)}</a>` : esc(title)}${item.quantity > 1 ? ` ×${item.quantity}` : ''}</b>
            <p class="num">${esc(t('profile.orders.item', { no: o.order_no, date: I18n.date(o.created_at) }))}</p>
          </div>
          <div class="profile-order__side">
            <span class="price">${esc(UI.coins(o.total_amount))}</span>
            ${o.status === 'pending'
              ? `<button class="btn btn--primary btn--sm" type="button" data-pay="${o.id}" data-journey="${j ? j.id : ''}">${esc(t('profile.orders.pay'))}</button>`
              : `<span class="profile-status profile-order-status--${esc(o.status)}">${esc(t(`status.${o.status}`))}</span>`}
          </div>
        </li>`;
      }).join('')}</ul>`;
    } catch (err) {
      if (seq === this._seq) this._failed(panel, err, 'orders');
    }
  },

  async _loadSaved() {
    const panel = document.getElementById('panel-saved');
    if (!panel) return;
    const seq = this._seq;
    panel.innerHTML = `<div class="grid-cards profile-saved">${UI.skeletonCards(4)}</div>`;
    try {
      const res = await API.listSaved();
      if (seq !== this._seq) return;
      const list = res.data || [];
      this._setCount('saved', list.length);
      panel.innerHTML = list.length
        ? `<div class="grid-cards profile-saved" id="profile-saved">${list.map((j) => UI.journeyCard(j)).join('')}</div>`
        : this._empty('profile.saved.empty', 'profile.saved.emptyText');
    } catch (err) {
      if (seq === this._seq) this._failed(panel, err, 'saved');
    }
  },

  async _loadTxns() {
    const panel = document.getElementById('panel-txns');
    if (!panel) return;
    const seq = this._seq;
    try {
      const res = await API.listTransactions();
      if (seq !== this._seq) return;
      const txns = res.data || [];
      this._setCount('txns', txns.length);
      if (!txns.length) { panel.innerHTML = this._empty('profile.txns.empty', 'profile.orders.emptyText', false); return; }
      const esc = UI.esc;
      panel.innerHTML = `
        <div class="profile-txns" id="profile-txns">
          <div class="profile-txn-head" aria-hidden="true"><span>${esc(t('profile.txns.type'))}</span><span>${esc(t('profile.txns.amount'))}</span><span>${esc(t('profile.txns.balance'))}</span><span>${esc(t('profile.txns.time'))}</span></div>
          <ul>${txns.map((x) => `
            <li class="profile-txn-row">
              <span class="profile-txn-type profile-txn-type--${esc(x.txn_type)}">${esc(t(`txn.${x.txn_type}`))}</span>
              <span class="profile-txn-amount num ${x.amount > 0 ? 'is-plus' : 'is-minus'}">${x.amount > 0 ? '+' : '−'}${I18n.num(Math.abs(x.amount))}</span>
              <span class="profile-txn-balance num"><span class="sr-only">${esc(t('profile.txns.balance'))} </span>${I18n.num(x.balance_after)}</span>
              <time class="profile-txn-date" datetime="${esc(x.created_at)}">${esc(I18n.date(x.created_at))}</time>
            </li>`).join('')}</ul>
        </div>`;
    } catch (err) {
      if (seq === this._seq) this._failed(panel, err, 'txns');
    }
  },

  _renderPersona(message) {
    const panel = document.getElementById('panel-persona');
    if (!panel || !this._user) return;
    const esc = UI.esc;
    const current = this._user.mbti_type;
    panel.innerHTML = `
      <div class="persona">
        <p class="persona__intro">${esc(t('persona.intro'))}</p>
        ${message ? `<p class="persona__saved alert alert--ok" role="status">${UI.icon('check')}<span>${esc(message)}</span></p>` : ''}
        <div class="persona__groups" id="mbti-companion">
          ${Object.entries(MBTI.groups).map(([g, codes]) => `
            <div class="persona__group">
              <h3>${esc(t(`persona.group.${g}`))}</h3>
              <div class="persona__codes">${codes.map((c) => `
                <button class="persona__code mbti-type" type="button" data-code="${c}" aria-pressed="${c === current}">
                  <b>${c}</b><span>${esc(MBTI.name(c))}</span>
                </button>`).join('')}</div>
            </div>`).join('')}
        </div>
        <div class="persona__links">
          <a class="btn btn--quiet" href="#/guide">${esc(t('persona.quiz'))}</a>
          ${current ? `<a class="btn btn--ghost btn--sm" id="persona-space" href="#/space">${esc(t('persona.space'))}</a>` : ''}
        </div>
        ${current ? `
          <div class="persona__result">
            <h3>${esc(current)} · ${esc(MBTI.name(current))}</h3>
            <h4>${esc(t('persona.picks', { name: MBTI.name(current, true) }))}</h4>
            <div class="grid-cards persona__picks" id="persona-picks">${UI.skeletonCards(3)}</div>
          </div>` : ''}
      </div>`;
    if (current) this._loadPicks(current);
  },

  async _loadPicks(code) {
    try {
      const res = await API.getJourneys({ mbti: code, limit: 4 });
      const el = document.getElementById('persona-picks');
      if (el) el.innerHTML = (res.data || []).map((j) => UI.journeyCard(j)).join('');
    } catch {
      const el = document.getElementById('persona-picks');
      if (el) el.innerHTML = '';
    }
  },

  async _onClick(e) {
    const pay = e.target.closest('[data-pay]');
    if (pay) {
      const map = await this._journeyMap();
      const j = map.get(Number(pay.dataset.journey));
      if (j) Checkout.resume(pay.dataset.pay, j, { onPaid: () => { this._loadOrders(); this._loadTxns(); this._refreshUser(); } });
      return;
    }
    const reload = e.target.closest('[data-reload]');
    if (reload) { this._loadPanel(reload.dataset.reload); return; }
    const code = e.target.closest('[data-code]');
    if (code) { this._saveMbti(code.dataset.code, code); return; }
  },

  async _saveMbti(code, btn) {
    btn.setAttribute('aria-busy', 'true');
    try {
      await API.updateMBTI(code);
      await this._refreshUser();
      this._renderPersona(t('persona.saved', { name: MBTI.name(code) }));
    } catch (err) {
      btn.removeAttribute('aria-busy');
      UI.toast(I18n.error(err));
    }
  },

  async _refreshUser() {
    const user = await Session.refresh();
    if (user) { this._user = user; this._renderHead(user); }
  },
};
