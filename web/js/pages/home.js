/**
 * Home — the opening (the brand scene, then entrances that open at the visitor's hour), the
 * hundred doors, the invitation to find your type, and five featured journeys.
 */
var Pages = window.Pages || {};

Pages.Home = {
  _particles: null,
  _scene: 0,
  _timer: null,
  _clock: null,
  _paused: false,
  _onVisibility: null,
  _observer: null,
  _selected: 0,

  SCENE_MS: 6800,
  BRAND: { key: 'taoyuan', img: 'generated/hero-taoyuan.jpg' },

  // Hours each entrance time covers on the visitor's own clock (end exclusive).
  HOURS: { midnight: [0, 3], predawn: [3, 5], dawn: [5, 7], morning: [7, 11], noon: [11, 13], afternoon: [13, 17], dusk: [17, 19], 'blue-hour': [18, 20], night: [19, 24] },
  REALMS: ['mirror-salt', 'fire-stone', 'ice-night', 'sand-stars', 'mist-temple', 'water-deep', 'city-rules', 'old-roads'],

  // Mood shortcuts map to real filters on Explore.
  _moods: [
    { key: 'home.mood.escape', param: 'tag', value: 'solitude' },
    { key: 'home.mood.heal', param: 'fantasy_type', value: 'spiritual' },
    { key: 'home.mood.adventure', param: 'fantasy_type', value: 'extreme' },
    { key: 'home.mood.stars', param: 'fantasy_type', value: 'night' },
  ],

  isOpen(e, hour) {
    if (!e) return false;
    const span = this.HOURS[e.time];
    return e.time === 'any' || (!!span && hour >= span[0] && hour < span[1]);
  },

  hourName(hour) {
    return ['midnight', 'predawn', 'dawn', 'morning', 'noon', 'afternoon', 'dusk', 'night']
      .find((k) => hour >= this.HOURS[k][0] && hour < this.HOURS[k][1]) || 'night';
  },

  render() {
    const esc = UI.esc;
    const main = document.getElementById('main-content');
    document.body.dataset.mediaHeader = '';
    this._scenes = [this.BRAND];
    main.innerHTML = `
      <section class="home-hero scene-taoyuan" aria-labelledby="hero-title" aria-roledescription="${esc(t('home.scenes.role'))}">
        <div class="home-hero__slides" aria-hidden="true">
          ${UI.picture(API.mediaUrl(this.BRAND.img), { sizes: '100vw', eager: true, cls: 'home-hero__img is-active', attrs: 'data-scene="0"' })}
        </div>
        <canvas class="home-hero__particles" aria-hidden="true"></canvas>
        <div class="home-hero__shade" aria-hidden="true"></div>
        <div class="container home-hero__content">
          <div class="home-hero__copy" aria-live="off">
            <p class="home-hero__eyebrow"><span class="home-hero__line" id="hero-eyebrow">${esc(t('brand.tagline'))}</span></p>
            <h1 class="home-hero__title" id="hero-title"><span class="home-hero__line">${esc(t('home.scene.taoyuan.title'))}</span></h1>
            <p class="home-hero__lead"><span class="home-hero__line">${esc(t('home.scene.taoyuan.lead'))}</span></p>
            <a class="home-hero__enter" id="hero-enter" href="#/" hidden>${esc(t('home.scenes.enter'))} ${UI.icon('arrow', 'icon--sm')}</a>
          </div>
          <form class="home-hero__search" id="hero-search" role="search">
            ${UI.icon('search')}
            <label class="sr-only" for="hero-q">${esc(t('home.searchLabel'))}</label>
            <input id="hero-q" data-testid="search-input" type="search" name="q" autocomplete="off" placeholder="${esc(t('home.searchPlaceholder'))}">
            <button class="btn" type="submit">${esc(t('home.searchCta'))}</button>
          </form>
          <div class="home-hero__moods">
            <span>${esc(t('home.moodsLabel'))}</span>
            ${this._moods.map((m) => `<a class="chip home-hero__chip" href="#/explore?${m.param}=${m.value}" data-filter-key="${m.param}" data-filter-value="${m.value}">${esc(t(m.key))}</a>`).join('')}
          </div>
          <div class="home-hero__foot">
            <div class="home-hero__dots" role="group" aria-label="${esc(t('home.scenes.label'))}">
              <button type="button" class="home-hero__dot" data-go="0" aria-label="${esc(t('home.scene.taoyuan.title'))}" aria-current="true"><i></i></button>
            </div>
            <p class="home-hero__now" id="hero-now" hidden></p>
          </div>
        </div>
      </section>

      <section class="home-atlas" id="atlas" aria-labelledby="atlas-title">
        <div class="container">
          <header class="home-atlas__head">
            <p class="home-atlas__count num" aria-hidden="true"><b id="atlas-found">··</b><span>/ 100</span></p>
            <div class="home-atlas__intro">
              <h2 id="atlas-title">${esc(t('home.atlas.title', { n: '…' }))}</h2>
              <p>${esc(t('home.atlas.sub'))}</p>
            </div>
          </header>
          <div class="home-atlas__filters" id="atlas-filters" role="group" aria-label="${esc(t('home.atlas.label'))}"></div>
          <div class="home-atlas__body">
            <ol class="home-atlas__grid" id="atlas-grid" aria-busy="true">
              ${Array.from({ length: 100 }, (_, k) => `<li class="door" aria-hidden="true" style="--i:${k}"><span class="door__no num">${String(k + 1).padStart(3, '0')}</span></li>`).join('')}
            </ol>
            <aside class="home-atlas__panel" id="atlas-panel" aria-live="polite"></aside>
          </div>
          <p class="sr-only" id="atlas-rest"></p>
        </div>
      </section>

      <div class="container" id="home-invite-slot">${this._invite()}</div>

      <section class="container home-featured" aria-labelledby="featured-title">
        <div class="section-head">
          <div>
            <h2 id="featured-title">${esc(t('home.featured.title'))}</h2>
            <p>${esc(t('home.featured.sub'))}</p>
          </div>
          <a class="link-arrow" id="featured-all" href="#/explore">${esc(t('nav.explore'))} ${UI.icon('arrow', 'icon--sm')}</a>
        </div>
        <div class="home-featured__grid" id="featured-grid" data-testid="journey-feed" aria-busy="true">
          ${Array.from({ length: 5 }, (_, i) => `<div class="feature-card feature-card--skeleton skeleton ${i === 0 ? 'feature-card--lead' : ''}" aria-hidden="true"></div>`).join('')}
        </div>
      </section>
    `;

    main.querySelector('#hero-search').addEventListener('submit', (e) => {
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
    UI.trackCardClicks(main.querySelector('#featured-grid'));
    UI.trackCardClicks(main.querySelector('#atlas-grid'));
    const hero = main.querySelector('.home-hero');
    this._particles = HeroParticles.start(hero, main.querySelector('.home-hero__particles'));
    this._setupScenes(hero);
    this._setupAtlas(main.querySelector('#atlas'));
    this._load(hero);
  },

  destroy() {
    if (this._particles) this._particles.stop();
    this._particles = null;
    clearTimeout(this._timer);
    clearTimeout(this._warmTimer);
    clearInterval(this._clock);
    this._timer = null;
    this._clock = null;
    if (this._onVisibility) document.removeEventListener('visibilitychange', this._onVisibility);
    this._onVisibility = null;
    if (this._observer) this._observer.disconnect();
    this._observer = null;
  },

  async _load(hero) {
    const grid = document.getElementById('featured-grid');
    try {
      const res = await API.getJourneys({ limit: 100 });
      if (!grid.isConnected) return;
      const journeys = res.data || [];
      this._journeys = journeys;
      this._addDoorScenes(hero, journeys);
      this._renderAtlas(journeys);
      grid.innerHTML = journeys.slice(0, 5).map((j, i) => this._featureCard(j, i === 0)).join('');
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

  // --- The opening: the brand scene, then three entrances open at this hour --------------------

  _setupScenes(hero) {
    this._scene = 0;
    this._paused = false;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    hero.querySelector('.home-hero__dots').addEventListener('click', (e) => {
      const b = e.target.closest('[data-go]');
      if (b) this._show(hero, Number(b.dataset.go), { user: true });
    });
    // Hovering or focusing the opening holds the current scene; a hidden tab holds it too.
    const hold = (v) => () => { this._paused = v; if (!v) this._schedule(hero); else clearTimeout(this._timer); hero.classList.toggle('is-held', v); };
    hero.addEventListener('pointerenter', hold(true));
    hero.addEventListener('pointerleave', hold(false));
    hero.addEventListener('focusin', hold(true));
    hero.addEventListener('focusout', (e) => { if (!hero.contains(e.relatedTarget)) hold(false)(); });
    this._onVisibility = () => { if (document.hidden) clearTimeout(this._timer); else this._schedule(hero); };
    document.addEventListener('visibilitychange', this._onVisibility);
    if (!reduce) { hero.classList.add('is-playing'); this._schedule(hero); }
  },

  // Three entrances join the opening: ones open at the visitor's hour first, a different three
  // each day, each with its own landscape opening image.
  _addDoorScenes(hero, journeys) {
    if (!hero.isConnected) return;
    const hour = new Date().getHours();
    const day = Math.floor(Date.now() / 864e5);
    const rank = (j) => (this.isOpen(j.entrance, hour) ? 0 : 1000) + ((j.entrance.no * 37 + day * 11) % 101);
    const picks = journeys.filter((j) => j.entrance && j.hero_url).sort((a, b) => rank(a) - rank(b)).slice(0, 3);
    const slides = hero.querySelector('.home-hero__slides');
    const dots = hero.querySelector('.home-hero__dots');
    picks.forEach((j) => {
      const i = this._scenes.length;
      this._scenes.push({ key: 'door', j });
      const base = UI.esc(j.hero_url.replace(/\.jpg$/, ''));
      slides.insertAdjacentHTML('beforeend', `<picture><source type="image/avif" data-srcset="${base}.960.avif 960w, ${base}.1536.avif 1536w" sizes="100vw"><img class="home-hero__img" data-scene="${i}" data-src="${UI.esc(j.hero_url)}" alt="" decoding="async"></picture>`);
      const no = String(j.entrance.no).padStart(3, '0');
      dots.insertAdjacentHTML('beforeend', `<button type="button" class="home-hero__dot" data-go="${i}" aria-label="${no} ${UI.esc(j.title)}" aria-current="false"><i></i><span class="num">${no}</span></button>`);
    });
    const open = journeys.filter((j) => this.isOpen(j.entrance, hour)).length;
    const now = hero.querySelector('#hero-now');
    const tick = () => {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      now.innerHTML = `<time class="num" datetime="${hh}:${mm}">${hh}<i aria-hidden="true">:</i>${mm}</time><span>${UI.esc(t(`entrance.time.${this.hourName(d.getHours())}`))}</span><span>${UI.esc(t('home.now', { n: open }))}</span>`;
    };
    tick();
    now.hidden = false;
    clearInterval(this._clock);
    this._clock = setInterval(tick, 20000);
    this._schedule(hero);
  },

  // Later scenes load shortly before they are due, so they never compete with the first one.
  _warm(hero, i) {
    const img = hero.querySelector(`.home-hero__img[data-scene="${i}"][data-src]`);
    if (!img) return;
    const source = img.previousElementSibling;
    if (source && source.dataset.srcset) { source.srcset = source.dataset.srcset; source.removeAttribute('data-srcset'); }
    img.src = img.dataset.src;
    img.removeAttribute('data-src');
  },

  _schedule(hero) {
    clearTimeout(this._timer);
    clearTimeout(this._warmTimer);
    if (this._scenes.length < 2) return;
    this._warmTimer = setTimeout(() => this._warm(hero, (this._scene + 1) % this._scenes.length), Math.max(0, this.SCENE_MS - 2500));
    if (this._paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this._timer = setTimeout(() => this._show(hero, (this._scene + 1) % this._scenes.length), this.SCENE_MS);
  },

  _show(hero, i, { user = false } = {}) {
    if (!hero.isConnected || !this._scenes[i]) return;
    const sc = this._scenes[i];
    this._warm(hero, i);
    this._scene = i;
    hero.className = hero.className.replace(/scene-\S+/, `scene-${sc.key}`);
    hero.querySelectorAll('.home-hero__img').forEach((img) => img.classList.toggle('is-active', Number(img.dataset.scene) === i));
    hero.querySelectorAll('.home-hero__dot').forEach((d) => d.setAttribute('aria-current', String(Number(d.dataset.go) === i)));
    const copy = hero.querySelector('.home-hero__copy');
    copy.classList.remove('is-in');
    void copy.offsetWidth;
    const j = sc.j;
    const e = j && j.entrance;
    copy.querySelector('#hero-eyebrow').textContent = e
      ? `No.${String(e.no).padStart(3, '0')} · ${t(`entrance.realm.${e.realm}`)} · ${t(`entrance.time.${e.time}`)}`
      : t('brand.tagline');
    copy.querySelector('.home-hero__title .home-hero__line').textContent = j ? j.title : t('home.scene.taoyuan.title');
    copy.querySelector('.home-hero__lead .home-hero__line').textContent = j ? (j.story_hook || j.subtitle || '') : t('home.scene.taoyuan.lead');
    const enter = copy.querySelector('#hero-enter');
    enter.hidden = !j;
    if (j) { enter.href = `#/journey/${encodeURIComponent(j.slug)}`; enter.dataset.slug = j.slug; }
    copy.classList.add('is-in');
    if (user) hero.classList.add('is-held');
    this._schedule(hero);
  },

  // --- The hundred doors ------------------------------------------------------------------------

  _setupAtlas(section) {
    const grid = section.querySelector('#atlas-grid');
    let pointer = 'mouse';
    grid.addEventListener('pointerdown', (e) => { pointer = e.pointerType; }, { passive: true });
    const doorOf = (el) => el && el.closest && el.closest('a.door__link');
    grid.addEventListener('pointerover', (e) => {
      const a = doorOf(e.target);
      if (a && e.pointerType === 'mouse') this._select(Number(a.dataset.no));
    });
    grid.addEventListener('focusin', (e) => {
      const a = doorOf(e.target);
      if (a) this._select(Number(a.dataset.no));
    });
    // On touch the first tap shows the door; the second (or the panel's link) walks through.
    grid.addEventListener('click', (e) => {
      const a = doorOf(e.target);
      if (!a || pointer !== 'touch' || this._selected === Number(a.dataset.no)) return;
      e.preventDefault();
      this._select(Number(a.dataset.no), { scroll: true });
    });
    section.querySelector('#atlas-filters').addEventListener('click', (e) => {
      const b = e.target.closest('[data-filter]');
      if (b) this._filter(b.dataset.filter);
    });
    if ('IntersectionObserver' in window) {
      grid.classList.add('will-light');
      this._observer = new IntersectionObserver((entries) => {
        if (entries.some((en) => en.isIntersecting)) { grid.classList.add('is-lit'); this._observer.disconnect(); }
      }, { threshold: 0.15 });
      this._observer.observe(grid);
    } else {
      grid.classList.add('is-lit');
    }
  },

  _renderAtlas(journeys) {
    const esc = UI.esc;
    const grid = document.getElementById('atlas-grid');
    if (!grid) return;
    const hour = new Date().getHours();
    this._doors = new Map(journeys.filter((j) => j.entrance).map((j) => [j.entrance.no, j]));
    const found = this._doors.size;
    grid.innerHTML = Array.from({ length: 100 }, (_, k) => {
      const n = k + 1;
      const no = String(n).padStart(3, '0');
      const j = this._doors.get(n);
      if (!j) return `<li class="door" aria-hidden="true" style="--i:${k}"><span class="door__no num">${no}</span></li>`;
      const e = j.entrance;
      return `<li class="door is-found" style="--i:${k}" data-realm="${esc(e.realm)}" data-open="${this.isOpen(e, hour)}">
        <a class="door__link" href="#/journey/${encodeURIComponent(j.slug)}" data-slug="${esc(j.slug)}" data-no="${n}" data-quiet aria-label="No.${no} ${esc(t(`entrance.realm.${e.realm}`))} · ${esc(j.title)}">
          <span class="door__no num">${no}</span><i class="door__lamp" aria-hidden="true"></i>
        </a></li>`;
    }).join('');
    grid.setAttribute('aria-busy', 'false');
    document.getElementById('atlas-found').textContent = found;
    document.getElementById('atlas-title').textContent = t('home.atlas.title', { n: found });
    document.getElementById('atlas-rest').textContent = t('home.atlas.rest', { n: 100 - found });
    const count = (f) => journeys.filter((j) => j.entrance && f(j.entrance)).length;
    const chip = (key, label, n) => `<button type="button" class="home-atlas__chip" data-filter="${key}" aria-pressed="${key === ''}"${key && key !== 'now' ? ` style="--lamp:var(--realm-${key})"` : ''}>${key && key !== 'now' ? '<i aria-hidden="true"></i>' : ''}<span>${esc(label)}</span><span class="num">${n}</span></button>`;
    document.getElementById('atlas-filters').innerHTML = [
      chip('', t('home.atlas.all'), found),
      chip('now', t('home.atlas.now'), count((e) => this.isOpen(e, hour))),
      ...this.REALMS.map((r) => chip(r, t(`entrance.realm.${r}`), count((e) => e.realm === r))),
    ].join('');
    const first = journeys.find((j) => this.isOpen(j.entrance, hour) && j.entrance) || journeys.find((j) => j.entrance);
    if (first) this._select(first.entrance.no);
  },

  _filter(key) {
    const grid = document.getElementById('atlas-grid');
    if (!grid) return;
    document.querySelectorAll('#atlas-filters [data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === key)));
    const match = (li) => !key || (key === 'now' ? li.dataset.open === 'true' : li.dataset.realm === key);
    let firstNo = 0;
    grid.querySelectorAll('.door').forEach((li) => {
      const on = li.classList.contains('is-found') && match(li);
      li.classList.toggle('is-dim', !!key && !on);
      if (on && !firstNo) firstNo = Number(li.querySelector('a').dataset.no);
    });
    grid.dataset.filter = key;
    const current = grid.querySelector(`a[data-no="${this._selected}"]`);
    if (firstNo && (!current || current.closest('.door').classList.contains('is-dim'))) this._select(firstNo);
  },

  _select(no, { scroll = false } = {}) {
    const j = this._doors && this._doors.get(no);
    const panel = document.getElementById('atlas-panel');
    if (!j || !panel || this._selected === no) return;
    this._selected = no;
    document.querySelectorAll('#atlas-grid .door.is-selected').forEach((li) => li.classList.remove('is-selected'));
    const a = document.querySelector(`#atlas-grid a[data-no="${no}"]`);
    if (a) a.closest('.door').classList.add('is-selected');
    const esc = UI.esc;
    const e = j.entrance;
    const opens = j.content && j.content.opens;
    panel.innerHTML = `
      <a class="door-card" href="#/journey/${encodeURIComponent(j.slug)}" data-slug="${esc(j.slug)}" style="--lamp:var(--realm-${esc(e.realm)})">
        <span class="door-card__media">${UI.picture(j.image_url, { sizes: '(max-width: 760px) 38vw, 300px', width: 720, height: 900 })}</span>
        <span class="door-card__body">
          <span class="door-card__meta num">No.${String(no).padStart(3, '0')} <i aria-hidden="true"></i> ${esc(t(`entrance.realm.${e.realm}`))}</span>
          <strong class="door-card__title">${esc(j.title)}</strong>
          ${j.story_hook ? `<span class="door-card__hook">${esc(j.story_hook)}</span>` : ''}
          ${opens ? `<span class="door-card__opens"><b>${esc(t('detail.facts.opens'))}</b>${esc(opens)}</span>` : ''}
          <span class="door-card__go">${esc(t('home.scenes.enter'))} ${UI.icon('arrow', 'icon--sm')}</span>
        </span>
      </a>`;
    if (scroll && window.matchMedia('(max-width: 960px)').matches) panel.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  },

  /** The first step of the core flow: find your type (self or with the guide), or browse. */
  _invite() {
    const esc = UI.esc;
    const code = Guest.mbti();
    const face = `<span class="home-invite__face">${Lumi.svg(code, { size: 64 })}</span>`;
    if (code) {
      return `
        <aside class="home-invite home-invite--back" aria-labelledby="home-invite-title">
          ${face}
          <div class="home-invite__text"><h2 id="home-invite-title">${esc(t('invite.welcome', { code }))}</h2></div>
          <div class="home-invite__actions"><a class="btn btn--primary" id="invite-space" href="#/space">${esc(t('invite.back'))}</a></div>
        </aside>`;
    }
    const quiet = Guest.get().invite === 'dismissed';
    return `
      <aside class="home-invite${quiet ? ' home-invite--quiet' : ''}" aria-labelledby="home-invite-title">
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
      </aside>`;
  },

  _featureCard(j, lead) {
    const esc = UI.esc;
    const mood = (j.mood_keywords || [])[0];
    const mbti = UI.topMbti(j);
    return `
      <a class="feature-card home-card ${lead ? 'feature-card--lead' : ''}" href="#/journey/${encodeURIComponent(j.slug)}" data-slug="${esc(j.slug)}" data-testid="journey-card">
        ${UI.picture(j.image_url, { sizes: lead ? '(max-width: 760px) 100vw, 50vw' : '(max-width: 760px) 50vw, 25vw', width: 720, height: 900, eager: lead })}
        <div class="feature-card__body">
          <div class="feature-card__tags home-card__tags">
            ${mood ? `<span class="tag-mood">${esc(mood)}</span>` : ''}
            ${mbti ? `<span class="tag-code">${esc(mbti)}</span>` : ''}
          </div>
          <h3 class="feature-card__title">${esc(j.title)}</h3>
          ${lead && j.story_hook ? `<p class="feature-card__hook">${esc(j.story_hook)}</p>` : ''}
          <div class="feature-card__meta"><span>${esc(UI.region(j))}</span><span class="num">${esc(UI.coins(j.price))}</span></div>
        </div>
      </a>`;
  },
};

/**
 * Lantern fireflies drifting over the hero. Pauses when the tab is hidden, stops on route
 * change, and is skipped entirely for prefers-reduced-motion.
 */
const HeroParticles = {
  start(hero, canvas) {
    if (!hero || !canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return { stop() {} };
    const ctx = canvas.getContext('2d');
    let particles = [];
    let frame = 0;
    let running = true;
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
    const onVisibility = () => {
      if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
      else if (running && !frame) frame = requestAnimationFrame(draw);
    };

    function draw() {
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
      frame = running && !document.hidden ? requestAnimationFrame(draw) : 0;
    }

    resize();
    window.addEventListener('resize', resize, { passive: true });
    hero.addEventListener('pointermove', onMove, { passive: true });
    hero.addEventListener('pointerleave', onLeave, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    frame = requestAnimationFrame(draw);

    return {
      stop() {
        running = false;
        cancelAnimationFrame(frame);
        window.removeEventListener('resize', resize);
        hero.removeEventListener('pointermove', onMove);
        hero.removeEventListener('pointerleave', onLeave);
        document.removeEventListener('visibilitychange', onVisibility);
      },
    };
  },
};
