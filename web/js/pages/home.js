/**
 * Home — the opening (the brand scene, then doors open right now), the hundred doors, the
 * invitation to find your type, the doors opening next, and a closing scene.
 *
 * "Open" is always judged on the door's own clock and calendar (entrance.tz, entrance.months,
 * entrance.time), never the visitor's.
 */
var Pages = window.Pages || {};

/**
 * Each door's own clock: its local time, whether it is open now, when it opens next (local time
 * and how long from now), and what it waits on that the site cannot see. A door opens in its
 * months, on its weekdays, never on its skipped dates, inside its window: a fixed local span, a
 * span around its sunrise, solar noon or sunset (worked out from where it is), or the dark hours
 * with the moon below the horizon.
 */
const DoorClock = (() => {
  const BUCKETS = { midnight: [0, 180], predawn: [180, 300], dawn: [300, 420], morning: [420, 660], noon: [660, 840], afternoon: [780, 1020], dusk: [1020, 1140], 'blue-hour': [1080, 1200], night: [1140, 1440], any: [0, 1440] };
  const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const DAY = 1440;
  const formats = new Map();
  const rad = Math.PI / 180;

  // The door's wall clock: calendar date, weekday (ISO 1-7) and minute of the day.
  function wall(tz, date) {
    if (!formats.has(tz)) {
      let f = null;
      try { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short', hourCycle: 'h23' }); } catch (e) { f = null; }
      formats.set(tz, f);
    }
    const f = formats.get(tz);
    if (!f) return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate(), wd: ((date.getDay() + 6) % 7) + 1, min: date.getHours() * 60 + date.getMinutes() };
    const p = {};
    f.formatToParts(date).forEach((x) => { p[x.type] = x.value; });
    const wd = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday] || 1;
    return { y: Number(p.year), m: Number(p.month), d: Number(p.day), wd, min: (Number(p.hour) % 24) * 60 + Number(p.minute) };
  }

  // Minutes the door's clock runs ahead of UTC at a given instant.
  function offset(tz, date) {
    const w = wall(tz, date);
    const asUTC = Date.UTC(w.y, w.m - 1, w.d, Math.floor(w.min / 60), w.min % 60);
    return Math.round((asUTC - Math.floor(date.getTime() / 60000) * 60000) / 60000);
  }

  // Sunrise, solar noon and sunset, in minutes after 00:00 UTC of that date (NOAA's approximation,
  // good to a minute or two). rise/set are null when the sun stays down (or up) all day.
  function sun(lat, lon, y, m, d) {
    const n = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 864e5);
    const g = (2 * Math.PI / 365) * (n - 1);
    const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const noon = 720 - 4 * lon - eq;
    const c = Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl);
    if (c > 1) return { noon, rise: null, set: null, up: false };
    if (c < -1) return { noon, rise: null, set: null, up: true };
    const ha = Math.acos(c) / rad;
    return { noon, rise: noon - 4 * ha, set: noon + 4 * ha, up: true };
  }

  // Days since the last new moon at an instant.
  const SYNODIC = 29.530588853;
  const moonAge = (ms) => (((ms - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % SYNODIC + SYNODIC) % SYNODIC;

  const hm = (x) => { const [h, m] = x.split(':').map(Number); return h * 60 + m; };

  // The door's open spans on one of its days, in minutes from that day's local midnight.
  function spans(e, y, m, d, off) {
    const w = e.window;
    if (!w) { const b = BUCKETS[e.time] || BUCKETS.any; return [b]; }
    if (w.at) { const a = hm(w.at); let u = hm(w.until); if (u <= a) u += DAY; return [[a, u]]; }
    const s = sun(e.lat, e.lon, y, m, d);
    const midnightUTC = Date.UTC(y, m - 1, d) - off * 60000;
    if (w.moon_age) {
      const age = moonAge(midnightUTC + ((s.set != null ? s.set : s.noon) + off) * 60000);
      if (age < w.moon_age[0] || age > w.moon_age[1]) return [];
    }
    if (w.sun) {
      const base = w.sun === 'noon' ? (s.up ? s.noon : null) : s[w.sun];
      return base == null ? [] : [[base + off + w.from, base + off + w.to]];
    }
    if (w.moon === 'dark') {
      if (s.set == null || s.rise == null) return [];
      const age = moonAge(Date.UTC(y, m - 1, d) + s.set * 60000);
      const dusk = s.set + 80;
      const dawn = s.rise + DAY - 80;
      // the moon sets about 49 minutes later each night after new, and rises that much later after full
      const [a, b] = age < 14.77 ? [Math.max(dusk, s.set + age * 48.8), dawn] : [dusk, Math.min(dawn, s.set + (age - 14.77) * 48.8)];
      return b - a >= 30 ? [[a + off, b + off]] : [];
    }
    return [];
  }

  function allowed(e, y, m, d, wd) {
    const months = e.months && e.months.length ? e.months : ALL;
    if (!months.includes(m)) return false;
    const w = e.window || {};
    if (w.days && w.days.length && !w.days.includes(wd)) return false;
    if (w.except && w.except.includes(`${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)) return false;
    return true;
  }

  const clock = (min) => { const x = ((Math.round(min) % DAY) + DAY) % DAY; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };

  /** { open, hh, mm, at (local opening time), minutes (until it opens), days, month, closes, needs } */
  function state(e, now = new Date()) {
    if (!e) return { open: false };
    const tz = e.tz || 'UTC';
    const here = wall(tz, now);
    const off = offset(tz, now);
    const out = { hh: String(Math.floor(here.min / 60)).padStart(2, '0'), mm: String(here.min % 60).padStart(2, '0'), needs: (e.window && e.window.needs) || '' };
    for (let k = -1; k < 400; k += 1) {
      const t0 = new Date(Date.UTC(here.y, here.m - 1, here.d + k));
      const y = t0.getUTCFullYear(); const m = t0.getUTCMonth() + 1; const d = t0.getUTCDate(); const wd = ((t0.getUTCDay() + 6) % 7) + 1;
      if (!allowed(e, y, m, d, wd)) continue;
      for (const [a, b] of spans(e, y, m, d, off)) {
        const start = k * DAY + a - here.min;
        const end = k * DAY + b - here.min;
        if (end <= 0) continue;
        out.at = clock(a);
        if (start <= 0) { out.open = true; out.closes = Math.round(end); return out; }
        out.open = false;
        out.minutes = Math.round(start);
        if (start > 2 * DAY) {
          // out of its season: name the month it comes back; in season: count the days
          const months = e.months && e.months.length ? e.months : ALL;
          if (!months.includes(here.m) || start > 31 * DAY) out.month = m;
          else out.days = Math.round(start / DAY);
        }
        return out;
      }
    }
    out.open = false;
    out.month = (e.months && e.months[0]) || here.m;
    return out;
  }

  /** The short form: "此刻开着" / "2 小时 10 分后开" / "3 天后开" / "12 月才开" */
  function when(s) {
    if (s.open) return t('home.door.open');
    if (s.month) return t('home.door.month', { m: I18n.lang === 'en' ? new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(2020, s.month - 1, 1)) : s.month });
    if (s.days) return t('home.door.inDays', { n: s.days });
    const h = Math.floor(s.minutes / 60);
    const m = s.minutes % 60;
    return !h ? t('home.door.inMin', { m }) : m ? t('home.door.in', { h, m }) : t('home.door.inH', { h });
  }

  /** The long form, with the door's own opening time: "当地 07:00 开 · 还有 43 分钟" */
  function whenAt(s) {
    if (s.open || s.month || !s.at) return when(s);
    return t('home.door.atIn', { at: s.at, rest: when(s) });
  }

  /** What the door waits on that the site cannot see, or '' */
  const needs = (s) => (s && s.needs ? t(`home.door.needs.${s.needs}`) : '');

  /** The door that never closes (open all day, every day of the year): it is open, but it is not
   *  one of the doors lit in their own hour, so it is never offered as one. */
  const always = (e) => {
    const w = e && e.window;
    return !!w && w.at === '00:00' && w.until === '24:00' && !(w.days && w.days.length) && !(w.except && w.except.length)
      && !w.needs && (!e.months || !e.months.length || e.months.length === 12);
  };
  /** Open in its own hour right now. */
  const lit = (e, s) => !!(s && s.open) && !always(e);

  return { state, when, whenAt, needs, sun, always, lit };
})();

/**
 * The fisherman's marks on the threshold, as lantern points along a wider arch around the door: from
 * its left foot, over the top, down to its right foot. Each is [angle round the arch's curve, how far
 * down its side (0 at the curve, 1 at the sill), a small nudge off the line in px].
 */
const MARKS = [[180, 0.88, 0], [180, 0.55, 0], [180, 0.2, 0], [160, 0, -4], [136, 0, 5], [109, 0, -3], [84, 0, 6], [60, 0, -5], [33, 0, 4], [0, 0.18, 0], [0, 0.52, 0], [0, 0.9, 0]];

Pages.Home = {
  SCENE_MS: 6800,
  FIRST_MS: 10000, // the prologue stays a little longer the first time
  PICK_MS: 12000, // a scene the visitor picked
  BRAND: { key: 'taoyuan', img: 'generated/hero-taoyuan-v2.jpg', jpeg: 'generated/hero-taoyuan-v2-1600.jpg', phone: 'generated/hero-taoyuan-v2-phone.jpg', tablet: 'generated/hero-taoyuan-v2-tablet.jpg' },
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
    this._held = false;
    this._doors = new Map();
    // re-rendered in place (a language switch): the page is already here, so nothing arrives again,
    // and the visitor's pause is kept
    this._swap = typeof Router !== 'undefined' && Router.swapping;
    this._userPaused = !!(this._swap && this._keepPaused);
    this._dwell = this._swap ? this.SCENE_MS : this.FIRST_MS;
    if (this._swap && this._lastSelected) this._pinned = this._lastSelected;
    // coming back to the page (Back from a door): it is where it was, so nothing arrives again either
    this._still = this._swap || typeof Router.state().y === 'number';
    this._counted = this._still;
    this._countPending = false;
    this._cleanups = [];
    const doors = (window.APP_CONFIG && APP_CONFIG.doors) || 48;
    const bootT = Math.round(performance.now());
    main.innerHTML = `
      <section class="home-hero scene-taoyuan${this._still ? '' : ' is-booting'}" aria-labelledby="hero-brand" style="--boot-t:-${bootT}ms">
        <div class="home-hero__slides" aria-hidden="true">
          ${UI.picture(API.mediaUrl(this.BRAND.img), {
            // (177.7svh: a 16:9 picture filling the height, without asking for a pixel more than it needs)
            sizes: 'max(100vw, 177.7svh)', eager: true, cls: 'home-hero__img is-active', attrs: 'data-scene="0"',
            fallback: API.mediaUrl(this.BRAND.jpeg),
            sources: [
              { media: '(orientation: portrait) and (max-width: 599px)', src: API.mediaUrl(this.BRAND.phone) },
              { media: '(orientation: portrait)', src: API.mediaUrl(this.BRAND.tablet) },
            ],
          })}
        </div>
        <canvas class="home-hero__particles" aria-hidden="true"></canvas>
        <div class="home-hero__shade" aria-hidden="true"></div>
        <div class="home-hero__grain" aria-hidden="true"></div>
        <div class="container home-hero__content" id="hero-content">
          <h1 class="sr-only" id="hero-brand">${esc(t('brand'))}</h1>
          <div class="home-hero__copy${this._still ? '' : ' is-in'}" id="hero-copy" role="group" aria-roledescription="${esc(t('home.scenes.slide'))}">
            <p class="home-hero__eyebrow"><span class="home-hero__line" id="hero-eyebrow">${esc(t('home.myth'))}</span></p>
            <p class="home-hero__title" id="hero-title"><span class="home-hero__line">${esc(t('home.scene.taoyuan.title'))}</span></p>
            <p class="home-hero__lead"><span class="home-hero__line" id="hero-lead">${esc(t('home.scene.taoyuan.lead'))}</span></p>
          </div>
          <div class="home-hero__actions">
            <a class="btn btn--primary home-hero__step" id="hero-enter" href="#atlas" data-to-atlas><span id="hero-enter-label">${esc(t('home.step'))}</span>${UI.icon('arrow', 'icon--sm')}</a>
            <a class="home-hero__door" id="hero-door" href="#atlas" hidden></a>
          </div>
          <div class="home-hero__foot">
            <button type="button" class="home-hero__pause" id="hero-pause" aria-pressed="false" aria-label="${esc(t('home.scenes.pause'))}" hidden>${UI.icon('pause', 'icon--sm')}</button>
            <div class="home-hero__dots" id="hero-dots" role="group" aria-label="${esc(t('home.scenes.label'))}">
              <button type="button" class="home-hero__dot" data-go="0" aria-label="${esc(`${t('home.scenes.prologue')} ${t('home.scene.taoyuan.title')}`)}" aria-current="true"><i></i><span class="num">${esc(t('home.scenes.prologue'))}</span></button>
              ${'<span class="home-hero__dot is-placeholder" aria-hidden="true"><i></i><span class="num">000</span></span>'.repeat(3)}
            </div>
            <a class="home-hero__now" id="hero-now" href="#atlas" data-to-atlas data-now hidden></a>
          </div>
        </div>
      </section>

      <section class="home-threshold" id="home-threshold" data-media-end aria-labelledby="threshold-title">
        <h2 class="sr-only" id="threshold-title">${esc(t('home.threshold.label'))}</h2>
        <div class="home-threshold__stage" data-layered>
          <div class="home-threshold__floor" aria-hidden="true"></div>
          <div class="home-threshold__frame" aria-hidden="true">
            <i class="home-threshold__glow"></i><i class="home-threshold__inner"></i>
            <span class="home-threshold__marks">${MARKS.map(([a, d, j], i) => `<b style="--a:${a}deg;--d:${d};--j:${j}px;--at:${(i / MARKS.length).toFixed(3)}"></b>`).join('')}</span>
          </div>
          <div class="home-threshold__open" aria-hidden="true"></div>
          <div class="home-threshold__beats">${this._beats().map((k, i) => `<p class="home-threshold__beat${k === 'b0' ? ' home-threshold__beat--setup' : ''}" style="--o:${i ? 0 : 1}">${esc(t(`home.threshold.${k}`)).replace(/\u200b/g, '<wbr>')}</p>`).join('')}</div>
        </div>
      </section>

      <section class="home-atlas" id="atlas" tabindex="-1" aria-labelledby="atlas-title">
        <div class="container">
          <header class="home-atlas__head">
            <p class="home-atlas__count num" aria-hidden="true"><b id="atlas-found">${'IntersectionObserver' in window && !this._reduce() && !this._still ? 0 : doors}</b><span>/ 100</span></p>
            <div class="home-atlas__intro">
              <h2 id="atlas-title" class="reveal">${esc(t('home.atlas.title'))}<span class="sr-only" id="atlas-found-line"> ${esc(t('home.atlas.found', { n: doors }))}</span></h2>
              <p class="home-atlas__legend"><i aria-hidden="true"></i><span id="atlas-legend">${esc(t('home.atlas.legend'))}</span></p>
            </div>
            <form class="home-atlas__search" id="atlas-search" role="search">
              ${UI.icon('search', 'icon--sm')}
              <label class="sr-only" for="atlas-q">${esc(t('home.atlas.searchLabel'))}</label>
              <input id="atlas-q" data-testid="search-input" type="search" name="q" autocomplete="off" placeholder="${esc(t('home.atlas.search'))}">
              <button class="btn btn--quiet btn--sm" type="submit">${esc(t('home.atlas.searchCta'))}</button>
            </form>
          </header>
          <div class="home-atlas__filters" id="atlas-filters" role="group" aria-label="${esc(t('home.atlas.label'))}"></div>
          <p class="sr-only" id="atlas-status" role="status" aria-live="polite"></p>
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
              <a class="door-card" id="door-card" href="#/explore" tabindex="-1">
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

      <section class="home-behind" id="home-behind" aria-labelledby="behind-title" data-reading hidden>
        <div class="container home-behind__inner">
          <h2 class="eyebrow" id="behind-title">${esc(t('home.behind.eyebrow'))}</h2>
          <div id="behind-body"></div>
        </div>
      </section>

      <section class="home-station" id="home-station" aria-labelledby="station-band-title">
        <div class="container home-station__inner">
          <div class="home-station__text">
            <h2 id="station-band-title">${esc(t('home.station.title'))}</h2>
            <p>${esc(t('station.lead'))}</p>
            <a class="link-arrow" href="#/station">${esc(t('home.station.go'))} ${UI.icon('arrow', 'icon--sm')}</a>
          </div>
          <ul class="home-station__racks" id="home-station-racks" aria-busy="true"></ul>
        </div>
      </section>

      <section class="home-close" aria-labelledby="close-title">
        <h2 class="sr-only" id="close-title">${esc(t('home.close.label'))}</h2>
        <div class="container home-close__inner">
          <figure class="home-close__quote">
            ${I18n.lang === 'en' ? '<p class="home-close__orig" lang="zh-CN">缘溪行，忘路之远近。</p>' : ''}
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
    // "Step in" and "open now" go straight to the doors (the second one lights only open doors):
    // an arch of lantern light opens over the opening onto them. The story in between is left for
    // those who scroll to it, instead of rushing past it.
    // (on the page's lasting <main>, so it goes when the page does: a re-render never adds a second)
    this._ac = new AbortController();
    main.addEventListener('click', (e) => {
      const a = e.target.closest('[data-to-atlas]');
      if (!a || a.getAttribute('href') !== '#atlas') return;
      e.preventDefault();
      if (this._stepping) return; // the door is already opening
      const atlas = document.getElementById('atlas');
      const go = () => {
        if (a.hasAttribute('data-now')) this._filterDoors('now');
        atlas.scrollIntoView({ behavior: 'instant', block: 'start' });
        Router.updateHeader();
        atlas.focus({ preventScroll: true });
      };
      if (this._reduce() || !document.startViewTransition || document.visibilityState !== 'visible') { go(); return; }
      const html = document.documentElement;
      html.classList.add('vt-step');
      this._stepping = true;
      const vt = document.startViewTransition(go);
      const quiet = () => {};
      vt.ready.catch(quiet);
      vt.updateCallbackDone.catch(quiet);
      vt.finished.catch(quiet).finally(() => { this._stepping = false; html.classList.remove('vt-step'); });
    }, { signal: this._ac.signal });
    UI.trackCardClicks(main.querySelector('#featured-grid'));
    UI.trackCardClicks(main.querySelector('#atlas-grid'));
    this._particles = HeroParticles.start(hero, main.querySelector('.home-hero__particles'));
    this._setupScenes(hero);
    this._setupAtlas(main.querySelector('#atlas'));
    this._setupScroll(main);
    setTimeout(() => hero.classList.remove('is-booting'), Math.max(0, 1900 - bootT));
    const loaded = this._load(hero);
    // in place, the new language is shown once the doors (and the scene the visitor was on) are back
    return this._swap ? loaded : undefined;
  },

  destroy() {
    if (this._ac) this._ac.abort();
    this._stepping = false;
    this._lastSelected = this._selected; // a re-render in place keeps the door being looked at
    this._keepPaused = this._userPaused; // and the visitor's pause
    if (this._particles) this._particles.stop();
    this._particles = null;
    clearTimeout(this._timer);
    clearTimeout(this._warmTimer);
    clearTimeout(this._hoverTimer);
    clearInterval(this._clock);
    (this._cleanups || []).forEach((fn) => fn());
    this._cleanups = [];
    delete document.body.dataset.atlasInView;
  },

  _reduce() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; },
  /** The threshold's lines. In English the tale is not common knowledge, so it is told first. */
  _beats() { return I18n.lang === 'en' ? ['b0', 'b1', 'b2', 'b3'] : ['b1', 'b2', 'b3']; },
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
      this._renderBehind(journeys);
      this._watchStation(document.getElementById('main-content'));
      // the other language's doors, while nothing else is happening, so a switch is instant
      const other = I18n.lang === 'zh' ? 'en' : 'zh';
      (window.requestIdleCallback || ((f) => setTimeout(f, 1500)))(() => API.prefetchJourneys({ limit: 100 }, other));
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
    const open = journeys.filter((j) => DoorClock.lit(j.entrance, this._state.get(j.entrance.no))).length;
    const nowEl = document.getElementById('hero-now');
    if (nowEl) {
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      // the visitor's own time (the doors' times are theirs), read as a time, not two numbers
      nowEl.innerHTML = `<small>${UI.esc(t('home.yourTime'))}</small><time class="num" datetime="${hh}:${mm}">${hh}<i>:</i>${mm}</time><span>${UI.esc(t('home.now', { n: open }))}</span>`;
      nowEl.hidden = false;
    }
    this._lightDoors();
    const nowChip = document.querySelector('#atlas-filters [data-filter="now"] .num');
    if (nowChip) nowChip.textContent = open;
    const legend = document.getElementById('atlas-legend');
    if (legend) legend.textContent = t(open ? 'home.atlas.legendN' : 'home.atlas.legendNone', { n: open });
    if (this._selected) this._renderDoorBody(this._doors.get(this._selected));
    this._renderClose(journeys);
    this._renderInviteDoors(journeys);
    // the opening-next countdowns keep counting
    const bySlug = new Map(journeys.map((j) => [j.slug, j]));
    document.querySelectorAll('#featured-grid .home-card[data-slug]').forEach((card) => {
      const j = bySlug.get(card.dataset.slug);
      const b = card.querySelector('.home-card__count b');
      if (!j || !b) return;
      const st = this._state.get(j.entrance.no);
      b.textContent = DoorClock.when(st);
      card.querySelector('.home-card__count').classList.toggle('is-open', !!st.open);
    });
  },

  /** A returning traveller's three doors: the best matches for their kind of traveller, with
   *  where each one stands right now. */
  _renderInviteDoors(journeys) {
    const list = document.getElementById('invite-doors');
    const code = Guest.mbti();
    if (!list || !code) return;
    const score = (j) => ((j.mbti_types || []).find((m) => m.mbti_type && m.mbti_type.code === code) || {}).compatibility_score || 0;
    const picks = journeys.filter((j) => score(j) > 0)
      .map((j) => ({ j, s: this._state.get(j.entrance.no) }))
      .sort((a, b) => score(b.j) - score(a.j) || (b.s.open - a.s.open) || a.j.entrance.no - b.j.entrance.no)
      .slice(0, 3);
    list.innerHTML = picks.map(({ j, s }) => {
      const [name] = UI.titleParts(j.title);
      return `<li><a href="#/journey/${encodeURIComponent(j.slug)}" data-slug="${UI.esc(j.slug)}"${s.open ? ' class="is-open"' : ''}>
        <span class="num">No.${String(j.entrance.no).padStart(3, '0')}</span><b>${UI.esc(name)}</b><span>${UI.esc(DoorClock.when(s))}</span></a></li>`;
    }).join('');
  },

  // --- The opening -----------------------------------------------------------------------------

  _setupScenes(hero) {
    const content = hero.querySelector('#hero-content');
    hero.querySelector('#hero-dots').addEventListener('click', (e) => {
      const b = e.target.closest('[data-go]');
      if (!b) return;
      // a pick holds its scene for a while (the strip runs that long), then the slides carry on
      this._show(hero, Number(b.dataset.go), { dwell: this.PICK_MS });
    });
    const pause = hero.querySelector('#hero-pause');
    const applyPause = () => {
      pause.setAttribute('aria-pressed', String(this._userPaused));
      pause.setAttribute('aria-label', t(this._userPaused ? 'home.scenes.play' : 'home.scenes.pause'));
      pause.innerHTML = UI.icon(this._userPaused ? 'play' : 'pause', 'icon--sm');
      hero.classList.toggle('is-held', this._userPaused || this._held);
      // pausing stops everything that moves on its own: the scenes, the drifting light, the clock
      hero.classList.toggle('is-stopped', this._userPaused);
      if (this._particles) this._particles[this._userPaused || this._offscreen ? 'pause' : 'resume']();
    };
    pause.addEventListener('click', () => {
      this._userPaused = !this._userPaused;
      applyPause();
      this._schedule(hero);
    });
    if (this._userPaused) applyPause();
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
        if (this._particles) this._particles[this._offscreen || this._userPaused ? 'pause' : 'resume']();
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
    return this._userPaused || this._held || this._offscreen || this._drawer || document.hidden || this._reduce();
  },

  // Three doors join the opening: open ones first (a different three each day), each with its own
  // landscape opening image, and its portrait cover on phones.
  _addDoorScenes(hero, journeys) {
    if (!hero.isConnected) return;
    const now = new Date();
    const day = Math.floor(now.getTime() / 864e5);
    // the door that never closes only if nothing else is open
    const rank = (j) => (DoorClock.always(j.entrance) ? 500 : DoorClock.state(j.entrance, now).open ? 0 : 1000) + ((j.entrance.no * 37 + day * 11) % 101);
    const picks = journeys.filter((j) => j.entrance && j.hero_url).sort((a, b) => rank(a) - rank(b)).slice(0, 3);
    const slides = hero.querySelector('.home-hero__slides');
    const dots = hero.querySelector('#hero-dots');
    dots.querySelectorAll('.is-placeholder').forEach((n) => n.remove());
    picks.forEach((j) => {
      const i = this._scenes.length;
      this._scenes.push({ key: 'door', j });
      const wide = UI.esc(j.hero_url.replace(/\.jpg$/, ''));
      const cover = UI.esc(j.image_url.replace(/\.jpg$/, ''));
      const portrait = /\/cover\.jpg$/.test(j.image_url) ? `<source media="(orientation: portrait)" type="image/avif" data-srcset="${cover}.720.avif 720w, ${cover}.1120.avif 1120w" sizes="100vw">` : '';
      slides.insertAdjacentHTML('beforeend', `<picture>${portrait}<source type="image/avif" data-srcset="${wide}.960.avif 960w, ${wide}.1536.avif 1536w, ${wide}.2400.avif 2400w, ${wide}.3072.avif 3072w" sizes="max(100vw, 150svh)"><img class="home-hero__img" data-scene="${i}" data-src="${UI.esc(j.hero_url)}" alt="" decoding="async"></picture>`);
      const no = String(j.entrance.no).padStart(3, '0');
      const [name, place] = UI.titleParts(j.title);
      // the spoken name starts with what the dot shows: number, then place
      const label = place ? `${no} ${place} · ${name}` : `${no} ${name}`;
      dots.insertAdjacentHTML('beforeend', `<button type="button" class="home-hero__dot" data-go="${i}" aria-label="${UI.esc(label)}" aria-current="false" data-label="${UI.esc(j.title)}"><i></i><span class="num">${no}</span> ${place ? `<span class="home-hero__dot-place">${UI.esc(place)}</span>` : ''}</button>`);
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
    const ms = this._dwell || this.SCENE_MS;
    hero.style.setProperty('--dwell', `${ms}ms`);
    this._warmTimer = setTimeout(() => this._warm(hero, (this._scene + 1) % this._scenes.length), Math.max(0, ms - 2500));
    if (this._stopped()) return;
    this._timer = setTimeout(() => this._show(hero, (this._scene + 1) % this._scenes.length), ms);
  },

  // One beat: the old copy leaves while the pictures cross; the new copy arrives once its own
  // picture is decoded, so a place name never sits on the previous place's photo.
  async _show(hero, i, { instant = false, dwell = 0 } = {}) {
    if (!hero.isConnected || !this._scenes[i] || i === this._scene) { this._schedule(hero); return; }
    this._dwell = dwell || this.SCENE_MS;
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
    // one beat: the next photo is ready, then the words leave as the photos cross, and the new words
    // arrive about halfway through the crossing
    const decoded = incoming && incoming.decode ? incoming.decode().catch(() => {}) : Promise.resolve();
    await Promise.race([decoded, new Promise((r) => setTimeout(r, 900))]);
    if (token !== this._showToken || !hero.isConnected) return;
    if (!calm) { copy.classList.remove('is-in'); copy.classList.add('is-out'); hero.querySelector('#hero-door').classList.add('is-out'); }
    if (leaving && leaving !== incoming) {
      // The push-in stops where it is instead of snapping back as the photo fades out.
      leaving.style.transform = getComputedStyle(leaving).transform;
      leaving.classList.add('is-leaving');
      leaving.classList.remove('is-active');
      setTimeout(() => { leaving.classList.remove('is-leaving'); leaving.style.transform = ''; }, 1300);
    }
    if (instant) { hero.classList.add('is-instant'); requestAnimationFrame(() => requestAnimationFrame(() => hero.classList.remove('is-instant'))); }
    if (incoming) incoming.classList.add('is-active');
    hero.className = hero.className.replace(/scene-\S+/, `scene-${sc.key}`);
    if (!calm) await new Promise((r) => setTimeout(r, 200));
    if (token !== this._showToken || !hero.isConnected) return;
    const j = sc.j;
    const e = j && j.entrance;
    // a door's scene tells its own hour: its number and realm, its local time, and whether it is open
    const ds = e && ((this._state && this._state.get(e.no)) || DoorClock.state(e));
    copy.querySelector('#hero-eyebrow').textContent = e
      ? [`No.${String(e.no).padStart(3, '0')}`, t(`entrance.realm.${e.realm}`), t('home.door.localAt', { time: `${ds.hh}:${ds.mm}` }), DoorClock.when(ds), DoorClock.needs(ds)].filter(Boolean).join(' · ')
      : t('home.myth');
    copy.querySelector('.home-hero__title .home-hero__line').innerHTML = j ? UI.titleHTML(j.title) : UI.esc(t('home.scene.taoyuan.title'));
    copy.querySelector('#hero-lead').textContent = j ? (j.story_hook || j.subtitle || '') : t('home.scene.taoyuan.lead');
    this._doorLink(hero, i);
    copy.classList.remove('is-out', 'is-in');
    if (!instant) {
      void copy.offsetWidth;
      copy.classList.add('is-in');
    }
    this._schedule(hero);
  },

  // "Step in" always goes to the doors; a door's scene adds a way through that door itself (an
  // open door is pushed open; a closed one can still be looked into), its picture growing into
  // the journey's opening.
  _doorLink(hero, i) {
    const link = hero.querySelector('#hero-door');
    const j = this._scenes[i] && this._scenes[i].j;
    if (!link) return;
    link.classList.remove('is-out');
    if (!j) { link.hidden = true; return; }
    const ds = (this._state && this._state.get(j.entrance.no)) || DoorClock.state(j.entrance);
    link.hidden = false;
    link.href = `#/journey/${encodeURIComponent(j.slug)}`;
    link.dataset.slug = j.slug;
    link.dataset.vtFrom = `.home-hero__img[data-scene="${i}"]`;
    link.innerHTML = `${UI.esc(t(ds && ds.open ? 'home.stepDoor' : 'home.peekDoor'))}${UI.icon('arrow', 'icon--sm')}`;
  },

  // --- The hundred doors -----------------------------------------------------------------------

  // The wall's light comes from the doors' own clocks: lit in their hour; warm when they open
  // within three hours (the five soonest say when); the rest in their realm's colour.
  _lightDoors() {
    const grid = document.getElementById('atlas-grid');
    if (!grid || !this._state) return;
    const soon = [];
    grid.querySelectorAll('.door.is-found').forEach((li) => {
      const no = Number(li.dataset.no);
      const j = this._doors && this._doors.get(no);
      const s = this._state.get(no);
      if (!j || !s) return;
      li.dataset.open = DoorClock.always(j.entrance) ? 'always' : String(!!s.open);
      const near = !s.open && !s.month && s.minutes != null && s.minutes <= 180;
      li.toggleAttribute('data-soon', near);
      if (near) soon.push([s.minutes, li]);
      const old = li.querySelector('.door__soon');
      if (old) old.remove();
    });
    soon.sort((a, b) => a[0] - b[0]).slice(0, 5).forEach(([m, li]) => {
      const text = m < 60 ? t('home.door.soonM', { n: Math.max(1, m) }) : t('home.door.soonH', { n: Math.round(m / 60) });
      li.querySelector('.door__no').insertAdjacentHTML('afterend', `<span class="door__soon num" aria-hidden="true">${UI.esc(text)}</span>`);
    });
  },

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
    const warmed = new Set();
    grid.addEventListener('pointerover', (e) => {
      const a = doorOf(e.target);
      if (!a || e.pointerType !== 'mouse') return;
      over = a;
      rest(a);
      // start its picture now, so it is ready when the pointer comes to rest
      const no = Number(a.dataset.no);
      const j = this._doors.get(no);
      if (j && !warmed.has(no)) {
        warmed.add(no);
        const warm = document.createElement('div'); // detached, but its picture loads
        warm.innerHTML = UI.picture(j.image_url, { sizes: '(max-width: 960px) 40vw, 320px', width: 720, height: 900 });
        const img = warm.querySelector('img');
        if (img && img.decode) { img.loading = 'eager'; img.decode().catch(() => {}); }
      }
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
        // (the tap's focus has already selected the door, so ask what the sheet is showing)
        if (!this._peek || this._peekNo !== no) {
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
    section.querySelector('#atlas-filters').addEventListener('focusin', (e) => {
      if (e.target.matches('button')) e.target.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    });
    section.querySelector('#atlas-filters').addEventListener('click', (e) => {
      const b = e.target.closest('[data-filter]');
      if (b) this._filterDoors(b.dataset.filter);
    });
    section.querySelector('#atlas-peek-close').addEventListener('click', () => this._closePeek());
    // The sheet follows a finger down and lets go past a short pull or a quick flick.
    const panel = section.querySelector('#atlas-panel');
    let drag = null;
    panel.addEventListener('touchstart', (e) => {
      if (!this._peek || e.touches.length !== 1) return;
      drag = { y: e.touches[0].clientY, t: performance.now(), dy: 0 };
      panel.style.transition = 'none';
    }, { passive: true });
    panel.addEventListener('touchmove', (e) => {
      if (!drag) return;
      drag.dy = Math.max(0, e.touches[0].clientY - drag.y);
      panel.style.transform = `translate3d(0, ${drag.dy}px, 0)`;
    }, { passive: true });
    panel.addEventListener('touchend', () => {
      if (!drag) return;
      const speed = drag.dy / Math.max(1, performance.now() - drag.t);
      panel.style.transition = '';
      panel.style.transform = '';
      if (drag.dy > 64 || speed > 0.6) this._closePeek();
      drag = null;
    });
    section.querySelector('#door-card').addEventListener('click', () => this._closePeek());
    if (this._still) {
      grid.classList.add('is-lit', 'is-near');
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
          entries.forEach((en) => {
            if (en.isIntersecting) document.body.dataset.atlasInView = '';
            else { delete document.body.dataset.atlasInView; this._closePeek(); }
          });
        }, { threshold: [0, 0.15], rootMargin: '0px 0px -10% 0px' });
        io.observe(section);
        this._cleanups.push(() => io.disconnect());
      }
    } else if ('IntersectionObserver' in window) {
      grid.classList.add('will-light');
      // The count climbs when the number itself comes into view, from 0, never from its final value.
      const counter = section.querySelector('.home-atlas__count');
      const count = new IntersectionObserver((entries) => {
        if (entries.some((en) => en.isIntersecting)) { count.disconnect(); this._countUp(); }
      }, { rootMargin: '0px 0px -15% 0px' });
      count.observe(counter);
      this._cleanups.push(() => count.disconnect());
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

  // The wall lights door by door the first time it is seen; the doors open right now light last,
  // with a flare.
  _lightUp(grid) {
    grid.classList.add('is-lit');
    // reached without passing the number (a jump to the doors): count now
    if (!this._counted && !this._countPending) this._countUp();
  },

  _countUp() {
    const out = document.getElementById('atlas-found');
    if (!out) return;
    // seen before the doors arrive: count once they do
    if (!this._doors.size) { this._countPending = true; return; }
    this._counted = true;
    const target = this._doors.size;
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

  // the door's picture on the wall, sharp on dense screens too
  _thumb(j) { return j.image_url.replace(/\.jpg$/, '.120.avif'); },
  _thumbSet(j) { const b = j.image_url.replace(/\.jpg$/, ''); return `image-set(url('${b}.120.avif') 1x, url('${b}.240.avif') 2x)`; },

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
      // the spoken name starts with what the tile shows (number, then name)
      const always = DoorClock.always(e);
      const state = always ? t('home.door.always') : s.open ? t('home.door.open') : s.minutes <= 180 && !s.month ? DoorClock.when(s) : '';
      // the wall names the broader place (the part after a comma); the full one is in the panel
      const near = place ? place.split(', ').pop() : '';
      // the spoken name is the visible words in their order (number, name, place), then the rest
      const label = `${no} ${name}${near ? ` ${near}` : ''}, ${t(`entrance.realm.${e.realm}`)}${place !== near ? `, ${place}` : ''}${state ? `, ${state}` : ''}`;
      return `<li class="door is-found" style="--i:${k};--thumb:${esc(this._thumbSet(j))}" data-realm="${esc(e.realm)}" data-no="${e.no}" data-open="${always ? 'always' : s.open}">
        <a class="door__link" href="#/journey/${encodeURIComponent(j.slug)}" data-slug="${esc(j.slug)}" data-no="${e.no}" data-quiet data-vt-self tabindex="-1" aria-label="${esc(label)}">
          <span class="door__arch" aria-hidden="true"></span><i class="door__seam" aria-hidden="true"></i><span class="door__no num" aria-hidden="true">${no}</span><span class="door__word" aria-hidden="true">${esc(name)}</span>${near ? `<span class="door__place" aria-hidden="true">${esc(near)}</span>` : ''}
        </a></li>`;
    }).join('');
    grid.setAttribute('aria-busy', 'false');
    const n = found.length;
    if (this._countPending) { this._countPending = false; this._countUp(); }
    else if (this._counted || !grid.classList.contains('will-light')) document.getElementById('atlas-found').textContent = n;
    document.getElementById('atlas-found-line').textContent = ` ${t('home.atlas.found', { n })}`;
    const count = (f) => found.filter((j) => f(j.entrance)).length;
    const chip = (key, label, c) => `<button type="button" class="home-atlas__chip" data-filter="${key}" aria-pressed="${key === this._filter}"${key && key !== 'now' ? ` style="--lamp:var(--realm-${key})"` : ''}>${key ? '<i aria-hidden="true"></i>' : ''}<span>${esc(label)}</span><span class="num">${c}</span></button>`;
    document.getElementById('atlas-filters').innerHTML = [
      chip('', t('home.atlas.all'), n),
      chip('now', t('home.atlas.now'), count((e) => DoorClock.lit(e, DoorClock.state(e, now)))),
      ...this.REALMS.map((r) => chip(r, t(`entrance.realm.${r}`), count((e) => e.realm === r))),
    ].join('');
    if (this._filter) this._filterDoors(this._filter, { keep: true });
    const first = (this._pinned && this._doors.get(this._pinned)) || found.find((j) => DoorClock.lit(j.entrance, DoorClock.state(j.entrance, now)))
      || found.find((j) => !DoorClock.always(j.entrance)) || found[0];
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
    // say what the wall now shows, in the world's words (quietly, after a choice)
    const status = document.getElementById('atlas-status');
    if (status && !keep) {
      const n = grid.querySelectorAll('.door.is-found:not(.is-dim)').length;
      status.textContent = !key ? t('home.atlas.statusAll', { n }) : key === 'now' ? t('home.atlas.statusNow', { n }) : t('home.atlas.statusRealm', { n, realm: t(`entrance.realm.${key}`) });
    }
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
    if (this._selected !== no) {
      this._selected = no;
      document.querySelectorAll('#atlas-grid .door.is-selected').forEach((li) => li.classList.remove('is-selected'));
      const li = document.querySelector(`#atlas-grid .door[data-no="${no}"]`);
      if (li) li.classList.add('is-selected');
      const card = document.getElementById('door-card');
      card.href = `#/journey/${encodeURIComponent(j.slug)}`;
      card.dataset.slug = j.slug;
      card.style.setProperty('--lamp', `var(--realm-${j.entrance.realm})`);
      // beside the wall the words change with their picture; in the sheet a tap brings up, they are
      // there at once (the tapped door, never the one before it)
      this._swapImage(j, quiet, peek ? () => {} : () => this._renderDoorBody(j));
    }
    // the sheet remembers which door it shows, so the next tap on that same door walks through
    if (peek) {
      this._renderDoorBody(j);
      this._openPeek(no);
    }
  },

  // Double-buffered: the next cover loads off screen and cross-fades in over a blurred thumbnail,
  // so a grey slab never shows between doors.
  _swapImage(j, instant, withImage = () => {}) {
    const media = document.getElementById('door-media');
    if (!media) { withImage(); return; }
    media.style.backgroundImage = `url('${this._thumb(j)}')`;
    const holder = document.createElement('span');
    holder.className = 'door-card__layer';
    holder.innerHTML = UI.picture(j.image_url, { sizes: '(max-width: 960px) 40vw, 320px', width: 720, height: 900 });
    const img = holder.querySelector('img');
    img.loading = 'eager';
    media.appendChild(holder);
    let told = false;
    const tell = () => { if (!told && this._selected === Number(j.entrance.no)) { told = true; withImage(); } };
    // a slow picture never holds the words for more than a moment
    const late = setTimeout(tell, instant ? 0 : 250);
    const show = () => {
      clearTimeout(late);
      tell();
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
      ${j.content && j.content.role ? `<span class="door-card__role">${esc(t('home.door.role', { role: I18n.lang === 'zh' ? j.content.role : j.content.role.charAt(0).toLowerCase() + j.content.role.slice(1) }))}</span>` : ''}
      ${opens ? `<span class="door-card__opens"><b>${esc(t('detail.facts.opens'))}</b>${esc(opens)}</span>` : ''}
      <span class="door-card__clock${s.open ? ' is-open' : ''}"><span class="num">${esc(t('home.door.local', { time: `${s.hh}:${s.mm}` }))}</span><span>${esc(DoorClock.whenAt(s))}</span></span>
      ${s.needs ? `<span class="door-card__needs">${esc(DoorClock.needs(s))}</span>` : ''}
      <span class="door-card__go">${esc(t(s.open ? 'home.stepDoor' : 'home.peekDoor'))} ${UI.icon('arrow', 'icon--sm')}</span>`;
  },

  _openPeek(no = this._selected) {
    const panel = document.getElementById('atlas-panel');
    if (!panel || !window.matchMedia('(max-width: 960px)').matches) return;
    this._peek = true;
    this._peekNo = no;
    panel.classList.add('is-peek');
  },

  _closePeek() {
    this._peek = false;
    this._peekNo = 0;
    const panel = document.getElementById('atlas-panel');
    if (panel) panel.classList.remove('is-peek');
  },

  // --- Behind a door, and the Night Station --------------------------------------------------------

  /** A few lines from behind a door that is open right now (or the next to open), in its own voice. */
  async _renderBehind(journeys) {
    const band = document.getElementById('home-behind');
    if (!band) return;
    // a door open right now if there is one (its words are what you would hear inside), else one
    // past the five opening next
    const list = this._soonest(journeys).filter(({ j }) => j.content);
    const open = list.filter(({ s }) => s.open);
    const day = Math.floor(Date.now() / 864e5);
    const pick = open.length ? open[day % open.length] : list[5] || list[0];
    if (!pick) return;
    try {
      const { data: j } = await API.getJourney(pick.j.slug);
      const para = j && j.content && j.content.chapters && j.content.chapters[0] && j.content.chapters[0].paragraphs[0];
      if (!para || !band.isConnected) return;
      const [name] = UI.titleParts(j.title);
      const s = (this._state && this._state.get(j.entrance.no)) || DoorClock.state(j.entrance);
      document.getElementById('behind-body').innerHTML = `
        <blockquote class="home-behind__text"><p>${UI.esc(para)}</p></blockquote>
        <a class="home-behind__door" href="#/journey/${encodeURIComponent(j.slug)}" data-slug="${UI.esc(j.slug)}">
          <span class="num">No.${String(j.entrance.no).padStart(3, '0')}</span><b>${UI.esc(name)}</b><span>${UI.esc(DoorClock.when(s))}</span>${UI.icon('arrow', 'icon--sm')}
        </a>`;
      band.hidden = false;
      this._renderClose(this._journeys || []);
    } catch (e) { /* the band stays away */ }
  },

  /** Three tickets hanging at the Night Station, loaded when the band comes near. */
  _watchStation(main) {
    const band = main.querySelector('#home-station');
    const racks = main.querySelector('#home-station-racks');
    if (!band || !racks || typeof Road === 'undefined' || typeof Compose === 'undefined') { if (band) band.hidden = true; return; }
    const load = async () => {
      try {
        const [list, , res] = await Promise.all([Compose.fragments(), Road.vocab(), API.station({ limit: 12 })]);
        if (!racks.isConnected) return;
        const by = Compose.index(list);
        // three tickets from three different platforms where the rack allows, never two from one place
        const pool = ((res && res.data && res.data.items) || []).filter((v) => v.picks && v.picks.place);
        const items = [];
        const platforms = new Set();
        const places = new Set();
        const take = (v) => { items.push(v); platforms.add(v.realm); places.add(v.picks.place); };
        pool.forEach((v) => { if (items.length < 3 && !platforms.has(v.realm) && !places.has(v.picks.place)) take(v); });
        pool.forEach((v) => { if (items.length < 3 && !items.includes(v) && !places.has(v.picks.place)) take(v); });
        if (!items.length) { band.hidden = true; return; }
        racks.innerHTML = items.map((v, i) => `<li style="--i:${i}">${Road.stubHTML(v, by)}</li>`).join('');
        racks.setAttribute('aria-busy', 'false');
        racks.addEventListener('click', (e) => {
          const li = e.target.closest('li');
          if (!li || !e.target.closest('button, a')) return;
          const v = items[[...racks.children].indexOf(li)];
          if (v && e.target.closest('.stub__open')) { e.preventDefault(); Road.open(v, by); }
        });
      } catch (e) { band.hidden = true; }
    };
    if (!('IntersectionObserver' in window)) { load(); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((en) => en.isIntersecting)) { io.disconnect(); load(); }
    }, { rootMargin: '600px 0px' });
    io.observe(band);
    this._cleanups.push(() => io.disconnect());
  },

  // --- Opening next, and the close -------------------------------------------------------------

  _soonest(journeys) {
    const now = new Date();
    const order = (s) => (s.open ? 1e6 : s.month ? 2e6 + s.month : s.minutes);
    return journeys.filter((j) => j.entrance && !DoorClock.always(j.entrance)).map((j) => ({ j, s: DoorClock.state(j.entrance, now) }))
      .sort((a, b) => order(a.s) - order(b.s) || a.j.entrance.no - b.j.entrance.no);
  },

  _renderFeatured(journeys) {
    const grid = document.getElementById('featured-grid');
    if (!grid) return;
    const picks = this._soonest(journeys).slice(0, 5);
    grid.innerHTML = picks.map(({ j, s }, i) => this._featureCard(j, s, i === 0, i)).join('');
    if ('IntersectionObserver' in window && !this._reduce() && !this._still) {
      grid.classList.add('will-reveal');
      const io = new IntersectionObserver((entries) => {
        if (entries.some((en) => en.isIntersecting)) {
          grid.classList.add('is-in');
          io.disconnect();
          // once the cards have unrolled, they drop the mask (it would cut off their focus ring)
          setTimeout(() => grid.classList.add('is-done'), 900 + 70 * grid.children.length + 100);
        }
      }, { threshold: 0.12 });
      io.observe(grid);
      this._cleanups.push(() => io.disconnect());
    }
  },

  _renderClose(journeys) {
    const out = document.getElementById('close-next');
    if (!out) return;
    // the page ends on a door it has not shown yet (the five opening next are above it)
    const shown = new Set([...document.querySelectorAll('#featured-grid [data-slug], #home-behind [data-slug]')].map((el) => el.dataset.slug));
    const next = this._soonest(journeys).find(({ j }) => !shown.has(j.slug)) || this._soonest(journeys)[0];
    if (!next) { out.textContent = ''; return; }
    const { j, s } = next;
    const [name] = UI.titleParts(j.title);
    out.innerHTML = `<a href="#/journey/${encodeURIComponent(j.slug)}" data-slug="${UI.esc(j.slug)}"><span class="num">No.${String(j.entrance.no).padStart(3, '0')}</span> ${UI.esc(t('home.close.next', { title: name, when: DoorClock.when(s) }))} ${UI.icon('arrow', 'icon--sm')}</a>`;
  },

  // --- The opening's exit, and section reveals as the page scrolls --------------------------------

  _setupScroll(main) {
    const hero = main.querySelector('.home-hero');
    // The threshold between the opening and the doors: the story of the marks in three beats, while
    // an arch of light grows; it holds still on screen as the page scrolls through it.
    const th = main.querySelector('#home-threshold');
    if (th && !this._reduce()) {
      const beats = [...th.querySelectorAll('.home-threshold__beat')];
      const stage = th.querySelector('.home-threshold__stage');
      const frame = th.querySelector('.home-threshold__frame');
      const bar = document.getElementById('main-nav');
      const n = beats.length;
      const story = 0.74; // the lines take this much of the way
      const openFrom = 0.76; // and the door opens over the rest
      const at = (i) => (i * story) / n;
      const ease = (x) => Math.min(1, Math.max(0, x));
      // The arch keeps one shape and grows by scale, from its own size to as far as the screen
      // allows (never up to the bar, its marks never off the edge); opening, the same shape grows
      // on until its straight sides pass the screen's edges and its top is above it.
      let geo = null;
      const measure = () => {
        const W = stage.clientWidth;
        const H = stage.clientHeight;
        const w0 = frame.offsetWidth;
        const h0 = frame.offsetHeight;
        const sill = H - frame.offsetTop - h0;
        const gap = Math.min(44, Math.max(14, W * 0.035));
        const navH = bar ? bar.offsetHeight : 64;
        const sMax = Math.max(1, Math.min(1.22, (H - sill - navH - 24 - gap) / h0, (W / 2 - 8) / (w0 / 2 + gap)));
        const sCover = Math.max((W * 1.04) / w0, ((H - sill) * 1.04) / Math.max(1, h0 - w0 / 2));
        geo = { W, H, w0, h0, sill, navH, sMax, sCover };
      };
      // does the opening, at scale S, cover the whole width of the screen at height y?
      const covers = (S, y) => {
        const r = (geo.w0 * S) / 2;
        const yc = geo.H - geo.sill - (geo.h0 - geo.w0 / 2) * S; // the centre of its half-circle
        if (r < geo.W / 2) return false;
        if (y >= yc) return y <= geo.H - geo.sill;
        return Math.sqrt(Math.max(0, r * r - (yc - y) * (yc - y))) >= geo.W / 2;
      };
      let queued = false;
      const update = () => {
        queued = false;
        if (!geo) measure();
        const span = Math.max(1, th.offsetHeight - window.innerHeight);
        const rect = th.getBoundingClientRect();
        const p = ease(-rect.top / span);
        // once the stage starts to leave, the last line goes before it rises to the bar
        const leaving = ease((window.innerHeight - rect.bottom) / (window.innerHeight * 0.3));
        const grow = ease(p / story);
        const sc = 1 + (geo.sMax - 1) * (1 - (1 - grow) * (1 - grow));
        const q = ease((p - openFrom) / (1 - openFrom - 0.02));
        // the gold doorway grows to fill the screen first (by q .7), then its light settles
        const u = ease(q / 0.7);
        const S = sc + (geo.sCover - sc) * u * u;
        // the marks light through the first line, go out when the men lose their way, come back
        // with the last line; then the door opens
        const set = { '--p': p, '--s': sc, '--S': S, '--t': ease((p - 0.01) / (at(1) * 0.85)), '--m': ease((p - at(n - 2)) / (at(1) * 0.7)), '--r': ease((p - at(n - 1)) / (at(1) * 0.4)), '--q': q };
        for (const k in set) th.style.setProperty(k, set[k].toFixed(3));
        // once the light through the door reaches the middle of the bar, the bar is over the page
        const done = q > 0 && rect.top <= 0 && covers(S, geo.navH / 2);
        if (done !== th.hasAttribute('data-media-done')) { th.toggleAttribute('data-media-done', done); Router.updateHeader(); }
        // each line holds, fully there, for most of its stretch, and crosses over only at its edges;
        // the last one stays while the light comes, and goes as the light fills the screen
        beats.forEach((b, i) => {
          const a = at(i);
          const z = at(i + 1);
          const c = (a + z) / 2;
          let o = ease((1 - Math.abs(p - c) / ((z - a) / 2)) * 3);
          if (i === 0 && p < c) o = 1;
          if (i === n - 1 && p > c) o = Math.min(1 - leaving, 1 - ease((q - 0.6) / 0.2));
          b.style.setProperty('--o', o.toFixed(3));
        });
      };
      const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
      const onResize = () => { geo = null; onScroll(); };
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onResize);
      this._cleanups.push(() => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onResize); });
      update();
    }
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
    // While a passage is being read on a touch screen, Lumi steps aside so it never sits on the words.
    if ('IntersectionObserver' in window) {
      const reading = new IntersectionObserver((entries) => {
        entries.forEach((en) => en.target.toggleAttribute('data-in-view', en.isIntersecting));
        if (main.querySelector('[data-reading][data-in-view]')) document.body.dataset.readingInView = '';
        else delete document.body.dataset.readingInView;
      }, { rootMargin: '0px 0px -20% 0px' });
      main.querySelectorAll('[data-reading]').forEach((el) => reading.observe(el));
      this._cleanups.push(() => { reading.disconnect(); delete document.body.dataset.readingInView; });
    }
    if ('IntersectionObserver' in window && !this._reduce() && !this._still) {
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
          <div class="home-invite__text">
            <h2 id="home-invite-title">${esc(t('invite.welcome'))}</h2>
            <ul class="home-invite__doors" id="invite-doors" aria-live="off"></ul>
          </div>
          <div class="home-invite__actions"><a class="btn btn--primary" id="invite-space" href="#/space">${esc(t('invite.back'))}</a></div>
        </div>`;
    }
    const quiet = Guest.get().invite === 'dismissed';
    return `
      <div class="home-invite${quiet ? ' home-invite--quiet' : ''}">
        ${face}
        <div class="home-invite__text">
          <h2 id="home-invite-title">${esc(t('invite.title'))}</h2>
          ${quiet ? '' : `<p>${esc(t('invite.text'))}</p><p class="home-invite__lumi">${esc(t('invite.lumi'))}</p>`}
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
          <p class="home-card__count${s.open ? ' is-open' : ''}" id="fc-when-${i}">
            <span class="home-card__no num"><i aria-hidden="true"></i>No.${String(j.entrance.no).padStart(3, '0')}${s.at && !s.month ? ` · ${esc(t('home.door.local', { time: s.at }))}` : ''}</span>
            <b>${esc(DoorClock.when(s))}</b>
          </p>
          <h3 class="feature-card__title" id="fc-title-${i}">${UI.titleHTML(j.title)}</h3>
          ${j.story_hook ? `<p class="feature-card__hook" id="fc-hook-${i}">${esc(j.story_hook)}</p>` : ''}
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
