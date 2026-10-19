/**
 * Home — the opening (the brand scene, then doors open right now), the hundred doors, the
 * invitation to find your type, the doors opening next, and a closing scene.
 *
 * "Open" is always judged on the door's own clock and calendar (entrance.tz, entrance.months,
 * entrance.time), never the visitor's.
 */
var Pages = window.Pages || {};

/** Each door's local time and whether it is open now, or how long until it opens. */
const DoorClock = (() => {
  const WINDOWS = { midnight: [0, 3], predawn: [3, 5], dawn: [5, 7], morning: [7, 11], noon: [11, 14], afternoon: [13, 17], dusk: [17, 19], 'blue-hour': [18, 20], night: [19, 24], any: [0, 24] };
  const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const formats = new Map();

  function local(tz, now) {
    if (!formats.has(tz)) {
      let f = null;
      try { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }); } catch (e) { f = null; }
      formats.set(tz, f);
    }
    const f = formats.get(tz);
    if (!f) return { month: now.getMonth() + 1, hour: now.getHours(), minute: now.getMinutes() };
    const p = {};
    f.formatToParts(now).forEach((x) => { p[x.type] = x.value; });
    return { month: Number(p.month), hour: Number(p.hour) % 24, minute: Number(p.minute) };
  }

  /** { open, hh, mm, minutes (until it opens, same month), month (next month it opens) } */
  function state(e, now = new Date()) {
    if (!e) return { open: false };
    const l = local(e.tz || 'UTC', now);
    const months = e.months && e.months.length ? e.months : ALL;
    const [start, end] = WINDOWS[e.time] || WINDOWS.any;
    const at = l.hour * 60 + l.minute;
    const out = { hh: String(l.hour).padStart(2, '0'), mm: String(l.minute).padStart(2, '0') };
    if (!months.includes(l.month)) {
      out.open = false;
      out.month = months.map((m) => [m, (m - l.month + 12) % 12]).sort((a, b) => a[1] - b[1])[0][0];
      return out;
    }
    out.open = at >= start * 60 && at < end * 60;
    if (!out.open) out.minutes = at < start * 60 ? start * 60 - at : 24 * 60 - at + start * 60;
    return out;
  }

  /** "此刻开着" / "2 小时 10 分后开" / "12 月才开" */
  function when(s) {
    if (s.open) return t('home.door.open');
    if (s.month) return t('home.door.month', { m: I18n.lang === 'en' ? new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(2020, s.month - 1, 1)) : s.month });
    const h = Math.floor(s.minutes / 60);
    const m = s.minutes % 60;
    return h ? t('home.door.in', { h, m }) : t('home.door.inMin', { m });
  }

  return { state, when };
})();

Pages.Home = {
  SCENE_MS: 6800,
  BRAND: { key: 'taoyuan', img: 'generated/hero-taoyuan.jpg' },
  REALMS: ['mirror-salt', 'fire-stone', 'ice-night', 'sand-stars', 'mist-temple', 'water-deep', 'city-rules', 'old-roads'],

  render() {
    const esc = UI.esc;
    const main = document.getElementById('main-content');
    document.body.dataset.mediaHeader = '';
    const saved = Router.state().home || {};
    this._saved = saved;
    this._scenes = [this.BRAND];
    this._scene = 0;
    this._selected = 0;
    this._pinned = saved.door || 0;
    this._filter = saved.filter || '';
    this._paused = false;
    this._userPaused = false;
    this._held = false;
    this._doors = new Map();
    this._cleanups = [];
    const doors = (window.APP_CONFIG && APP_CONFIG.doors) || 48;
    const bootT = Math.round(performance.now());
    main.innerHTML = `
      <section class="home-hero scene-taoyuan is-booting" data-media-end aria-labelledby="hero-brand" style="--boot-t:-${bootT}ms">
        <div class="home-hero__slides" aria-hidden="true">
          ${UI.picture(API.mediaUrl(this.BRAND.img), { sizes: 'max(100vw, 177.8svh)', eager: true, cls: 'home-hero__img is-active', attrs: 'data-scene="0"' })}
        </div>
        <canvas class="home-hero__particles" aria-hidden="true"></canvas>
        <div class="home-hero__shade" aria-hidden="true"></div>
        <div class="home-hero__grain" aria-hidden="true"></div>
        <div class="container home-hero__content" id="hero-content">
          <h1 class="sr-only" id="hero-brand">${esc(t('brand'))}</h1>
          <div class="home-hero__copy is-in" id="hero-copy" role="group" aria-roledescription="${esc(t('home.scenes.slide'))}">
            <p class="home-hero__eyebrow"><span class="home-hero__line" id="hero-eyebrow">${esc(t('home.myth'))}</span></p>
            <p class="home-hero__title" id="hero-title"><span class="home-hero__line">${esc(t('home.scene.taoyuan.title'))}</span></p>
            <p class="home-hero__lead"><span class="home-hero__line" id="hero-lead">${esc(t('home.scene.taoyuan.lead'))}</span></p>
          </div>
          <div class="home-hero__actions">
            <a class="btn btn--primary home-hero__step" id="hero-enter" href="#atlas" data-to-atlas><span id="hero-enter-label">${esc(t('home.step'))}</span>${UI.icon('arrow', 'icon--sm')}</a>
          </div>
          <div class="home-hero__foot">
            <button type="button" class="home-hero__pause" id="hero-pause" aria-pressed="false" aria-label="${esc(t('home.scenes.pause'))}" hidden>${UI.icon('pause', 'icon--sm')}</button>
            <div class="home-hero__dots" id="hero-dots" role="group" aria-label="${esc(t('home.scenes.label'))}">
              <button type="button" class="home-hero__dot" data-go="0" aria-label="${esc(`${t('home.scenes.prologue')} ${t('home.scene.taoyuan.title')}`)}" aria-current="true"><i></i><span class="num">${esc(t('home.scenes.prologue'))}</span></button>
            </div>
            <a class="home-hero__now" id="hero-now" href="#atlas" data-to-atlas data-now hidden></a>
          </div>
        </div>
      </section>

      <section class="home-atlas" id="atlas" tabindex="-1" aria-labelledby="atlas-title">
        <div class="container">
          <header class="home-atlas__head">
            <p class="home-atlas__count num" aria-hidden="true"><b id="atlas-found">${doors}</b><span>/ 100</span></p>
            <div class="home-atlas__intro">
              <h2 id="atlas-title" class="reveal">${esc(t('home.atlas.title', { n: doors }))}</h2>
              <p class="home-atlas__legend"><i aria-hidden="true"></i>${esc(t('home.atlas.legend'))}</p>
            </div>
            <form class="home-atlas__search" id="atlas-search" role="search">
              ${UI.icon('search', 'icon--sm')}
              <label class="sr-only" for="atlas-q">${esc(t('home.atlas.searchLabel'))}</label>
              <input id="atlas-q" data-testid="search-input" type="search" name="q" autocomplete="off" placeholder="${esc(t('home.atlas.search'))}">
              <button class="btn btn--quiet btn--sm" type="submit">${esc(t('home.atlas.searchCta'))}</button>
            </form>
          </header>
          <div class="home-atlas__filters" id="atlas-filters" role="group" aria-label="${esc(t('home.atlas.label'))}"></div>
          <div class="home-atlas__body">
            <div class="home-atlas__wall">
              <ol class="home-atlas__grid" id="atlas-grid" aria-label="${esc(t('home.atlas.gridLabel'))}" aria-busy="true">
                ${Array.from({ length: doors }, (_, k) => `<li class="door" aria-hidden="true" style="--i:${k}"><span class="door__no num">${String(k + 1).padStart(3, '0')}</span></li>`).join('')}
              </ol>
              <p class="home-atlas__hint" id="atlas-hint" aria-hidden="true">${esc(t('home.atlas.hint'))}</p>
              <p class="home-atlas__mist"><span class="num">${String(doors + 1).padStart(3, '0')} — 100</span><span>${esc(t('home.atlas.mist', { n: 100 - doors }))}</span><i aria-hidden="true">${'<b></b>'.repeat(Math.max(0, 100 - doors))}</i></p>
            </div>
            <div class="home-atlas__panel" id="atlas-panel" role="region" aria-label="${esc(t('home.atlas.panelLabel'))}">
              <button type="button" class="home-atlas__peek-close" id="atlas-peek-close" aria-label="${esc(t('home.atlas.close'))}">${UI.icon('close', 'icon--sm')}</button>
              <a class="door-card" id="door-card" href="#/explore">
                <span class="door-card__media" id="door-media"></span>
                <span class="door-card__body" id="door-body"></span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <section class="container home-invite-section" id="home-invite-slot" aria-labelledby="home-invite-title">${this._invite()}</section>

      <section class="container home-featured" aria-labelledby="featured-title">
        <div class="section-head">
          <div>
            <h2 id="featured-title" class="reveal">${esc(t('home.featured.title'))}</h2>
            <p>${esc(t('home.featured.sub'))}</p>
          </div>
          <a class="link-arrow" id="featured-all" href="#/explore">${esc(t('nav.explore'))} ${UI.icon('arrow', 'icon--sm')}</a>
        </div>
        <div class="home-featured__grid" id="featured-grid" data-testid="journey-feed" aria-busy="true">
          ${Array.from({ length: 5 }, (_, i) => `<div class="feature-card feature-card--skeleton skeleton ${i === 0 ? 'feature-card--lead' : ''}" aria-hidden="true"></div>`).join('')}
        </div>
      </section>

      <section class="home-close" aria-labelledby="close-quote">
        <div class="container home-close__inner">
          <figure class="home-close__quote">
            <blockquote id="close-quote"><p>${t('footer.line').split(/(?<=[，,])\s*/).map((part) => `<span>${esc(part)}</span>`).join(' ')}</p></blockquote>
            <figcaption>${esc(t('footer.lineBy'))}</figcaption>
          </figure>
          <div class="home-close__side">
            <p class="home-close__next" id="close-next"></p>
            <p class="home-close__credit">${esc(t('home.close.credit'))}</p>
          </div>
        </div>
      </section>
    `;

    const hero = main.querySelector('.home-hero');
    main.querySelector('#atlas-search').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = String(new FormData(e.currentTarget).get('q') || '').trim();
      Router.navigate(q ? `/explore?q=${encodeURIComponent(q)}` : '/explore');
    });
    main.querySelector('#home-invite-slot').addEventListener('click', (e) => {
      const a = e.target.closest('[data-path]');
      if (!a) return;
      API.track('path_pick', '', { path: a.dataset.path, from: 'home' });
      if (a.dataset.path === 'browse') Guest.update((g) => { g.invite = 'dismissed'; });
    });
    // "Step in" and "open now" glide down to the doors (the second one lights only open doors).
    main.addEventListener('click', (e) => {
      const a = e.target.closest('[data-to-atlas]');
      if (!a || a.getAttribute('href') !== '#atlas') return;
      e.preventDefault();
      if (a.hasAttribute('data-now')) this._filterDoors('now');
      const atlas = document.getElementById('atlas');
      atlas.scrollIntoView({ behavior: this._reduce() ? 'auto' : 'smooth', block: 'start' });
      atlas.focus({ preventScroll: true });
    });
    UI.trackCardClicks(main.querySelector('#featured-grid'));
    UI.trackCardClicks(main.querySelector('#atlas-grid'));
    this._particles = HeroParticles.start(hero, main.querySelector('.home-hero__particles'));
    this._setupScenes(hero);
    this._setupAtlas(main.querySelector('#atlas'));
    this._setupScroll(main);
    setTimeout(() => hero.classList.remove('is-booting'), Math.max(0, 1900 - bootT));
    this._load(hero);
  },

  destroy() {
    if (this._particles) this._particles.stop();
    this._particles = null;
    clearTimeout(this._timer);
    clearTimeout(this._warmTimer);
    clearTimeout(this._resumeTimer);
    clearTimeout(this._hoverTimer);
    clearInterval(this._clock);
    (this._cleanups || []).forEach((fn) => fn());
    this._cleanups = [];
    delete document.body.dataset.atlasInView;
  },

  _reduce() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; },
  _save() { Router.saveState({ home: { door: this._pinned, filter: this._filter, slide: this._scene } }); },

  async _load(hero) {
    const grid = document.getElementById('featured-grid');
    try {
      const res = await API.getJourneys({ limit: 100 });
      if (!grid.isConnected) return;
      const journeys = res.data || [];
      this._journeys = journeys;
      this._addDoorScenes(hero, journeys);
      this._renderAtlas(journeys);
      this._renderFeatured(journeys);
      this._tick();
      clearInterval(this._clock);
      this._clock = setInterval(() => this._tick(), 30000);
      const all = document.getElementById('featured-all');
      if (all && res.total) all.innerHTML = `${UI.esc(t('home.featured.all', { n: res.total }))} ${UI.icon('arrow', 'icon--sm')}`;
    } catch (err) {
      if (!grid.isConnected) return;
      grid.innerHTML = `<div class="state"><p class="state__title">${UI.esc(t('home.featured.error'))}</p><p class="state__text">${UI.esc(I18n.error(err))}</p>
        <div class="state__actions"><button class="btn btn--ghost" type="button" id="featured-retry">${UI.icon('refresh')}${UI.esc(t('common.retry'))}</button></div></div>`;
      grid.querySelector('#featured-retry').addEventListener('click', () => this._load(hero));
    } finally {
      if (grid.isConnected) grid.setAttribute('aria-busy', 'false');
    }
  },

  // Doors' open state moves with the clock: the hero count, the lamps, the panel and the close.
  _tick() {
    const now = new Date();
    const journeys = (this._journeys || []).filter((j) => j.entrance);
    this._state = new Map(journeys.map((j) => [j.entrance.no, DoorClock.state(j.entrance, now)]));
    const open = journeys.filter((j) => this._state.get(j.entrance.no).open).length;
    const nowEl = document.getElementById('hero-now');
    if (nowEl) {
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      nowEl.innerHTML = `<time class="num" datetime="${hh}:${mm}">${hh}<i aria-hidden="true">:</i>${mm}</time><span>${UI.esc(t('home.now', { n: open }))}</span>`;
      nowEl.hidden = false;
    }
    document.querySelectorAll('#atlas-grid .door.is-found').forEach((li) => {
      const s = this._state.get(Number(li.dataset.no));
      li.dataset.open = String(!!(s && s.open));
    });
    const nowChip = document.querySelector('#atlas-filters [data-filter="now"] .num');
    if (nowChip) nowChip.textContent = open;
    if (this._selected) this._renderDoorBody(this._doors.get(this._selected));
    this._renderClose(journeys);
  },

  // --- The opening -----------------------------------------------------------------------------

  _setupScenes(hero) {
    const content = hero.querySelector('#hero-content');
    hero.querySelector('#hero-dots').addEventListener('click', (e) => {
      const b = e.target.closest('[data-go]');
      if (!b) return;
      this._show(hero, Number(b.dataset.go));
      // A pick holds the scene for a while, then the slides carry on.
      this._paused = true;
      clearTimeout(this._resumeTimer);
      this._resumeTimer = setTimeout(() => { this._paused = false; this._schedule(hero); }, 12000);
    });
    const pause = hero.querySelector('#hero-pause');
    pause.addEventListener('click', () => {
      this._userPaused = !this._userPaused;
      pause.setAttribute('aria-pressed', String(this._userPaused));
      pause.setAttribute('aria-label', t(this._userPaused ? 'home.scenes.play' : 'home.scenes.pause'));
      pause.innerHTML = UI.icon(this._userPaused ? 'play' : 'pause', 'icon--sm');
      hero.classList.toggle('is-held', this._userPaused);
      this._schedule(hero);
    });
    // Only the copy and its controls hold the scene (reading, aiming at a dot), not the photo.
    const hold = (v) => () => { this._held = v; hero.classList.toggle('is-held', v || this._userPaused); this._schedule(hero); };
    content.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hold(true)(); });
    content.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hold(false)(); });
    hero.addEventListener('focusin', hold(true));
    hero.addEventListener('focusout', (e) => { if (!hero.contains(e.relatedTarget)) hold(false)(); });
    // Swipe between scenes on touch.
    let sx = 0;
    let sy = 0;
    hero.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') { sx = e.clientX; sy = e.clientY; } }, { passive: true });
    hero.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'touch' || this._scenes.length < 2) return;
      const dx = e.clientX - sx;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - sy)) {
        const n = this._scenes.length;
        this._show(hero, (this._scene + (dx < 0 ? 1 : -1) + n) % n);
      }
    }, { passive: true });
    const onVisibility = () => this._schedule(hero);
    document.addEventListener('visibilitychange', onVisibility);
    const onDrawer = (e) => { this._drawer = e.detail; this._schedule(hero); };
    window.addEventListener('drawer:toggle', onDrawer);
    // Off screen, nothing runs: the timer, the push-in and the fireflies.
    let io = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(([en]) => {
        this._offscreen = en.intersectionRatio < 0.3;
        hero.classList.toggle('is-offscreen', this._offscreen);
        if (this._particles) this._particles[this._offscreen ? 'pause' : 'resume']();
        this._schedule(hero);
      }, { threshold: [0, 0.3, 0.6] });
      io.observe(hero);
    }
    this._cleanups.push(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('drawer:toggle', onDrawer);
      if (io) io.disconnect();
    });
    if (!this._reduce()) hero.classList.add('is-playing');
  },

  _stopped() {
    return this._paused || this._userPaused || this._held || this._offscreen || this._drawer || document.hidden || this._reduce();
  },

  // Three doors join the opening: open ones first (a different three each day), each with its own
  // landscape opening image, and its portrait cover on phones.
  _addDoorScenes(hero, journeys) {
    if (!hero.isConnected) return;
    const now = new Date();
    const day = Math.floor(now.getTime() / 864e5);
    const rank = (j) => (DoorClock.state(j.entrance, now).open ? 0 : 1000) + ((j.entrance.no * 37 + day * 11) % 101);
    const picks = journeys.filter((j) => j.entrance && j.hero_url).sort((a, b) => rank(a) - rank(b)).slice(0, 3);
    const slides = hero.querySelector('.home-hero__slides');
    const dots = hero.querySelector('#hero-dots');
    picks.forEach((j) => {
      const i = this._scenes.length;
      this._scenes.push({ key: 'door', j });
      const wide = UI.esc(j.hero_url.replace(/\.jpg$/, ''));
      const cover = UI.esc(j.image_url.replace(/\.jpg$/, ''));
      const portrait = /\/cover\.jpg$/.test(j.image_url) ? `<source media="(orientation: portrait)" type="image/avif" data-srcset="${cover}.720.avif 720w, ${cover}.1120.avif 1120w" sizes="100vw">` : '';
      slides.insertAdjacentHTML('beforeend', `<picture>${portrait}<source type="image/avif" data-srcset="${wide}.960.avif 960w, ${wide}.1536.avif 1536w" sizes="max(100vw, 177.8svh)"><img class="home-hero__img" data-scene="${i}" data-src="${UI.esc(j.hero_url)}" alt="" decoding="async"></picture>`);
      const no = String(j.entrance.no).padStart(3, '0');
      dots.insertAdjacentHTML('beforeend', `<button type="button" class="home-hero__dot" data-go="${i}" aria-label="${no} ${UI.esc(j.title)}" aria-current="false" data-label="${UI.esc(j.title)}"><i></i><span class="num">${no}</span></button>`);
    });
    hero.querySelector('#hero-pause').hidden = this._scenes.length < 2 || this._reduce();
    const slide = Number(this._saved.slide) || 0;
    if (slide > 0 && slide < this._scenes.length) this._show(hero, slide, { instant: true });
    else this._schedule(hero);
  },

  // Later scenes load shortly before they are due, so they never compete with the first one.
  _warm(hero, i) {
    const img = hero.querySelector(`.home-hero__img[data-scene="${i}"][data-src]`);
    if (!img) return;
    img.parentElement.querySelectorAll('source[data-srcset]').forEach((s) => { s.srcset = s.dataset.srcset; s.removeAttribute('data-srcset'); });
    img.src = img.dataset.src;
    img.removeAttribute('data-src');
  },

  _schedule(hero) {
    clearTimeout(this._timer);
    clearTimeout(this._warmTimer);
    if (!hero.isConnected || this._scenes.length < 2) return;
    this._warmTimer = setTimeout(() => this._warm(hero, (this._scene + 1) % this._scenes.length), Math.max(0, this.SCENE_MS - 2500));
    if (this._stopped()) return;
    this._timer = setTimeout(() => this._show(hero, (this._scene + 1) % this._scenes.length), this.SCENE_MS);
  },

  // One beat: the old copy leaves while the pictures cross; the new copy arrives once its own
  // picture is decoded, so a place name never sits on the previous place's photo.
  async _show(hero, i, { instant = false } = {}) {
    if (!hero.isConnected || !this._scenes[i] || i === this._scene) { this._schedule(hero); return; }
    const token = (this._showToken = (this._showToken || 0) + 1);
    const sc = this._scenes[i];
    this._warm(hero, i);
    const incoming = hero.querySelector(`.home-hero__img[data-scene="${i}"]`);
    const leaving = hero.querySelector('.home-hero__img.is-active');
    this._scene = i;
    this._save();
    hero.querySelectorAll('.home-hero__dot').forEach((d) => d.setAttribute('aria-current', String(Number(d.dataset.go) === i)));
    const copy = hero.querySelector('#hero-copy');
    const calm = instant || this._reduce();
    if (!calm) copy.classList.add('is-out');
    const decoded = incoming && incoming.decode ? incoming.decode().catch(() => {}) : Promise.resolve();
    await Promise.race([decoded, new Promise((r) => setTimeout(r, 900))]);
    if (token !== this._showToken || !hero.isConnected) return;
    if (leaving && leaving !== incoming) {
      // The push-in stops where it is instead of snapping back as the photo fades out.
      leaving.style.transform = getComputedStyle(leaving).transform;
      leaving.classList.add('is-leaving');
      leaving.classList.remove('is-active');
      setTimeout(() => { leaving.classList.remove('is-leaving'); leaving.style.transform = ''; }, 1300);
    }
    if (incoming) incoming.classList.add('is-active');
    hero.className = hero.className.replace(/scene-\S+/, `scene-${sc.key}`);
    if (!calm) await new Promise((r) => setTimeout(r, 380));
    if (token !== this._showToken || !hero.isConnected) return;
    const j = sc.j;
    const e = j && j.entrance;
    copy.querySelector('#hero-eyebrow').textContent = e ? `No.${String(e.no).padStart(3, '0')} · ${t(`entrance.realm.${e.realm}`)}` : t('home.myth');
    copy.querySelector('.home-hero__title .home-hero__line').innerHTML = j ? UI.titleHTML(j.title) : UI.esc(t('home.scene.taoyuan.title'));
    copy.querySelector('#hero-lead').textContent = j ? (j.story_hook || j.subtitle || '') : t('home.scene.taoyuan.lead');
    const enter = hero.querySelector('#hero-enter');
    enter.querySelector('#hero-enter-label').textContent = t(j ? 'home.stepDoor' : 'home.step');
    if (j) {
      enter.href = `#/journey/${encodeURIComponent(j.slug)}`;
      enter.dataset.slug = j.slug;
      enter.dataset.vtFrom = `.home-hero__img[data-scene="${i}"]`;
      enter.removeAttribute('data-to-atlas');
    } else {
      enter.href = '#atlas';
      enter.setAttribute('data-to-atlas', '');
      delete enter.dataset.slug;
      delete enter.dataset.vtFrom;
    }
    copy.classList.remove('is-out', 'is-in');
    void copy.offsetWidth;
    copy.classList.add('is-in');
    this._schedule(hero);
  },

  // --- The hundred doors -----------------------------------------------------------------------

  _cols() {
    const grid = document.getElementById('atlas-grid');
    return grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 12;
  },

  _setupAtlas(section) {
    const grid = section.querySelector('#atlas-grid');
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    let pointer = 'mouse';
    let scrolling = 0;
    const onScroll = () => { clearTimeout(scrolling); scrolling = setTimeout(() => { scrolling = 0; }, 150); };
    window.addEventListener('scroll', onScroll, { passive: true });
    const doorOf = (el) => el && el.closest && el.closest('a.door__link');
    grid.addEventListener('pointerdown', (e) => { pointer = e.pointerType; }, { passive: true });
    // Hover shows a door only once the pointer rests on it, and never while the page scrolls; a
    // pointer that comes to rest on a door while the page is still moving shows it once it stops.
    let over = null;
    const rest = (a) => {
      clearTimeout(this._hoverTimer);
      this._hoverTimer = setTimeout(() => {
        if (over !== a) return;
        if (scrolling) rest(a);
        else this._select(Number(a.dataset.no));
      }, 120);
    };
    grid.addEventListener('pointerover', (e) => {
      const a = doorOf(e.target);
      if (!a || e.pointerType !== 'mouse') return;
      over = a;
      rest(a);
    });
    grid.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse') return;
      over = null;
      clearTimeout(this._hoverTimer);
      if (this._pinned) this._select(this._pinned);
    });
    grid.addEventListener('focusin', (e) => {
      const a = doorOf(e.target);
      if (!a) return;
      this._rove(a);
      this._select(Number(a.dataset.no), { pin: true });
      section.querySelector('#atlas-hint').classList.add('is-shown');
    });
    grid.addEventListener('focusout', () => section.querySelector('#atlas-hint').classList.remove('is-shown'));
    // On touch the first tap shows the door (a peek sheet on phones); the second walks through.
    grid.addEventListener('click', (e) => {
      const a = doorOf(e.target);
      if (!a) return;
      const no = Number(a.dataset.no);
      if (pointer === 'touch' || coarse) {
        if (this._selected !== no || !this._peek) {
          e.preventDefault();
          this._select(no, { pin: true, peek: true });
        }
        return;
      }
      this._pinned = no;
      this._save();
    });
    // Arrow keys move between doors (one tab stop for the whole wall).
    grid.addEventListener('keydown', (e) => {
      const a = doorOf(e.target);
      if (!a) return;
      const links = [...grid.querySelectorAll('.door:not(.is-dim) a.door__link')];
      const at = links.indexOf(a);
      const cols = this._cols();
      const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
      let next = null;
      if (step) next = links[Math.min(links.length - 1, Math.max(0, at + step))];
      if (e.key === 'Home') next = links[0];
      if (e.key === 'End') next = links[links.length - 1];
      if (!next) return;
      e.preventDefault();
      this._rove(next);
      next.focus();
    });
    section.querySelector('#atlas-filters').addEventListener('click', (e) => {
      const b = e.target.closest('[data-filter]');
      if (b) this._filterDoors(b.dataset.filter);
    });
    section.querySelector('#atlas-peek-close').addEventListener('click', () => this._closePeek());
    section.querySelector('#door-card').addEventListener('click', () => this._closePeek());
    if ('IntersectionObserver' in window) {
      grid.classList.add('will-light');
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.target === grid && en.isIntersecting && !grid.classList.contains('is-lit')) this._lightUp(grid);
          if (en.target === section) {
            if (en.isIntersecting) document.body.dataset.atlasInView = '';
            else { delete document.body.dataset.atlasInView; this._closePeek(); }
          }
        });
      }, { threshold: [0, 0.15], rootMargin: '0px 0px -10% 0px' });
      io.observe(grid);
      io.observe(section);
      // The doors' thumbnails load only as the wall comes near.
      const near = new IntersectionObserver((entries) => {
        if (entries.some((en) => en.isIntersecting)) { grid.classList.add('is-near'); near.disconnect(); }
      }, { rootMargin: '600px 0px' });
      near.observe(grid);
      this._cleanups.push(() => { io.disconnect(); near.disconnect(); });
    } else {
      grid.classList.add('is-lit', 'is-near');
    }
    this._cleanups.push(() => window.removeEventListener('scroll', onScroll));
  },

  // The wall lights door by door the first time it is seen, and the count climbs with it; the
  // doors open right now light last, with a flare.
  _lightUp(grid) {
    grid.classList.add('is-lit');
    const out = document.getElementById('atlas-found');
    const target = this._doors.size || Number(out.textContent) || 0;
    if (this._reduce() || !target) { out.textContent = target; return; }
    const t0 = performance.now();
    const dur = 900;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      out.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1 && out.isConnected) requestAnimationFrame(step);
    };
    out.textContent = '0';
    requestAnimationFrame(step);
  },

  _rove(link) {
    document.querySelectorAll('#atlas-grid a.door__link').forEach((a) => a.setAttribute('tabindex', a === link ? '0' : '-1'));
  },

  _thumb(j) { return j.image_url.replace(/\.jpg$/, '.120.avif'); },

  _renderAtlas(journeys) {
    const esc = UI.esc;
    const grid = document.getElementById('atlas-grid');
    if (!grid) return;
    const now = new Date();
    this._doors = new Map(journeys.filter((j) => j.entrance).map((j) => [j.entrance.no, j]));
    const found = [...this._doors.values()].sort((a, b) => a.entrance.no - b.entrance.no);
    grid.innerHTML = found.map((j, k) => {
      const e = j.entrance;
      const no = String(e.no).padStart(3, '0');
      const s = DoorClock.state(e, now);
      const [name, place] = UI.titleParts(j.title);
      const label = `No.${no} ${t(`entrance.realm.${e.realm}`)} · ${name}${place ? ` · ${place}` : ''}${s.open ? ` · ${t('home.door.open')}` : ''}`;
      return `<li class="door is-found" style="--i:${k};--thumb:url('${esc(this._thumb(j))}')" data-realm="${esc(e.realm)}" data-no="${e.no}" data-open="${s.open}">
        <a class="door__link" href="#/journey/${encodeURIComponent(j.slug)}" data-slug="${esc(j.slug)}" data-no="${e.no}" data-quiet data-vt-self tabindex="-1" aria-label="${esc(label)}">
          <span class="door__arch" aria-hidden="true"></span><span class="door__no num" aria-hidden="true">${no}</span><span class="door__word" aria-hidden="true">${esc(name)}</span>
        </a></li>`;
    }).join('');
    grid.setAttribute('aria-busy', 'false');
    const n = found.length;
    if (grid.classList.contains('is-lit') || !grid.classList.contains('will-light')) document.getElementById('atlas-found').textContent = n;
    document.getElementById('atlas-title').textContent = t('home.atlas.title', { n });
    const count = (f) => found.filter((j) => f(j.entrance)).length;
    const chip = (key, label, c) => `<button type="button" class="home-atlas__chip" data-filter="${key}" aria-pressed="${key === this._filter}"${key && key !== 'now' ? ` style="--lamp:var(--realm-${key})"` : ''}>${key ? '<i aria-hidden="true"></i>' : ''}<span>${esc(label)}</span><span class="num">${c}</span></button>`;
    document.getElementById('atlas-filters').innerHTML = [
      chip('', t('home.atlas.all'), n),
      chip('now', t('home.atlas.now'), count((e) => DoorClock.state(e, now).open)),
      ...this.REALMS.map((r) => chip(r, t(`entrance.realm.${r}`), count((e) => e.realm === r))),
    ].join('');
    if (this._filter) this._filterDoors(this._filter, { keep: true });
    const first = (this._pinned && this._doors.get(this._pinned)) || found.find((j) => DoorClock.state(j.entrance, now).open) || found[0];
    if (first) {
      this._pinned = first.entrance.no;
      this._select(first.entrance.no, { quiet: true });
      const link = grid.querySelector(`a[data-no="${first.entrance.no}"]`);
      if (link) this._rove(link);
    }
  },

  _filterDoors(key, { keep = false } = {}) {
    const grid = document.getElementById('atlas-grid');
    if (!grid) return;
    this._filter = key;
    if (!keep) this._save();
    document.querySelectorAll('#atlas-filters [data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === key)));
    const match = (li) => !key || (key === 'now' ? li.dataset.open === 'true' : li.dataset.realm === key);
    let first = null;
    grid.querySelectorAll('.door.is-found').forEach((li) => {
      const on = match(li);
      li.classList.toggle('is-dim', !!key && !on);
      if (on && !first) first = li.querySelector('a');
    });
    grid.dataset.filter = key;
    const current = grid.querySelector(`a[data-no="${this._selected}"]`);
    if (first && (!current || current.closest('.door').classList.contains('is-dim'))) {
      this._pinned = Number(first.dataset.no);
      this._select(this._pinned, { quiet: true });
      this._rove(first);
    }
  },

  _select(no, { pin = false, peek = false, quiet = false } = {}) {
    const j = this._doors && this._doors.get(no);
    const panel = document.getElementById('atlas-panel');
    if (!j || !panel) return;
    if (pin) { this._pinned = no; this._save(); }
    if (peek) this._openPeek();
    if (this._selected === no) return;
    this._selected = no;
    document.querySelectorAll('#atlas-grid .door.is-selected').forEach((li) => li.classList.remove('is-selected'));
    const li = document.querySelector(`#atlas-grid .door[data-no="${no}"]`);
    if (li) li.classList.add('is-selected');
    const card = document.getElementById('door-card');
    card.href = `#/journey/${encodeURIComponent(j.slug)}`;
    card.dataset.slug = j.slug;
    card.style.setProperty('--lamp', `var(--realm-${j.entrance.realm})`);
    this._swapImage(j, quiet);
    this._renderDoorBody(j);
  },

  // Double-buffered: the next cover loads off screen and cross-fades in over a blurred thumbnail,
  // so a grey slab never shows between doors.
  _swapImage(j, instant) {
    const media = document.getElementById('door-media');
    if (!media) return;
    media.style.backgroundImage = `url('${this._thumb(j)}')`;
    const holder = document.createElement('span');
    holder.className = 'door-card__layer';
    holder.innerHTML = UI.picture(j.image_url, { sizes: '(max-width: 960px) 40vw, 320px', width: 720, height: 900 });
    const img = holder.querySelector('img');
    img.loading = 'eager';
    media.appendChild(holder);
    const show = () => {
      if (!holder.isConnected) return;
      holder.classList.add('is-shown');
      [...media.querySelectorAll('.door-card__layer')].filter((l) => l !== holder).forEach((l) => {
        l.classList.add('is-gone');
        setTimeout(() => l.remove(), instant ? 0 : 320);
      });
    };
    if (instant || !img.decode) show();
    else img.decode().then(show, show);
  },

  _renderDoorBody(j) {
    const body = document.getElementById('door-body');
    if (!j || !body) return;
    const esc = UI.esc;
    const e = j.entrance;
    const s = (this._state && this._state.get(e.no)) || DoorClock.state(e);
    const opens = j.content && j.content.opens;
    body.innerHTML = `
      <span class="door-card__meta num">No.${String(e.no).padStart(3, '0')} <i aria-hidden="true"></i> ${esc(t(`entrance.realm.${e.realm}`))}</span>
      <strong class="door-card__title">${UI.titleHTML(j.title)}</strong>
      ${j.story_hook ? `<span class="door-card__hook">${esc(j.story_hook)}</span>` : ''}
      ${opens ? `<span class="door-card__opens"><b>${esc(t('detail.facts.opens'))}</b>${esc(opens)}</span>` : ''}
      <span class="door-card__clock${s.open ? ' is-open' : ''}"><span class="num">${esc(t('home.door.local', { time: `${s.hh}:${s.mm}` }))}</span><span>${esc(DoorClock.when(s))}</span></span>
      <span class="door-card__go">${esc(t('home.stepDoor'))} ${UI.icon('arrow', 'icon--sm')}</span>`;
  },

  _openPeek() {
    const panel = document.getElementById('atlas-panel');
    if (!panel || !window.matchMedia('(max-width: 960px)').matches) return;
    this._peek = true;
    panel.classList.add('is-peek');
  },

  _closePeek() {
    this._peek = false;
    const panel = document.getElementById('atlas-panel');
    if (panel) panel.classList.remove('is-peek');
  },

  // --- Opening next, and the close -------------------------------------------------------------

  _soonest(journeys) {
    const now = new Date();
    const order = (s) => (s.open ? 1e6 : s.month ? 2e6 + s.month : s.minutes);
    return journeys.filter((j) => j.entrance).map((j) => ({ j, s: DoorClock.state(j.entrance, now) }))
      .sort((a, b) => order(a.s) - order(b.s) || a.j.entrance.no - b.j.entrance.no);
  },

  _renderFeatured(journeys) {
    const grid = document.getElementById('featured-grid');
    if (!grid) return;
    const picks = this._soonest(journeys).slice(0, 5);
    grid.innerHTML = picks.map(({ j, s }, i) => this._featureCard(j, s, i === 0, i)).join('');
    if ('IntersectionObserver' in window && !this._reduce()) {
      grid.classList.add('will-reveal');
      const io = new IntersectionObserver((entries) => {
        if (entries.some((en) => en.isIntersecting)) { grid.classList.add('is-in'); io.disconnect(); }
      }, { threshold: 0.12 });
      io.observe(grid);
      this._cleanups.push(() => io.disconnect());
    }
  },

  _renderClose(journeys) {
    const out = document.getElementById('close-next');
    if (!out) return;
    const next = this._soonest(journeys)[0];
    if (!next) { out.textContent = ''; return; }
    const { j, s } = next;
    const [name] = UI.titleParts(j.title);
    out.innerHTML = `<a href="#/journey/${encodeURIComponent(j.slug)}" data-slug="${UI.esc(j.slug)}"><span class="num">No.${String(j.entrance.no).padStart(3, '0')}</span> ${UI.esc(t('home.close.next', { title: name, when: DoorClock.when(s) }))} ${UI.icon('arrow', 'icon--sm')}</a>`;
  },

  // --- The opening's exit, and section reveals as the page scrolls --------------------------------

  _setupScroll(main) {
    const hero = main.querySelector('.home-hero');
    if (!this._reduce()) {
      let queued = false;
      const apply = () => {
        queued = false;
        const h = hero.offsetHeight || 1;
        hero.style.setProperty('--exit', Math.min(1, Math.max(0, window.scrollY / h)).toFixed(3));
      };
      const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(apply); } };
      window.addEventListener('scroll', onScroll, { passive: true });
      this._cleanups.push(() => window.removeEventListener('scroll', onScroll));
    }
    if ('IntersectionObserver' in window && !this._reduce()) {
      const items = main.querySelectorAll('.reveal, .home-close__quote, .home-invite');
      items.forEach((el) => el.classList.add('will-reveal'));
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
      }, { threshold: 0.2 });
      items.forEach((el) => io.observe(el));
      this._cleanups.push(() => io.disconnect());
    }
  },

  /** The first step of the core flow: find your type (self or with the guide), or browse. */
  _invite() {
    const esc = UI.esc;
    const code = Guest.mbti();
    const face = `<span class="home-invite__face">${Lumi.svg(code, { size: 72 })}</span>`;
    if (code) {
      return `
        <div class="home-invite home-invite--back">
          ${face}
          <div class="home-invite__text"><h2 id="home-invite-title">${esc(t('invite.welcome', { code }))}</h2></div>
          <div class="home-invite__actions"><a class="btn btn--primary" id="invite-space" href="#/space">${esc(t('invite.back'))}</a></div>
        </div>`;
    }
    const quiet = Guest.get().invite === 'dismissed';
    return `
      <div class="home-invite${quiet ? ' home-invite--quiet' : ''}">
        ${face}
        <div class="home-invite__text">
          <h2 id="home-invite-title">${esc(t('invite.title'))}</h2>
          ${quiet ? '' : `<p>${esc(t('invite.text'))}</p>`}
        </div>
        <div class="home-invite__actions">
          <a class="btn btn--primary" id="invite-self" href="#/find" data-path="self">${esc(t('invite.self'))}</a>
          <a class="btn btn--ghost" id="invite-pet" href="#/guide" data-path="pet">${esc(t('invite.pet'))}</a>
          ${quiet ? '' : `<a class="btn btn--quiet" id="invite-browse" href="#/explore" data-path="browse">${esc(t('invite.browse'))}</a>`}
        </div>
      </div>`;
  },

  _featureCard(j, s, lead, i) {
    const esc = UI.esc;
    return `
      <a class="feature-card home-card ${lead ? 'feature-card--lead' : ''}" href="#/journey/${encodeURIComponent(j.slug)}" data-slug="${esc(j.slug)}" data-testid="journey-card" aria-labelledby="fc-title-${i}" aria-describedby="fc-when-${i}${j.story_hook ? ` fc-hook-${i}` : ''}" style="--i:${i};--lamp:var(--realm-${esc(j.entrance.realm)})">
        ${UI.picture(j.image_url, { sizes: lead ? '(max-width: 760px) 100vw, 50vw' : '(max-width: 760px) 100vw, 25vw', width: 720, height: 900 })}
        <div class="feature-card__body">
          <p class="home-card__stamp" id="fc-when-${i}"><i aria-hidden="true"></i><span class="num">No.${String(j.entrance.no).padStart(3, '0')}</span><span>${esc(DoorClock.when(s))}</span></p>
          <h3 class="feature-card__title" id="fc-title-${i}">${UI.titleHTML(j.title)}</h3>
          ${j.story_hook ? `<p class="feature-card__hook" id="fc-hook-${i}">${esc(j.story_hook)}</p>` : ''}
          <div class="feature-card__meta"><span class="nowrap">${esc(UI.region(j))}</span></div>
        </div>
      </a>`;
  },
};

/**
 * Lantern fireflies drifting over the hero. Pauses off screen and when the tab is hidden, stops
 * on route change, and is skipped entirely for prefers-reduced-motion.
 */
const HeroParticles = {
  start(hero, canvas) {
    if (!hero || !canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return { stop() {}, pause() {}, resume() {} };
    const ctx = canvas.getContext('2d');
    let particles = [];
    let frame = 0;
    let running = true;
    let paused = false;
    const pointer = { x: -9999, y: -9999, on: false };

    const seed = (w, h) => {
      const count = Math.round(Math.max(28, Math.min(110, w / 14)));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() < 0.55 ? Math.random() * w * 0.25 : w * (0.7 + Math.random() * 0.3),
        y: Math.random() * h,
        vx: 0.06 + Math.random() * 0.16, vy: -0.06 - Math.random() * 0.2,
        size: 0.8 + Math.random() * 1.8, blur: 6 + Math.random() * 12,
        alpha: 0.12 + Math.random() * 0.32, hue: 36 + Math.random() * 40,
        speed: 0.001 + Math.random() * 0.003, life: Math.random(),
      }));
    };
    const resize = () => {
      const r = hero.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(r.width * ratio));
      canvas.height = Math.max(1, Math.floor(r.height * ratio));
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      seed(r.width, r.height);
    };
    const onMove = (e) => {
      const r = hero.getBoundingClientRect();
      pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; pointer.on = true;
    };
    const onLeave = () => { pointer.on = false; };
    const halt = () => { cancelAnimationFrame(frame); frame = 0; };
    let go = () => {};

    function draw() {
      frame = 0;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        if (pointer.on) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist < 120) { const f = (1 - dist / 120) * 0.02; p.vx += (dx / dist) * f; p.vy += (dy / dist) * f; }
        }
        p.x += p.vx; p.y += p.vy; p.vx *= 0.995; p.vy *= 0.995; p.life += p.speed;
        if (p.y < -20 || p.x > w + 20 || p.life > 1) { p.x = Math.random() * w; p.y = h + Math.random() * 60; p.life = 0; p.vx = 0.06 + Math.random() * 0.16; p.vy = -0.06 - Math.random() * 0.2; }
        const a = Math.sin(p.life * Math.PI) * p.alpha;
        ctx.beginPath();
        ctx.fillStyle = `hsla(${p.hue}, 80%, 74%, ${a})`;
        ctx.shadowColor = `hsla(${p.hue}, 85%, 70%, .6)`;
        ctx.shadowBlur = p.blur;
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      go();
    }
    go = () => { if (running && !paused && !document.hidden && !frame) frame = requestAnimationFrame(draw); };
    const onVisibility = () => { if (document.hidden) halt(); else go(); };

    resize();
    window.addEventListener('resize', resize, { passive: true });
    hero.addEventListener('pointermove', onMove, { passive: true });
    hero.addEventListener('pointerleave', onLeave, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    go();

    return {
      pause() { paused = true; halt(); },
      resume() { paused = false; go(); },
      stop() {
        running = false;
        halt();
        window.removeEventListener('resize', resize);
        hero.removeEventListener('pointermove', onMove);
        hero.removeEventListener('pointerleave', onLeave);
        document.removeEventListener('visibilitychange', onVisibility);
      },
    };
  },
};
