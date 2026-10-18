/**
 * Admin dashboard — live metrics refreshed every 5 s while the page is open
 * (the timer is cleared on route change and paused while the tab is hidden).
 */
var Pages = window.Pages || {};

Pages.Admin = {
  _timer: null,
  _seq: 0,
  _titles: null,

  async render() {
    const seq = ++this._seq;
    if (!API.isLoggedIn()) { Router.navigate('/admin-login'); return; }
    const user = await Session.load(true);
    if (seq !== this._seq) return;
    if (!user) { Router.navigate('/admin-login'); return; }
    if (user.role !== 'admin') { Pages.Error.render(403); return; }

    const esc = UI.esc;
    const metric = (key, id) => `<div class="admin-metric"><p>${esc(t(key))}</p><b class="num" id="${id}">—</b></div>`;
    const panel = (key, id) => `<section class="admin-panel"><h2>${esc(t(key))}</h2><div class="admin-list" id="${id}">${esc(t('common.loading'))}</div></section>`;
    document.getElementById('main-content').innerHTML = `
      <div class="page admin">
        <div class="container">
          <header class="admin-head">
            <div>
              <p class="admin-head__kicker">${esc(t('admin.kicker'))}</p>
              <h1>${esc(t('admin.title'))}</h1>
            </div>
            <div class="admin-head__actions">
              <span id="admin-updated" aria-live="polite">${esc(t('admin.syncing'))}</span>
              <button class="btn btn--ghost btn--sm" id="admin-export-csv" type="button">${esc(t('admin.export'))}</button>
            </div>
          </header>
          <div class="admin-metrics">
            ${metric('admin.m.users', 'admin-stat-users')}
            ${metric('admin.m.journeys', 'admin-stat-journeys')}
            ${metric('admin.m.balance', 'admin-stat-balance')}
            ${metric('admin.m.points', 'admin-stat-points')}
            ${metric('admin.m.orders', 'admin-stat-orders')}
            ${metric('admin.m.revenue', 'admin-stat-revenue')}
            ${metric('admin.m.audit', 'admin-stat-audit-errors')}
            ${metric('admin.m.events', 'admin-stat-events')}
          </div>
          <div class="admin-panels">
            ${panel('admin.p.clicked', 'admin-top-clicked')}
            ${panel('admin.p.purchased', 'admin-top-purchased')}
            ${panel('admin.p.mbti', 'admin-mbti')}
            ${panel('admin.p.gender', 'admin-gender')}
            ${panel('admin.p.purchaseGender', 'admin-purchase-gender')}
            ${panel('admin.p.users', 'admin-users')}
          </div>
        </div>
      </div>`;
    document.getElementById('admin-export-csv').addEventListener('click', () => this._exportCSV());
    await this._load();
    if (seq !== this._seq) return;
    this._timer = setInterval(() => { if (!document.hidden) this._load(); }, 5000);
  },

  destroy() {
    this._seq++;
    clearInterval(this._timer);
    this._timer = null;
  },

  async _load() {
    try {
      if (!this._titles || this._titles.lang !== I18n.lang) {
        // Stats carry base-language titles; show the reader's language when we have it.
        const list = await API.getJourneys({ limit: 100 }).catch(() => ({ data: [] }));
        this._titles = { lang: I18n.lang, map: new Map((list.data || []).map((j) => [j.slug, j.title])) };
      }
      const [statsRes, usersRes] = await Promise.all([API.adminStats(), API.adminUsers()]);
      const s = statsRes.data || {};
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set('admin-stat-users', I18n.num(s.total_users));
      set('admin-stat-journeys', I18n.num(s.total_journeys));
      set('admin-stat-balance', UI.coins(s.total_balance));
      set('admin-stat-points', I18n.num(s.total_points));
      set('admin-stat-orders', `${I18n.num(s.paid_orders)} / ${I18n.num(s.total_orders)}`);
      set('admin-stat-revenue', UI.coins(s.gross_revenue));
      set('admin-stat-audit-errors', `${I18n.num(s.audit_errors)} / ${I18n.num(s.audit_logs)}`);
      set('admin-stat-events', I18n.num(s.analytics_events));
      set('admin-updated', t('admin.synced', { time: I18n.time(new Date()) }));
      this._bars('admin-top-clicked', s.top_clicked_journeys, 'admin.noClicks', false);
      this._bars('admin-top-purchased', s.top_purchased_journeys, 'admin.noPaid', true);
      this._dist('admin-mbti', s.mbti_distribution, (l) => (l === 'unknown' || !l ? t('gender.unknown') : l));
      this._dist('admin-gender', s.gender_distribution, (l) => this._gender(l));
      this._dist('admin-purchase-gender', s.purchase_gender_distribution, (l) => this._gender(l));
      this._users(usersRes.data || []);
    } catch (err) {
      const el = document.getElementById('admin-updated');
      if (el) el.textContent = `${t('admin.syncFailed')} · ${I18n.error(err)}`;
    }
  },

  _gender(label) {
    const key = `gender.${label}`;
    const v = t(key);
    return v === key ? t('gender.unknown') : v;
  },

  _bars(id, rows, emptyKey, revenue) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!rows || !rows.length) { el.innerHTML = `<p class="admin-empty">${UI.esc(t(emptyKey))}</p>`; return; }
    const max = Math.max(...rows.map((r) => r.count || 0), 1);
    el.innerHTML = rows.map((r) => {
      const width = Math.max(4, Math.round(((r.count || 0) / max) * 100));
      const tail = revenue ? `${UI.coins(r.revenue || 0)}${typeof r.rate === 'number' ? ` · ${Math.round(r.rate * 100)}%` : ''}` : t('admin.times', { n: r.count || 0 });
      return `<div class="admin-bar"><div class="admin-bar__top"><span>${UI.esc((this._titles && this._titles.map.get(r.slug)) || r.title || r.slug)}</span><em class="num">${UI.esc(tail)}</em></div><div class="bar"><b style="width:${width}%"></b></div></div>`;
    }).join('');
  },

  _dist(id, rows, label) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!rows || !rows.length) { el.innerHTML = `<p class="admin-empty">${UI.esc(t('admin.empty'))}</p>`; return; }
    el.innerHTML = rows.map((r) => {
      const pct = Math.round((r.percent || 0) * 100);
      return `<div class="admin-bar"><div class="admin-bar__top"><span>${UI.esc(label(r.label))}</span><em class="num">${I18n.num(r.count)} · ${pct}%</em></div><div class="bar"><b style="width:${Math.max(3, pct)}%"></b></div></div>`;
    }).join('');
  },

  _users(users) {
    const el = document.getElementById('admin-users');
    if (!el) return;
    if (!users.length) { el.innerHTML = `<p class="admin-empty">${UI.esc(t('admin.noUsers'))}</p>`; return; }
    el.innerHTML = `<ul class="admin-users">${users.slice(0, 8).map((u) => `
      <li><span>${UI.esc(u.username || u.email)}</span><em class="num">${UI.esc(t(`admin.role.${u.role}`))} · ${UI.esc(UI.coins(u.balance))} · ${I18n.num(u.points)} ${UI.esc(t('common.points'))}</em></li>`).join('')}</ul>`;
  },

  async _exportCSV() {
    const btn = document.getElementById('admin-export-csv');
    btn.setAttribute('aria-busy', 'true');
    try {
      const res = await API.adminExport('csv');
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: '100-journeys-admin-stats.csv' });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      UI.toast(`${t('admin.exportFailed')} · ${I18n.error(err)}`);
    } finally {
      btn.removeAttribute('aria-busy');
    }
  },
};
