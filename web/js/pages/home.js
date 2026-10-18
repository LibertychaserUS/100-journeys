/**
 * Home — brand hero with search and mood entry points, a three-step explainer,
 * and five featured journeys (one lead + four).
 */
var Pages = window.Pages || {};

Pages.Home = {
  _particles: null,
  _scene: 0,
  _timer: null,
  _paused: false,
  _onVisibility: null,

  // The opening rotates through three entrances; each can be stepped into. Images fall back to
  // what exists until the per-journey scene images arrive.
  _scenes: [
    { key: 'taoyuan', img: 'generated/hero-taoyuan.jpg' },
    { key: 'mirror', img: 'generated/card-salt-mirror.jpg', slug: 'bolivia-salt-flat-trek' },
    { key: 'night', img: 'generated/card-sahara-stars.jpg', slug: 'morocco-sahara-camel-camp' },
  ],
  SCENE_MS: 6800,

  // Mood shortcuts map to real filters on Explore.
  _moods: [
    { key: 'home.mood.escape', param: 'tag', value: 'solitude' },
    { key: 'home.mood.heal', param: 'fantasy_type', value: 'spiritual' },
    { key: 'home.mood.adventure', param: 'fantasy_type', value: 'extreme' },
    { key: 'home.mood.stars', param: 'fantasy_type', value: 'night' },
  ],

  render() {
    const esc = UI.esc;
    const main = document.getElementById('main-content');
    document.body.dataset.mediaHeader = '';
    main.innerHTML = `
      <section class="home-hero scene-${this._scenes[0].key}" aria-labelledby="hero-title" aria-roledescription="${esc(t('home.scenes.role'))}">
        <div class="home-hero__slides" aria-hidden="true">
          ${UI.picture(API.mediaUrl(this._scenes[0].img), { sizes: '100vw', eager: true, cls: 'home-hero__img is-active', attrs: 'data-scene="0"' })}
          ${this._scenes.slice(1).map((sc, i) => `<img class="home-hero__img" data-scene="${i + 1}" data-src="${UI.esc(API.mediaUrl(sc.img))}" alt="" decoding="async">`).join('')}
        </div>
        <canvas class="home-hero__particles" aria-hidden="true"></canvas>
        <div class="home-hero__shade" aria-hidden="true"></div>
        <div class="container home-hero__content">
          <p class="home-hero__eyebrow">${esc(t('brand.tagline'))}</p>
          <div class="home-hero__copy" aria-live="off">
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
          <div class="home-hero__dots" role="group" aria-label="${esc(t('home.scenes.label'))}">
            ${this._scenes.map((sc, i) => `<button type="button" class="home-hero__dot" data-go="${i}" aria-label="${esc(t(`home.scene.${sc.key}.title`))}" aria-current="${i === 0}"><i></i></button>`).join('')}
          </div>
          <div class="home-hero__moods">
            <span>${esc(t('home.moodsLabel'))}</span>
            ${this._moods.map((m) => `<a class="chip home-hero__chip" href="#/explore?${m.param}=${m.value}" data-filter-key="${m.param}" data-filter-value="${m.value}">${esc(t(m.key))}</a>`).join('')}
          </div>
        </div>
      </section>

      <div class="container" id="home-invite-slot">${this._invite()}</div>

      <section class="container home-steps" aria-label="${esc(t('home.stepsLabel'))}">
        <ol class="home-steps__row">
          ${[1, 2, 3].map((n) => `
            <li class="home-step">
              <span class="home-step__n" aria-hidden="true">0${n}</span>
              <h2>${esc(t(`home.step${n}.title`))}</h2>
              <p>${esc(t(`home.step${n}.text`))}</p>
            </li>`).join('')}
        </ol>
      </section>

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
    this._particles = HeroParticles.start(main.querySelector('.home-hero'), main.querySelector('.home-hero__particles'));
    this._setupScenes(main.querySelector('.home-hero'));
    this._loadFeatured();
  },

  destroy() {
    if (this._particles) this._particles.stop();
    this._particles = null;
    clearTimeout(this._timer);
    clearTimeout(this._warmTimer);
    this._timer = null;
    if (this._onVisibility) document.removeEventListener('visibilitychange', this._onVisibility);
    this._onVisibility = null;
  },

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

  // Later scenes load shortly before they are due, so they never compete with the first one.
  _warm(hero, i) {
    const img = hero.querySelector(`.home-hero__img[data-scene="${i}"][data-src]`);
    if (img) { img.src = img.dataset.src; img.removeAttribute('data-src'); }
  },

  _schedule(hero) {
    clearTimeout(this._timer);
    clearTimeout(this._warmTimer);
    this._warmTimer = setTimeout(() => this._warm(hero, (this._scene + 1) % this._scenes.length), Math.max(0, this.SCENE_MS - 2500));
    if (this._paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this._timer = setTimeout(() => this._show(hero, (this._scene + 1) % this._scenes.length), this.SCENE_MS);
  },

  _show(hero, i, { user = false } = {}) {
    if (!hero.isConnected) return;
    const sc = this._scenes[i];
    this._warm(hero, i);
    this._scene = i;
    hero.className = hero.className.replace(/scene-\S+/, `scene-${sc.key}`);
    hero.querySelectorAll('.home-hero__img').forEach((img) => img.classList.toggle('is-active', Number(img.dataset.scene) === i));
    hero.querySelectorAll('.home-hero__dot').forEach((d) => d.setAttribute('aria-current', String(Number(d.dataset.go) === i)));
    const copy = hero.querySelector('.home-hero__copy');
    copy.classList.remove('is-in');
    void copy.offsetWidth;
    copy.querySelector('.home-hero__title .home-hero__line').textContent = t(`home.scene.${sc.key}.title`);
    copy.querySelector('.home-hero__lead .home-hero__line').textContent = t(`home.scene.${sc.key}.lead`);
    const enter = copy.querySelector('#hero-enter');
    enter.hidden = !sc.slug;
    if (sc.slug) enter.href = `#/journey/${encodeURIComponent(sc.slug)}`;
    copy.classList.add('is-in');
    if (user) hero.classList.add('is-held');
    this._schedule(hero);
  },

  /** The first step of the core flow: find your type (self or with the guide), or browse. */
  _invite() {
    const esc = UI.esc;
    const code = Guest.mbti();
    const face = `<span class="home-invite__face">${Lumi.svg(code, { size: 56 })}</span>`;
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
          <p class="eyebrow">${esc(t('invite.label'))}</p>
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

  async _loadFeatured() {
    const grid = document.getElementById('featured-grid');
    try {
      const res = await API.getJourneys({ limit: 5 });
      if (!grid.isConnected) return;
      const journeys = res.data || [];
      grid.innerHTML = journeys.map((j, i) => this._featureCard(j, i === 0)).join('');
      const all = document.getElementById('featured-all');
      if (all && res.total) all.innerHTML = `${UI.esc(t('home.featured.all', { n: res.total }))} ${UI.icon('arrow', 'icon--sm')}`;
    } catch (err) {
      if (!grid.isConnected) return;
      grid.innerHTML = `<div class="state"><p class="state__title">${UI.esc(t('home.featured.error'))}</p><p class="state__text">${UI.esc(I18n.error(err))}</p>
        <div class="state__actions"><button class="btn btn--ghost" type="button" id="featured-retry">${UI.icon('refresh')}${UI.esc(t('common.retry'))}</button></div></div>`;
      grid.querySelector('#featured-retry').addEventListener('click', () => this._loadFeatured());
    } finally {
      if (grid.isConnected) grid.setAttribute('aria-busy', 'false');
    }
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
