/**
 * Explore — search + filters + journey grid, and an invitation to the compose game below it.
 * Filter changes update the URL with history.replaceState (no re-render, no hashchange),
 * and every request carries a sequence number so a slow response can never overwrite a newer one.
 */
var Pages = window.Pages || {};

Pages.Explore = {
  PAGE_SIZE: 12,
  REALMS: ['mirror-salt', 'fire-stone', 'ice-night', 'sand-stars', 'mist-temple', 'water-deep', 'city-rules', 'old-roads'],
  _filter: {},
  _page: 1,
  _total: 0,
  _loaded: 0,
  _seq: 0,
  _tags: [],
  _panelOpen: false,
  _debounce: null,
  _cleanup: [],

  _adventure: {
    easy: { min: 1, max: 4, key: 'explore.adv.easy' },
    mid: { min: 5, max: 7, key: 'explore.adv.mid' },
    hard: { min: 8, max: 10, key: 'explore.adv.hard' },
  },

  render(ctx) {
    const esc = UI.esc;
    this._filter = this._fromQuery(ctx.query);
    this._panelOpen = false;
    const main = document.getElementById('main-content');
    main.innerHTML = `
      <div class="page explore">
        <header class="container page__head explore__head">
          <h1>${esc(t('explore.title'))}</h1>
          <p>${esc(t('explore.sub', { n: (window.APP_CONFIG && APP_CONFIG.doors) || 48 }))}</p>
        </header>
        <div class="explore-toolbar" id="explore-toolbar">
          <div class="container">
            <div class="explore-toolbar__row">
              <label class="explore-search">
                ${UI.icon('search')}
                <span class="sr-only">${esc(t('explore.searchLabel'))}</span>
                <input type="search" id="explore-search" autocomplete="off" placeholder="${esc(t('explore.searchPlaceholder'))}">
              </label>
              <div class="explore-facets" role="group" aria-label="${esc(t('explore.realmLabel'))}" id="filter-realm">
                <button class="chip explore-chip" type="button" data-key="realm" data-value="">${esc(t('explore.all'))}</button>
                <button class="chip explore-chip explore-chip--now" type="button" data-key="now" data-value="1"><i aria-hidden="true"></i>${esc(t('home.atlas.now'))}</button>
                ${this.REALMS.map((r) => `<button class="chip explore-chip" type="button" data-key="realm" data-value="${r}" style="--lamp:var(--realm-${r})"><i aria-hidden="true"></i>${esc(t(`entrance.realm.${r}`))}</button>`).join('')}
              </div>
              <div class="explore-filter">
                <button class="btn btn--ghost explore-filter__btn" id="explore-filter-btn" type="button" aria-expanded="false" aria-controls="explore-panel">
                  ${UI.icon('filter')}<span>${esc(t('explore.filters'))}</span><span class="explore-filter__badge" id="explore-filter-count" hidden></span>
                </button>
                <div class="explore-panel" id="explore-panel" role="region" aria-label="${esc(t('explore.filtersTitle'))}" hidden></div>
              </div>
            </div>
            <div class="explore-active" id="explore-active" hidden></div>
          </div>
        </div>
        <section class="container explore-results" aria-label="${esc(t('explore.feed'))}">
          <p class="explore-results__count" id="explore-results" aria-live="polite"></p>
          <div class="grid-cards explore-grid" id="explore-grid" aria-busy="true">${UI.skeletonCards(8)}</div>
          <div class="explore-more" id="explore-loadmore"></div>
        </section>
        <aside class="container compose-invite-wrap" aria-labelledby="compose-invite-title">
          <a class="compose-invite" href="#/compose" id="compose-invite">
            <div class="compose-invite__text">
              <p class="compose-invite__eyebrow">${esc(t('compose.invite.eyebrow'))}</p>
              <h2 class="compose-invite__title" id="compose-invite-title">${esc(t('compose.invite.title'))}</h2>
              <p class="compose-invite__lead">${esc(t('compose.invite.text'))}</p>
              <span class="compose-invite__cta">${esc(t('compose.invite.cta'))}${UI.icon('arrow', 'icon--sm')}</span>
            </div>
            <span class="compose-invite__slips" aria-hidden="true">
              <span class="slip" style="--r:-4deg">${esc(t('compose.invite.slip1'))}</span>
              <span class="slip" style="--r:3deg">${esc(t('compose.invite.slip3'))}</span>
              <span class="slip" style="--r:-1.5deg">${esc(t('compose.invite.slip2'))}</span>
            </span>
          </a>
        </aside>
      </div>`;

    const search = main.querySelector('#explore-search');
    search.value = this._filter.q || '';
    search.addEventListener('input', () => {
      clearTimeout(this._debounce);
      this._debounce = setTimeout(() => this._set('q', search.value.trim()), 300);
    });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { clearTimeout(this._debounce); this._set('q', search.value.trim()); }
    });

    main.querySelector('.explore').addEventListener('click', (e) => this._onClick(e));
    UI.trackCardClicks(main.querySelector('#explore-grid'));

    const onDocClick = (e) => {
      // composedPath survives the clicked node being re-rendered away.
      const inside = e.composedPath().some((n) => n.classList && n.classList.contains('explore-filter'));
      if (this._panelOpen && !inside) this._togglePanel(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape' && this._panelOpen) {
        this._togglePanel(false);
        document.getElementById('explore-filter-btn')?.focus();
      }
    };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    this._cleanup = [() => document.removeEventListener('click', onDocClick), () => document.removeEventListener('keydown', onKey)];

    this._sync();
    this._loadTags();
    this._load(true);
  },

  update(ctx) {
    this._filter = this._fromQuery(ctx.query);
    const search = document.getElementById('explore-search');
    if (search && document.activeElement !== search) search.value = this._filter.q || '';
    this._sync();
    this._load(true);
  },

  destroy() {
    clearTimeout(this._debounce);
    document.body.classList.remove('explore-panel-open');
    this._cleanup.forEach((fn) => fn());
    this._cleanup = [];
    this._seq++;
  },

  // ---------- state ----------
  _fromQuery(query) {
    const f = {};
    ['q', 'realm', 'now', 'fantasy_type', 'mbti', 'tag', 'visual_style'].forEach((k) => {
      const v = query.get(k);
      if (v) f[k] = v;
    });
    const min = parseInt(query.get('adventure_min'), 10);
    const max = parseInt(query.get('adventure_max'), 10);
    if (min || max) {
      const match = Object.entries(this._adventure).find(([, r]) => r.min === (min || 1) && r.max === (max || 10));
      if (match) f.adventure = match[0];
      else if (max && max <= 4) f.adventure = 'easy';
      else if (min && min >= 8) f.adventure = 'hard';
    }
    return f;
  },

  _params() {
    const p = {};
    ['q', 'realm', 'now', 'fantasy_type', 'mbti', 'tag', 'visual_style'].forEach((k) => { if (this._filter[k]) p[k] = this._filter[k]; });
    const adv = this._adventure[this._filter.adventure];
    if (adv) { p.adventure_min = adv.min; p.adventure_max = adv.max; }
    return p;
  },

  _set(key, value) {
    if (value) this._filter[key] = value;
    else delete this._filter[key];
    Router.replaceQuery(this._params());
    this._sync();
    this._load(true);
  },

  _clearAll() {
    const q = this._filter.q;
    this._filter = {};
    const search = document.getElementById('explore-search');
    if (search) search.value = '';
    if (!q && !Object.keys(this._params()).length) return;
    Router.replaceQuery({});
    this._sync();
    this._load(true);
  },

  _onClick(e) {
    const chip = e.target.closest('[data-key]');
    if (chip) {
      const { key, value } = chip.dataset;
      const current = this._filter[key] || '';
      // the realm row behaves like tabs (All + one); "open now" and panel choices toggle.
      const next = key === 'realm' ? value : (current === value ? '' : value);
      this._set(key, next);
      return;
    }
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.id === 'explore-filter-btn') { e.stopPropagation(); this._togglePanel(!this._panelOpen); return; }
    if (btn.dataset.remove) { this._set(btn.dataset.remove, ''); if (btn.dataset.remove === 'q') document.getElementById('explore-search').value = ''; return; }
    if (btn.dataset.action === 'clear') { this._clearAll(); return; }
    if (btn.dataset.action === 'done') { this._togglePanel(false); document.getElementById('explore-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (btn.id === 'btn-loadmore') { this._page++; this._load(false); return; }
    if (btn.dataset.action === 'retry') { this._load(true); }
  },

  _togglePanel(open) {
    this._panelOpen = open;
    const panel = document.getElementById('explore-panel');
    const btn = document.getElementById('explore-filter-btn');
    if (!panel || !btn) return;
    btn.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    document.body.classList.toggle('explore-panel-open', open);
    if (open) {
      this._renderPanel();
      panel.querySelector('button')?.focus();
    }
  },

  _renderPanel() {
    const panel = document.getElementById('explore-panel');
    if (!panel || panel.hidden) return;
    const esc = UI.esc;
    const choice = (key, value, label, extra = '') => {
      const on = (this._filter[key] || '') === value;
      return `<button class="chip explore-chip ${on ? 'explore-chip--active' : ''} ${extra}" type="button" data-key="${key}" data-value="${esc(value)}" aria-pressed="${on}">${esc(label)}</button>`;
    };
    panel.innerHTML = `
      <div class="explore-panel__section">
        <h3>${esc(t('explore.mood'))}</h3>
        <div class="explore-panel__chips" id="filter-fantasy">${UI.fantasyTypes.map((f) => choice('fantasy_type', f, t(`fantasy.${f}`))).join('')}</div>
      </div>
      <div class="explore-panel__section">
        <h3>${esc(t('explore.mbti'))}<em>${esc(t('explore.mbtiHint'))}</em></h3>
        <div class="explore-panel__mbti" id="filter-mbti">${MBTI.codes.map((c) => choice('mbti', c, c)).join('')}</div>
      </div>
      <div class="explore-panel__section">
        <h3>${esc(t('explore.adventure'))}</h3>
        <div class="seg" id="filter-adventure">
          <button type="button" data-key="adventure" data-value="" aria-pressed="${!this._filter.adventure}">${esc(t('explore.adv.any'))}</button>
          ${Object.entries(this._adventure).map(([k, r]) => `<button type="button" data-key="adventure" data-value="${k}" aria-pressed="${this._filter.adventure === k}">${esc(t(r.key))}</button>`).join('')}
        </div>
      </div>
      <div class="explore-panel__section">
        <h3>${esc(t('explore.tags'))}</h3>
        <div class="explore-panel__chips" id="filter-tags">${this._tags.map((tag) => choice('tag', tag.slug, UI.tagLabel(tag))).join('')}</div>
      </div>
      <div class="explore-panel__section">
        <h3>${esc(t('explore.style'))}</h3>
        <div class="explore-panel__chips" id="filter-visual">${['raw', 'surreal', 'minimal', 'dramatic'].map((s) => choice('visual_style', s, t(`style.${s}`))).join('')}</div>
      </div>
      <div class="explore-panel__foot">
        <button class="btn btn--quiet" type="button" data-action="clear">${esc(t('explore.clearAll'))}</button>
        <button class="btn btn--primary" type="button" data-action="done" id="explore-panel-done">${esc(t('explore.showN', { n: this._total }))}</button>
      </div>`;
  },

  _activeFilters() {
    const list = [];
    const f = this._filter;
    if (f.q) list.push(['q', `“${f.q}”`]);
    if (f.realm) list.push(['realm', t(`entrance.realm.${f.realm}`)]);
    if (f.now) list.push(['now', t('home.atlas.now')]);
    if (f.fantasy_type) list.push(['fantasy_type', UI.fantasyLabel(f.fantasy_type)]);
    if (f.mbti) list.push(['mbti', f.mbti]);
    if (f.adventure && this._adventure[f.adventure]) list.push(['adventure', t(this._adventure[f.adventure].key)]);
    if (f.tag) {
      const tag = this._tags.find((x) => x.slug === f.tag);
      list.push(['tag', tag ? UI.tagLabel(tag) : t(`tag.${f.tag}`)]);
    }
    if (f.visual_style) list.push(['visual_style', t(`style.${f.visual_style}`)]);
    return list;
  },

  _sync() {
    const esc = UI.esc;
    document.querySelectorAll('#filter-realm [data-key]').forEach((chip) => {
      const on = (this._filter[chip.dataset.key] || '') === chip.dataset.value;
      chip.setAttribute('aria-pressed', String(on));
      chip.classList.toggle('explore-chip--active', on);
    });
    const panelCount = ['fantasy_type', 'mbti', 'tag', 'visual_style', 'adventure'].filter((k) => this._filter[k]).length;
    const badge = document.getElementById('explore-filter-count');
    if (badge) { badge.hidden = !panelCount; badge.textContent = panelCount || ''; }

    const active = this._activeFilters();
    const row = document.getElementById('explore-active');
    if (row) {
      row.hidden = !active.length;
      row.innerHTML = active.length ? `
        <span>${esc(t('explore.selected'))}</span>
        ${active.map(([key, label]) => `<button class="chip chip--sm" type="button" data-remove="${key}" aria-label="${esc(t('explore.remove', { label }))}">${esc(label)}${UI.icon('close', 'icon--sm')}</button>`).join('')}
        <button class="btn btn--quiet btn--sm" type="button" data-action="clear">${esc(t('explore.clearAll'))}</button>` : '';
    }
    this._syncPanel();
  },

  // Update pressed states in place so keyboard focus stays on the control the user pressed.
  _syncPanel() {
    const panel = document.getElementById('explore-panel');
    if (!panel || panel.hidden) return;
    panel.querySelectorAll('[data-key]').forEach((el) => {
      const on = (this._filter[el.dataset.key] || '') === el.dataset.value;
      el.setAttribute('aria-pressed', String(on));
      el.classList.toggle('explore-chip--active', on && el.classList.contains('chip'));
    });
  },

  // ---------- data ----------
  async _loadTags() {
    try {
      const res = await API.getTags();
      this._tags = res.data || [];
      this._renderPanel();
      this._sync();
    } catch (err) {
      console.warn('Tag load failed:', err);
    }
  },

  async _load(reset) {
    const seq = ++this._seq;
    const grid = document.getElementById('explore-grid');
    const more = document.getElementById('explore-loadmore');
    const count = document.getElementById('explore-results');
    if (!grid) return;
    if (reset) {
      this._page = 1;
      grid.setAttribute('aria-busy', 'true');
      grid.innerHTML = UI.skeletonCards(8);
      more.innerHTML = '';
    } else {
      more.innerHTML = `<button class="btn btn--ghost" type="button" id="btn-loadmore" aria-busy="true" disabled>${UI.esc(t('common.loading'))}</button>`;
    }

    try {
      const { now, ...params } = this._params();
      // "open now" is judged on each door's own clock, so it looks at every door at once
      const res = now
        ? await API.getJourneys({ ...params, page: 1, limit: 100 })
        : await API.getJourneys({ ...params, page: this._page, limit: this.PAGE_SIZE });
      if (seq !== this._seq || !grid.isConnected) return; // a newer request owns the grid
      let journeys = res.data || [];
      this._total = res.total || 0;
      if (now) {
        journeys = journeys.filter((j) => j.entrance && DoorClock.state(j.entrance).open);
        this._total = journeys.length;
      }
      if (reset) {
        this._loaded = journeys.length;
        grid.innerHTML = journeys.length
          ? journeys.map((j, i) => UI.journeyCard(j, { eager: i < 4 })).join('')
          : this._emptyState();
      } else {
        this._loaded += journeys.length;
        grid.insertAdjacentHTML('beforeend', journeys.map((j) => UI.journeyCard(j)).join(''));
      }
      count.textContent = this._total ? t('explore.count', { n: I18n.num(this._total) }) : '';
      if (this._loaded < this._total) {
        more.innerHTML = `<button class="btn btn--ghost" type="button" id="btn-loadmore">${UI.esc(t('explore.loadMore'))}</button>`;
      } else {
        more.innerHTML = this._total > this.PAGE_SIZE ? `<p class="explore-more__end">${UI.esc(t('explore.end'))}</p>` : '';
      }
      const done = document.getElementById('explore-panel-done');
      if (done) done.textContent = t('explore.showN', { n: this._total });
    } catch (err) {
      if (seq !== this._seq || !grid.isConnected) return;
      if (reset) {
        count.textContent = '';
        grid.innerHTML = `<div class="state" role="alert">
          <p class="state__title">${UI.esc(t('explore.error.title'))}</p>
          <p class="state__text">${UI.esc(I18n.error(err))}</p>
          <div class="state__actions"><button class="btn btn--ghost" type="button" data-action="retry">${UI.icon('refresh')}${UI.esc(t('common.retry'))}</button></div>
        </div>`;
      } else {
        this._page--;
        more.innerHTML = `<button class="btn btn--ghost" type="button" id="btn-loadmore">${UI.esc(t('common.retry'))}</button>`;
      }
    } finally {
      if (seq === this._seq && grid.isConnected) grid.setAttribute('aria-busy', 'false');
    }
  },

  _emptyState() {
    const hasFilters = Object.keys(this._filter).length > 0;
    return `<div class="state explore-empty">
      <p class="state__title">${UI.esc(t('explore.empty.title'))}</p>
      <p class="state__text">${UI.esc(t('explore.empty.text'))}</p>
      ${hasFilters ? `<div class="state__actions"><button class="btn btn--primary" type="button" data-action="clear">${UI.esc(t('explore.clearAll'))}</button></div>` : ''}
    </div>`;
  },
};
