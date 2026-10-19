/**
 * Station — #/station, the Night Station (夜站): a hall of eight platforms (the eight realms) where
 * travellers' tickets hang in racks. Find tickets by the station clock (hour), the season ring,
 * the destination board (place), luggage tags and the enquiry desk (search); order them by the
 * brightest light, the newest, or the most borrowed. One carriage of 24 at a time and then the
 * next train: no endless scrolling. Every filter lives in the hash, so a view can be passed on:
 *   #/station?realm=ice-night&hour=night&season=polar-night&place=tromso&tag=aurora&q=…&sort=new
 * A ticket opens to its back (Road.open).
 */
var Pages = window.Pages || {};

Pages.Station = {
  _seq: 0,
  _by: null,
  _list: null,
  _cursors: [''],
  _page: 0,
  _items: [],
  _next: '',
  _cleanup: [],
  FILTERS: ['realm', 'season', 'hour', 'place', 'tag', 'q', 'sort'],

  render(ctx) {
    const seq = ++this._seq;
    this._teardown();
    this._filters = this._read(ctx.query);
    this._cursors = [''];
    this._page = 0;
    const main = document.getElementById('main-content');
    const esc = UI.esc;
    const now = new Date();
    const hour = Road.hourNow(now);
    const hhmm = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    main.innerHTML = `
      <div class="page station" data-hour="${esc(this._filters.hour || hour)}">
        <header class="station__hall">
          <div class="station__art" id="station-art" aria-hidden="true"></div>
          <div class="container station__hall-inner">
            <div class="flapboard" role="img" aria-label="${esc(t('station.clockAria', { time: `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`, hour: t(`entrance.time.${hour}`) }))}">
              <span class="flapboard__time">${[...hhmm].map((d, i) => `${i === 2 ? '<i class="flapboard__colon">:</i>' : ''}<span class="flap" style="--k:${i}"><span>${d}</span></span>`).join('')}</span>
              <span class="flapboard__hour"><span class="flap flap--word" style="--k:5"><span>${esc(t(`entrance.time.${hour}`))}</span></span></span>
            </div>
            <h1 class="station__title">${esc(t('station.title'))}</h1>
            <p class="station__lead">${esc(t('station.lead'))}</p>
          </div>
        </header>
        <nav class="station__platforms" aria-label="${esc(t('station.platforms'))}">
          <div class="container"><ul class="platforms" id="station-platforms"></ul></div>
        </nav>
        <div class="container station__body">
          <div class="station__bar">
            <form class="enquiry" role="search" id="station-enquiry">
              <label class="enquiry__label" for="station-q">${esc(t('station.enquiry'))}</label>
              <div class="enquiry__field">
                <input class="enquiry__input" id="station-q" name="q" type="search" maxlength="40" autocomplete="off" enterkeyhint="search" placeholder="${esc(t('station.enquiryPh'))}" value="${esc(this._filters.q || '')}">
                <button class="btn btn--ghost btn--sm" type="submit">${UI.icon('search')}<span>${esc(t('station.ask'))}</span></button>
              </div>
            </form>
            <div class="sortboard" role="radiogroup" aria-label="${esc(t('station.sort'))}" id="station-sort"></div>
            <button class="btn btn--ghost station__tt-btn" type="button" id="station-tt-btn" aria-expanded="false" aria-controls="station-timetable">${UI.icon('filter')}<span id="station-tt-label">${esc(t('station.timetable'))}</span></button>
          </div>
          <section class="timetable" id="station-timetable" hidden aria-label="${esc(t('station.timetable'))}"></section>
          <section class="racks" aria-labelledby="station-carriage">
            <p class="racks__carriage num" id="station-carriage" tabindex="-1"></p>
            <div id="station-grid" aria-busy="true"><ul class="racks__grid">${Array.from({ length: 8 }, () => '<li><div class="stub-skeleton skeleton"></div></li>').join('')}</ul></div>
            <nav class="trains" id="station-trains" aria-label="${esc(t('station.carriage', { n: '' }))}"></nav>
          </section>
        </div>
      </div>`;
    API.track('station_enter', '', { hour });
    this._hallArt();
    this._renderSigns(); // platforms and the order board need no data: no jump when the racks arrive
    Promise.all([Compose.fragments(), Road.vocab()])
      .then(([list, vocab]) => {
        if (seq !== this._seq) return;
        this._list = list;
        this._by = Compose.index(list);
        this._vocab = vocab;
        this._renderControls();
        this._bind(main);
        this._load(seq);
      })
      .catch((err) => { if (seq === this._seq) this._error(err); });
  },

  update(ctx) {
    const next = this._read(ctx.query);
    if (JSON.stringify(next) === JSON.stringify(this._filters)) return;
    this._filters = next;
    this._cursors = [''];
    this._page = 0;
    if (this._by) { this._renderControls(); this._load(this._seq); }
  },

  destroy() {
    this._seq++;
    this._teardown();
  },

  _teardown() {
    this._cleanup.forEach((fn) => fn());
    this._cleanup = [];
  },

  /** The empty concourse at night behind the hall's header (a phone crop on narrow screens). By
   *  day the hall stays painted in CSS, so the photograph is only fetched in the dark theme. */
  _hallArt() {
    const put = () => {
      const box = document.getElementById('station-art');
      if (!box) return;
      const dark = document.documentElement.getAttribute('data-theme') !== 'light';
      if (!dark) { box.innerHTML = ''; return; }
      if (box.firstChild) return;
      const src = (name) => API.mediaUrl(`generated/road/${name}`);
      const esc = UI.esc;
      box.innerHTML = `
        <picture>
          <source media="(max-width: 760px)" type="image/avif" srcset="${esc(src('station-hall-night-phone.600.avif'))} 600w, ${esc(src('station-hall-night-phone.1024.avif'))} 1024w" sizes="100vw">
          <source media="(max-width: 760px)" srcset="${esc(src('station-hall-night-phone.jpg'))}">
          <source type="image/avif" srcset="${esc(src('station-hall-night.960.avif'))} 960w, ${esc(src('station-hall-night.1536.avif'))} 1536w" sizes="100vw">
          <img src="${esc(src('station-hall-night.jpg'))}" alt="" width="960" height="300" decoding="async" fetchpriority="high">
        </picture>`;
    };
    put();
    const watch = new MutationObserver(put);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    this._cleanup.push(() => watch.disconnect());
  },

  _read(query) {
    const f = {};
    this.FILTERS.forEach((k) => { const v = (query.get(k) || '').trim(); if (v) f[k] = v; });
    if (f.sort && !['bright', 'new', 'borrowed'].includes(f.sort)) delete f.sort;
    return f;
  },

  _set(changes, { track = true } = {}) {
    const next = { ...this._filters, ...changes };
    Object.keys(next).forEach((k) => { if (!next[k]) delete next[k]; });
    this._filters = next;
    this._cursors = [''];
    this._page = 0;
    Router.replaceQuery(next);
    if (track) API.track('station_filter', '', { filters: Object.keys(next).filter((k) => k !== 'sort').join(',') });
    this._renderControls();
    this._load(this._seq);
  },

  // ---------- controls ----------
  _renderControls() {
    this._renderSigns();
    this._renderTimetable();
  },

  _renderSigns() {
    const esc = UI.esc;
    const f = this._filters;
    const page = document.querySelector('.station');
    if (page) page.dataset.hour = f.hour || Road.hourNow();
    document.getElementById('station-platforms').innerHTML = [''].concat(Road.REALMS).map((r) => `
      <li><button type="button" class="platform${r ? '' : ' platform--all'}" data-realm="${r}" aria-pressed="${(f.realm || '') === r}">
        <span class="platform__lamp" aria-hidden="true"></span>
        ${r ? `<span class="platform__no num">${Road.platform(r)}</span>` : ''}
        <span class="platform__name">${esc(r ? Road.realmLabel(r) : t('station.platform.all'))}</span>
      </button></li>`).join('');
    const sort = f.sort || 'bright';
    document.getElementById('station-sort').innerHTML = ['bright', 'new', 'borrowed'].map((s) => `
      <button type="button" role="radio" class="sortboard__opt" data-sort="${s}" aria-checked="${sort === s}" tabindex="${sort === s ? 0 : -1}"><span>${esc(t(`station.sort.${s}`))}</span></button>`).join('');
    const n = ['season', 'hour', 'place', 'tag'].filter((k) => f[k]).length;
    document.getElementById('station-tt-label').textContent = n ? t('station.timetableN', { n }) : t('station.timetable');
  },

  _renderTimetable() {
    const esc = UI.esc;
    const f = this._filters;
    const box = document.getElementById('station-timetable');
    const places = this._list.filter((x) => x.group === 'place');
    const byRealm = {};
    places.forEach((p) => { (byRealm[p.realm || ''] = byRealm[p.realm || ''] || []).push(p); });
    const hourIdx = f.hour ? Road.HOURS.indexOf(f.hour) + 1 : 0;
    const angle = (i) => (i - 1) * (360 / Road.HOURS.length);
    const kinds = ['world', 'mood', 'practice'];
    box.innerHTML = `
      <div class="timetable__grid">
        <div class="tt-block tt-clock">
          <h3 id="tt-clock-label">${esc(t('station.clock'))}</h3>
          <div class="clock" style="--hand:${hourIdx ? angle(hourIdx) : 0}deg" data-any="${!hourIdx}">
            <svg class="clock__face" viewBox="-100 -100 200 200" aria-hidden="true">
              <circle r="92" class="clock__rim"/>
              ${Road.HOURS.map((h, i) => {
                const a0 = ((angle(i + 1) - 20) * Math.PI) / 180;
                const a1 = ((angle(i + 1) + 20) * Math.PI) / 180;
                const p = (a, r) => `${(Math.sin(a) * r).toFixed(1)} ${(-Math.cos(a) * r).toFixed(1)}`;
                return `<path class="clock__arc${f.hour === h ? ' is-on' : ''}" d="M ${p(a0, 86)} A 86 86 0 0 1 ${p(a1, 86)} L ${p(a1, 64)} A 64 64 0 0 0 ${p(a0, 64)} Z"/>`;
              }).join('')}
              <line class="clock__hand" x1="0" y1="8" x2="0" y2="-70"/>
              <circle r="5" class="clock__pin"/>
            </svg>
            <div class="clock__hours">${Road.HOURS.map((h, i) => `<button type="button" class="clock__h" data-hour="${h}" style="--a:${angle(i + 1)}deg" aria-pressed="${f.hour === h}" tabindex="-1">${esc(t(`entrance.time.${h}`))}</button>`).join('')}</div>
            <button type="button" class="clock__dial" role="slider" aria-labelledby="tt-clock-label" aria-describedby="tt-clock-help" aria-valuemin="0" aria-valuemax="${Road.HOURS.length}" aria-valuenow="${hourIdx}" aria-valuetext="${esc(f.hour ? t(`entrance.time.${f.hour}`) : t('station.hour.any'))}">
              <span>${esc(f.hour ? t(`entrance.time.${f.hour}`) : t('station.hour.any'))}</span>
            </button>
            <span class="sr-only" id="tt-clock-help">${esc(t('station.clockHelp'))}</span>
          </div>
        </div>
        <div class="tt-block">
          <h3 id="tt-season">${esc(t('station.season'))}</h3>
          <div class="ring" role="group" aria-labelledby="tt-season">
            ${[''].concat(Road.SEASONS).map((s) => `<button type="button" class="chip chip--sm ring__s" data-season="${s}" aria-pressed="${(f.season || '') === s}">${esc(s ? t(`entrance.season.${s}`) : t('station.season.any'))}</button>`).join('')}
          </div>
          <h3><label for="tt-place">${esc(t('station.place'))}</label></h3>
          <div class="input input--select destination">
            <select id="tt-place">
              <option value="">${esc(t('station.place.any'))}</option>
              ${Road.REALMS.concat(['']).filter((r) => byRealm[r]).map((r) => `<optgroup label="${esc(r ? Road.realmLabel(r) : t('stub.near'))}">${byRealm[r].map((p) => `<option value="${esc(p.key)}" ${f.place === p.key ? 'selected' : ''}>${esc(p.no ? `№${p.no} ` : '')}${esc(p.text)}</option>`).join('')}</optgroup>`).join('')}
            </select>
          </div>
        </div>
        <div class="tt-block tt-tags">
          <h3>${esc(t('station.tags'))}</h3>
          ${kinds.map((k) => `
            <div class="luggage" role="group" aria-label="${esc(t(`station.tagKind.${k}`))}">
              <p class="luggage__kind">${esc(t(`station.tagKind.${k}`))}</p>
              ${this._vocab.tags.filter((x) => x.kind === k).map((x) => `<button type="button" class="ltag ltag--btn" data-tag="${esc(x.key)}" aria-pressed="${f.tag === x.key}">${esc(x.label)}</button>`).join('')}
            </div>`).join('')}
        </div>
      </div>
      <div class="timetable__foot">
        <button type="button" class="btn btn--quiet btn--sm" id="tt-clear" ${Object.keys(f).some((k) => !['sort', 'realm'].includes(k)) ? '' : 'disabled'}>${esc(t('station.clear'))}</button>
        <button type="button" class="btn btn--ghost btn--sm" id="tt-close">${esc(t('station.close'))}</button>
      </div>`;
  },

  _bind(main) {
    const root = main.querySelector('.station');
    root.addEventListener('click', (e) => {
      const plat = e.target.closest('.platform');
      if (plat) { this._set({ realm: plat.dataset.realm === this._filters.realm ? '' : plat.dataset.realm }); return; }
      const sort = e.target.closest('.sortboard__opt');
      if (sort) { this._set({ sort: sort.dataset.sort === 'bright' ? '' : sort.dataset.sort }, { track: false }); this._focusSort(); return; }
      const h = e.target.closest('.clock__h');
      if (h) { this._set({ hour: this._filters.hour === h.dataset.hour ? '' : h.dataset.hour }); document.querySelector('.clock__dial')?.focus(); return; }
      const s = e.target.closest('.ring__s');
      if (s) { this._set({ season: s.dataset.season }); document.querySelector(`.ring__s[data-season="${s.dataset.season}"]`)?.focus(); return; }
      const tag = e.target.closest('.ltag--btn');
      if (tag) { this._set({ tag: this._filters.tag === tag.dataset.tag ? '' : tag.dataset.tag }); document.querySelector(`.ltag--btn[data-tag="${tag.dataset.tag}"]`)?.focus(); return; }
      if (e.target.closest('#tt-clear')) { this._set({ season: '', hour: '', place: '', tag: '', q: '' }); document.getElementById('station-q').value = ''; return; }
      if (e.target.closest('#tt-close')) { this._toggleTimetable(false); return; }
      if (e.target.closest('#station-tt-btn')) { this._toggleTimetable(); return; }
      const stub = e.target.closest('.stub');
      if (stub) {
        const v = this._items.find((x) => x.code === stub.dataset.code);
        if (v) Road.open(v, this._by, { onBlocked: () => this._load(this._seq, { keep: true }) });
        return;
      }
      const train = e.target.closest('[data-train]');
      if (train) this._train(train.dataset.train);
    });
    root.addEventListener('change', (e) => {
      if (e.target.id === 'tt-place') { this._set({ place: e.target.value }); document.getElementById('tt-place')?.focus(); }
    });
    root.querySelector('#station-enquiry').addEventListener('submit', (e) => {
      e.preventDefault();
      this._set({ q: root.querySelector('#station-q').value.trim().slice(0, 40) });
    });
    root.addEventListener('keydown', (e) => {
      const opt = e.target.closest('.sortboard__opt');
      if (opt && ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        const opts = [...root.querySelectorAll('.sortboard__opt')];
        const i = opts.indexOf(opt) + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1);
        const next = opts[(i + opts.length) % opts.length];
        this._set({ sort: next.dataset.sort === 'bright' ? '' : next.dataset.sort }, { track: false });
        this._focusSort();
      }
      const dial = e.target.closest('.clock__dial');
      if (dial) this._dialKey(e);
    });
    this._bindClock(root);
  },

  _focusSort() { document.querySelector('.sortboard__opt[aria-checked="true"]')?.focus(); },

  _toggleTimetable(force) {
    const box = document.getElementById('station-timetable');
    const btn = document.getElementById('station-tt-btn');
    const open = force == null ? box.hidden : force;
    box.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) box.querySelector('.clock__dial')?.focus();
    else btn.focus();
  },

  // ---------- the station clock ----------
  _dialKey(e) {
    const idx = this._filters.hour ? Road.HOURS.indexOf(this._filters.hour) + 1 : 0;
    const n = Road.HOURS.length;
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = (idx + 1) % (n + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = (idx - 1 + n + 1) % (n + 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n;
    if (next == null) return;
    e.preventDefault();
    this._set({ hour: next ? Road.HOURS[next - 1] : '' });
    document.querySelector('.clock__dial')?.focus();
  },

  /** Dragging the hand sweeps the hall's light and dims the tickets of other hours; letting go
   *  takes the train of that hour. */
  _bindClock(root) {
    let drag = null;
    const hourAt = (e, clock) => {
      const r = clock.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2);
      const y = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(x, y) < r.width * 0.18) return '';
      let a = (Math.atan2(x, -y) * 180) / Math.PI;
      if (a < 0) a += 360;
      const step = 360 / Road.HOURS.length;
      return Road.HOURS[Math.round(a / step) % Road.HOURS.length];
    };
    const preview = (hour) => {
      const page = root;
      page.dataset.hour = hour || Road.hourNow();
      const clock = root.querySelector('.clock');
      const i = hour ? Road.HOURS.indexOf(hour) : 0;
      clock.style.setProperty('--hand', `${i * (360 / Road.HOURS.length)}deg`);
      clock.dataset.any = String(!hour);
      root.querySelectorAll('.clock__arc').forEach((arc, k) => arc.classList.toggle('is-on', Road.HOURS[k] === hour));
      root.querySelectorAll('.racks__grid .stub').forEach((s) => {
        const v = this._items.find((x) => x.code === s.dataset.code);
        s.classList.toggle('is-dim', !!hour && v && v.picks.hour !== hour);
      });
    };
    root.addEventListener('pointerdown', (e) => {
      const face = e.target.closest('.clock__face');
      if (!face || e.button !== 0) return;
      const clock = face.closest('.clock');
      e.preventDefault();
      drag = { clock, hour: hourAt(e, clock), id: e.pointerId };
      face.setPointerCapture(e.pointerId);
      preview(drag.hour);
    });
    root.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const h = hourAt(e, drag.clock);
      if (h !== drag.hour) { drag.hour = h; preview(h); }
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const h = drag.hour;
      drag = null;
      this._set({ hour: h });
      document.querySelector('.clock__dial')?.focus({ preventScroll: true });
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
  },

  // ---------- carriages ----------
  _query() {
    const q = { ...this._filters };
    if (this._cursors[this._page]) q.cursor = this._cursors[this._page];
    return q;
  },

  async _load(seq, { keep = false } = {}) {
    const grid = document.getElementById('station-grid');
    if (!grid) return;
    if (!keep) grid.setAttribute('aria-busy', 'true');
    let res;
    try {
      res = await API.station(this._query());
    } catch (err) {
      if (seq !== this._seq) return;
      grid.removeAttribute('aria-busy');
      grid.innerHTML = `<div class="state" role="alert"><h2 class="state__title">${UI.esc(t('station.error'))}</h2><p class="state__text">${UI.esc(Road.error(err))}</p></div>`;
      return;
    }
    if (seq !== this._seq) return;
    this._items = res.data.items || [];
    this._next = res.data.next || '';
    this._renderGrid();
  },

  _renderGrid() {
    const esc = UI.esc;
    const grid = document.getElementById('station-grid');
    grid.removeAttribute('aria-busy');
    const any = Object.keys(this._filters).some((k) => k !== 'sort');
    document.getElementById('station-carriage').textContent = this._items.length ? t('station.carriage', { n: this._page + 1 }) : '';
    if (!this._items.length) {
      grid.innerHTML = any
        ? `<div class="state racks__none"><h2 class="state__title">${esc(t('station.none.title'))}</h2><p class="state__text">${esc(t('station.none.text'))}</p><div class="state__actions"><button type="button" class="btn btn--ghost" id="station-none-clear">${esc(t('station.clear'))}</button></div></div>`
        : `<div class="state racks__none"><h2 class="state__title">${esc(t('station.empty.title'))}</h2><p class="state__text">${esc(t('station.empty.text'))}</p><div class="state__actions"><a class="btn btn--primary" href="#/compose">${esc(t('station.empty.cta'))}</a></div></div>`;
      grid.querySelector('#station-none-clear')?.addEventListener('click', () => { this._set({ season: '', hour: '', place: '', tag: '', q: '', realm: '' }); document.getElementById('station-q').value = ''; });
      document.getElementById('station-trains').innerHTML = this._page ? `<button type="button" class="btn btn--ghost" data-train="first">${esc(t('station.first'))}</button>` : '';
      return;
    }
    const hourNow = Road.hourNow();
    grid.innerHTML = `<ul class="racks__grid">${this._items.map((v, i) => `<li style="--i:${i}">${Road.stubHTML(v, this._by, { openNow: v.picks && v.picks.hour === hourNow })}</li>`).join('')}</ul>`;
    const trains = [];
    if (this._page > 0) trains.push(`<button type="button" class="btn btn--ghost" data-train="prev">${UI.icon('back')}${esc(t('station.prev'))}</button>`);
    if (this._next) trains.push(`<button type="button" class="btn btn--primary trains__next" data-train="next">${esc(t('station.next'))}${UI.icon('arrow')}</button>`);
    else if (this._page > 0) trains.push(`<p class="trains__last">${esc(t('station.last'))}</p>`);
    document.getElementById('station-trains').innerHTML = trains.join('');
  },

  _train(dir) {
    if (dir === 'next' && this._next) {
      this._cursors = this._cursors.slice(0, this._page + 1).concat([this._next]);
      this._page++;
    } else if (dir === 'prev' && this._page > 0) {
      this._page--;
    } else if (dir === 'first') {
      this._page = 0;
    } else return;
    this._load(this._seq).then(() => {
      const label = document.getElementById('station-carriage');
      label?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      label?.focus({ preventScroll: true });
    });
  },

  _error(err) {
    document.getElementById('main-content').innerHTML = `
      <section class="page"><div class="container"><div class="state" role="alert">
        <h1 class="state__title">${UI.esc(t('station.error'))}</h1>
        <p class="state__text">${UI.esc(Road.error(err))}</p>
        <div class="state__actions"><button class="btn btn--primary" type="button" id="station-retry">${UI.icon('refresh')}${UI.esc(t('common.retry'))}</button></div>
      </div></div></section>`;
    document.getElementById('station-retry').addEventListener('click', () => Router.refresh());
  },
};
