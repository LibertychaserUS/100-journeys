/**
 * Compose — "画一个自己的入口 / Draw your own entrance".
 *   #/compose        a tray of paper slips in six groups and the lantern-frame ticket they go into;
 *                    the tickets you kept are listed below
 *   #/compose/:code  one kept ticket, read-only, as a share link opens it
 *
 * `Compose` holds what other pages may reuse: the slips per language, the ticket sentence
 * (built from per-language templates in i18n.js, so it needs no network), the kept tickets
 * (the account's, or Guest.composed for guests) and the replay of guest work after sign-in.
 */
var Pages = window.Pages || {};

const Compose = (() => {
  const GROUPS = ['place', 'hour', 'season', 'stay', 'ritual', 'keepsake'];
  const cache = {};

  /** The slips in the UI language, in tray order. Cached per language. */
  function fragments() {
    const lang = I18n.apiLang;
    if (!cache[lang]) {
      cache[lang] = API.composeFragments().then((res) => res.data || []);
      cache[lang].catch(() => { delete cache[lang]; });
    }
    return cache[lang];
  }

  /** { group: { key: fragment } } */
  function index(list) {
    const by = {};
    list.forEach((f) => { (by[f.group] = by[f.group] || {})[f.key] = f; });
    return by;
  }

  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  /** Only known keys survive (a slip may have been retired since the ticket was kept). */
  function clean(picks, by) {
    const out = {};
    GROUPS.forEach((g) => { if (picks && picks[g] && by[g] && by[g][picks[g]]) out[g] = picks[g]; });
    return out;
  }

  // ---------- the ticket sentence ----------
  const MARK = '\u0001';

  /** Picks → { title, story } with each slip as a marker, from the compose.t.* templates. */
  function sentenceParts(picks) {
    const has = (g) => !!picks[g];
    const m = (g) => `${MARK}${g}${MARK}`;
    let where = '';
    if (has('place') && has('season')) where = t('compose.t.where', { place: m('place'), season: m('season') });
    else if (has('place')) where = m('place');
    else if (has('season')) where = t('compose.t.somewhere', { season: m('season') });
    let head = [where, has('hour') ? m('hour') : ''].filter(Boolean).join(t('compose.t.sep'));
    if (has('stay')) head = head ? t('compose.t.stay', { head, stay: m('stay') }) : m('stay');
    let story = '';
    if (has('ritual') && has('keepsake')) story = t('compose.t.ritualKeep', { ritual: m('ritual'), keep: m('keepsake') });
    else if (has('ritual')) story = t('compose.t.ritual', { ritual: m('ritual') });
    else if (has('keepsake')) story = t('compose.t.keep', { keep: m('keepsake') });
    return { title: head ? t('compose.t.end', { s: head }) : '', story };
  }

  /** Marker text → HTML (each slip an .ink span; `fresh` marks the one just placed) or plain text. */
  function fill(text, picks, by, { html = true, fresh = '' } = {}) {
    let first = true;
    const cap = (s) => {
      if (!first || !s) return s;
      first = false;
      return I18n.lang === 'en' ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    };
    return text.split(MARK).map((seg, i) => {
      if (i % 2 === 0) return html ? UI.esc(cap(seg)) : cap(seg);
      const phrase = cap(by[seg][picks[seg]].phrase);
      return html ? `<span class="ink${seg === fresh ? ' is-new' : ''}" data-group="${seg}">${UI.esc(phrase)}</span>` : phrase;
    }).join('');
  }

  function sentence(picks, by, opts = {}) {
    const p = clean(picks, by);
    const parts = sentenceParts(p);
    return { title: fill(parts.title, p, by, opts), story: fill(parts.story, p, by, opts) };
  }

  const stampDate = (iso) => {
    const d = new Date(iso || Date.now());
    return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}·${String(d.getDate()).padStart(2, '0')}`;
  };

  /**
   * The paper ticket. opts: editable (lines are take-back buttons, empty frame is a drop zone),
   * fresh (group just placed, inks in), stamped (kept), headingId, mini (compact card for lists),
   * link: false (no link to the entrance inside the ticket), reveal (the ticket writes itself in,
   * line by line, and the stamp lands last: the share view), cleared (group just taken back).
   */
  function ticketHTML(ticket, by, opts = {}) {
    const esc = UI.esc;
    const picks = clean(ticket.picks, by);
    const s = sentence(picks, by, { fresh: opts.fresh });
    const place = picks.place && by.place[picks.place];
    const realm = place && place.realm;
    const realmKey = realm ? `entrance.realm.${realm}` : '';
    const realmLabel = realm && t(realmKey) !== realmKey ? t(realmKey) : '';
    const tag = opts.mini ? 'h3' : 'h2';
    const img = place && place.image_url
      ? `<div class="cticket__img" style="--cover:url('${esc(place.image_url)}')" aria-hidden="true"></div>`
      : `<div class="cticket__img cticket__img--blank" ${realm ? `data-realm="${esc(realm)}"` : ''} ${opts.editable && !place ? '' : 'aria-hidden="true"'}>${opts.editable && !place ? `<span class="cticket__drop">${esc(t('compose.ticket.drop'))}</span>` : ''}</div>`;
    const line = (g, k) => {
      const f = picks[g] && by[g][picks[g]];
      const label = `<dt>${esc(t(`compose.line.${g}`))}</dt>`;
      if (!f) return `<div class="cline is-empty${g === opts.cleared ? ' is-cleared' : ''}" data-group="${g}" style="--k:${k}">${label}<dd><span class="cline__blank" aria-hidden="true"></span><span class="sr-only">${esc(t('compose.ticket.empty'))}</span></dd></div>`;
      const value = opts.editable
        ? `<button type="button" class="cline__take" data-take="${g}" aria-label="${esc(t('compose.ticket.takeBack', { text: f.text }))}">${esc(f.text)}</button>`
        : esc(f.text);
      return `<div class="cline${g === opts.fresh ? ' is-new' : ''}" data-group="${g}" style="--k:${k}">${label}<dd>${value}</dd></div>`;
    };
    return `
      <div class="cticket${opts.mini ? ' cticket--mini' : ''}${opts.stamped ? ' is-stamped' : ''}${opts.reveal ? ' is-revealing' : ''}" ${realm ? `data-realm="${esc(realm)}"` : ''}>
        ${img}
        ${opts.stamped ? `<div class="cticket__stamp${opts.stampNew ? ' is-new' : ''}" aria-hidden="true"><span>${esc(t('compose.stamp.a'))}</span><span>${esc(t('compose.stamp.b'))}</span><span class="num">${esc(stampDate(ticket.created_at))}</span></div>` : ''}
        <div class="cticket__body">
          <p class="cticket__label">${[opts.mini || opts.stamped ? '' : t('compose.ticket.label'), realmLabel, opts.stamped ? t('compose.ticket.kept', { date: I18n.date(ticket.created_at, false) }) : ''].filter(Boolean).map(esc).join(' · ')}</p>
          <${tag} class="cticket__title" ${opts.headingId ? `id="${opts.headingId}"` : ''}>${s.title || `<span class="cticket__placeholder">${esc(t('compose.ticket.blank'))}</span>`}</${tag}>
          ${s.story ? `<p class="cticket__story">${s.story}</p>` : ''}
          ${opts.mini ? '' : `<dl class="cticket__lines">${GROUPS.map((g, k) => line(g, k)).join('')}</dl>`}
          ${place && place.slug && !opts.mini && opts.link !== false ? `<a class="cticket__link" href="#/journey/${encodeURIComponent(place.slug)}">${esc(t('compose.ticket.entrance'))}${UI.icon('arrow', 'icon--sm')}</a>` : ''}
        </div>
      </div>`;
  }

  /** Plain-text sentence, for share text and labels. */
  function plainTitle(ticket, by) {
    const s = sentence(ticket.picks, by, { html: false });
    return [s.title, s.story].filter(Boolean).join(' ') || t('compose.ticket.blank');
  }

  // ---------- kept tickets ----------
  const pending = () => (Guest.get().composed || []).filter((x) => x && x.id && x.picks);
  const dropGuest = (id) => Guest.update((s) => { s.composed = (s.composed || []).filter((x) => x.id !== id); });
  const saveGuest = (ticket) => Guest.update((s) => {
    const rest = (s.composed || []).filter((x) => x.id !== ticket.id);
    s.composed = [...rest, { id: ticket.id, created_at: ticket.created_at, picks: { ...ticket.picks } }];
  });
  const payload = (ticket) => ({ id: ticket.id, picks: ticket.picks, created_at: ticket.created_at });

  /** Account tickets plus guest tickets not synced yet (local: true), newest first. */
  async function list() {
    const local = pending().map((x) => ({ ...x, local: true }));
    let remote = [];
    if (API.isLoggedIn()) {
      try { remote = (await API.listCompositions()).data || []; } catch (err) { if (err.status !== 401) throw err; }
    }
    const ids = new Set(remote.map((x) => x.id));
    return [...remote, ...local.filter((x) => !ids.has(x.id))]
      .sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
  }

  /** POST, and if the id already belongs to someone else's ticket, keep it under a fresh id. */
  async function post(ticket) {
    try {
      return (await API.keepComposition(payload(ticket))).data;
    } catch (err) {
      if (err.status !== 409) throw err;
      return (await API.keepComposition({ ...payload(ticket), id: newId() })).data;
    }
  }

  /** Keep a ticket: in the account when signed in, otherwise (or when offline) on this device.
   *  The result carries the id the ticket is stored under and, in the account, its share code. */
  async function keep(ticket) {
    if (API.isLoggedIn()) {
      try {
        const saved = await post(ticket);
        dropGuest(ticket.id);
        return saved;
      } catch (err) {
        if (err.status && err.status !== 401 && err.status < 500) throw err;
      }
    }
    saveGuest(ticket);
    return { ...ticket, local: true };
  }

  async function remove(ticket) {
    if (!ticket.local && API.isLoggedIn()) {
      try { await API.deleteComposition(ticket.id); } catch (err) { if (err.status !== 404) throw err; }
    }
    dropGuest(ticket.id);
  }

  /** After sign-in: replay guest tickets to the account (idempotent on id), then drop them locally. */
  let replaying = null;
  function replay() {
    if (replaying) return replaying;
    if (!API.isLoggedIn() || !pending().length) return Promise.resolve(0);
    replaying = (async () => {
      let moved = 0;
      for (const ticket of pending()) {
        try {
          await post(ticket);
          dropGuest(ticket.id);
          moved++;
        } catch (err) {
          if (err.status === 400) dropGuest(ticket.id); // can never be stored (a retired slip)
          else break; // offline or signed out again: try at the next sign-in
        }
      }
      if (moved) window.dispatchEvent(new CustomEvent('compose:synced', { detail: { moved } }));
      return moved;
    })().finally(() => { replaying = null; });
    return replaying;
  }
  window.addEventListener('session:updated', (e) => { if (e.detail) replay(); });

  const shareUrl = (code) => `${window.location.origin}${window.location.pathname}#/compose/${encodeURIComponent(code)}`;

  return { GROUPS, fragments, index, newId, clean, sentence, ticketHTML, plainTitle, list, keep, remove, replay, shareUrl };
})();

Pages.Compose = {
  DRAFT_KEY: 'compose_draft',
  // Motion timings in ms; compose.css holds the matching --m-* custom properties.
  MOTION: { flight: 520, drop: 300, land: 0.8, spring: 'cubic-bezier(.34, 1.56, .64, 1)', inOut: 'cubic-bezier(.6, 0, .25, 1)' },
  _seq: 0,
  _by: null,
  _list: [],
  _state: null,
  _mine: [],
  _drag: null,
  _suppressClick: false,
  _cleanup: [],

  render(ctx) {
    const seq = ++this._seq;
    this._teardown();
    const main = document.getElementById('main-content');
    if (ctx.params.code) {
      this._renderShared(main, ctx.params.code, seq);
      return;
    }
    main.innerHTML = `
      <div class="page compose" aria-busy="true">
        <div class="container">
          <header class="compose__head"><div><h1>${UI.esc(t('compose.title'))}</h1><p>${UI.esc(t('compose.lead'))}</p></div></header>
          <div class="compose__grid"><div class="compose-tray">${[0, 1, 2].map(() => '<div class="line skeleton" style="height:52px;margin-bottom:18px"></div>').join('')}</div><div class="cticket-skeleton skeleton"></div></div>
        </div>
      </div>`;
    Compose.fragments()
      .then((list) => {
        if (seq !== this._seq) return;
        this._list = list;
        this._by = Compose.index(list);
        this._state = this._loadDraft();
        this._renderGame(main);
        this._loadMine(seq);
      })
      .catch((err) => { if (seq === this._seq) this._renderError(main, err, ctx); });
  },

  destroy() {
    this._seq++;
    this._teardown();
  },

  _teardown() {
    this._endDrag();
    this._cleanup.forEach((fn) => fn());
    this._cleanup = [];
  },

  _listen(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this._cleanup.push(() => target.removeEventListener(type, fn, opts));
  },

  // ---------- state ----------
  _fresh() {
    return { id: Compose.newId(), picks: {}, order: [], created_at: '', code: '', kept: false, everKept: false, started: false, account: false };
  },

  _loadDraft() {
    let draft = null;
    try { draft = JSON.parse(localStorage.getItem(this.DRAFT_KEY) || 'null'); } catch {}
    // A ticket kept in an account stays with that account: a signed-out visitor starts blank.
    if (!draft || !draft.id || (draft.account && !API.isLoggedIn())) return this._fresh();
    const picks = Compose.clean(draft.picks, this._by);
    const order = (draft.order || []).filter((g) => picks[g]);
    Compose.GROUPS.forEach((g) => { if (picks[g] && !order.includes(g)) order.push(g); });
    return { ...this._fresh(), ...draft, picks, order };
  },

  _saveDraft() {
    try { localStorage.setItem(this.DRAFT_KEY, JSON.stringify(this._state)); } catch {}
  },

  _count() { return Object.keys(this._state.picks).length; },

  _motion() { return !window.matchMedia('(prefers-reduced-motion: reduce)').matches; },

  // ---------- page ----------
  _renderGame(main) {
    const esc = UI.esc;
    const groups = Compose.GROUPS.map((g, gi) => {
      const slips = this._list.filter((f) => f.group === g);
      const tilt = (i) => [-2, 1.5, -1, 2, -1.5, 1][i % 6];
      const help = g === Compose.GROUPS[0] ? ' aria-describedby="compose-help"' : '';
      return `
        <section class="tray-group" data-group="${g}" aria-labelledby="tray-${g}" style="--i:${gi}">
          <h2 id="tray-${g}">${esc(t(`compose.group.${g}`))} <span>${esc(t(`compose.group.${g}.sub`))}</span></h2>
          <div class="slips" role="toolbar" aria-labelledby="tray-${g}"${help}>
            ${slips.map((f, i) => `<button type="button" class="slip" style="--r:${tilt(i)}deg" id="slip-${g}-${esc(f.key)}" data-group="${g}" data-key="${esc(f.key)}" aria-pressed="false" tabindex="-1"><span class="slip__text">${esc(f.text)}</span>${f.sub ? `<small>${esc(f.sub)}</small>` : ''}</button>`).join('')}
          </div>
        </section>`;
    }).join('');

    main.innerHTML = `
      <div class="page compose${this._motion() ? ' is-entering' : ''}">
        <div class="container">
          <header class="compose__head">
            <div><h1>${esc(t('compose.title'))}</h1><p>${esc(t('compose.lead'))}</p></div>
            <div class="compose__progress" id="compose-progress"></div>
          </header>
          <div class="compose__grid">
            <div class="compose-tray" id="compose-tray" aria-label="${esc(t('compose.trayLabel'))}" role="region">
              <p class="sr-only" id="compose-help">${esc(t('compose.trayHelp'))}</p>
              ${groups}
            </div>
            <aside class="compose__frame" id="compose-frame" aria-label="${esc(t('compose.ticket.aria'))}">
              <div id="compose-ticket"></div>
              <div class="compose__foot" id="compose-foot"></div>
            </aside>
          </div>
          <p class="sr-only" id="compose-status" role="status" aria-live="polite"></p>
          <section class="compose-mine" id="compose-mine" aria-labelledby="compose-mine-title"></section>
        </div>
        <div class="compose-peek" id="compose-peek" hidden>
          <button type="button" class="compose-peek__btn" data-action="peek" id="compose-peek-btn"></button>
        </div>
      </div>`;

    this._syncTray();
    this._renderTicket();
    this._bind(main);
    this._watchFrame();
    const page = main.querySelector('.compose');
    const settled = setTimeout(() => page.classList.remove('is-entering'), 1100);
    this._cleanup.push(() => clearTimeout(settled));
  },

  /** Phones: the ticket sits above the tray, so while it is out of view a slim bar shows how it is going. */
  _watchFrame() {
    const frame = document.getElementById('compose-frame');
    const peek = document.getElementById('compose-peek');
    if (!frame || !peek || !('IntersectionObserver' in window)) return;
    const phone = window.matchMedia('(max-width: 760px)');
    let visible = true;
    const sync = () => {
      const show = phone.matches && !visible;
      peek.hidden = !show;
      if (show) document.body.dataset.bookbar = '';
      else delete document.body.dataset.bookbar;
    };
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    io.observe(frame);
    this._listen(phone, 'change', sync);
    this._cleanup.push(() => { io.disconnect(); delete document.body.dataset.bookbar; });
  },

  _bind(main) {
    const page = main.querySelector('.compose');
    page.addEventListener('click', (e) => this._onClick(e));
    const tray = main.querySelector('#compose-tray');
    tray.addEventListener('keydown', (e) => this._onTrayKey(e));
    tray.addEventListener('focusin', (e) => {
      const slip = e.target.closest('.slip');
      if (slip) this._rove(slip);
    });
    tray.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    tray.addEventListener('contextmenu', (e) => { if (this._drag) e.preventDefault(); });
    this._listen(document, 'keydown', (e) => this._onKey(e));
    this._listen(document, 'touchmove', (e) => { if (this._drag && this._drag.active) e.preventDefault(); }, { passive: false });
    this._listen(window, 'session:updated', (e) => {
      if (!e.detail && this._state.account) this._new({ focus: false });
      this._loadMine(this._seq);
    });
    this._listen(window, 'compose:synced', (e) => {
      this._loadMine(this._seq);
      UI.toast(t('compose.toast.synced', { n: e.detail.moved }));
    });
  },

  _onClick(e) {
    if (this._suppressClick) { e.preventDefault(); return; }
    const slip = e.target.closest('.slip');
    if (slip) { this._toggle(slip.dataset.group, slip.dataset.key); return; }
    const take = e.target.closest('[data-take]');
    if (take) { this._take(take.dataset.take, { focusSlip: true }); return; }
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    switch (btn.dataset.action) {
      case 'keep': this._keep(); break;
      case 'new': this._new(); break;
      case 'shuffle': this._shuffle(); break;
      case 'share': this._share(btn); break;
      case 'open': this._open(id); break;
      case 'share-kept': this._shareKept(id, btn); break;
      case 'tear': this._tear(id, btn); break;
      case 'peek': this._peek(); break;
      default:
    }
  },

  // ---------- placing slips ----------
  _toggle(group, key) {
    if (this._state.picks[group] === key) this._take(group);
    else this._place(group, key);
  },

  _place(group, key, { announce = 'placed', from = null } = {}) {
    const f = this._by[group] && this._by[group][key];
    if (!f) return;
    const s = this._state;
    const slip = document.getElementById(`slip-${group}-${key}`);
    const origin = from || (slip && { rect: slip.getBoundingClientRect(), tilt: parseFloat(slip.style.getPropertyValue('--r')) || 0 });
    if (!s.started && !s.everKept && !this._count()) {
      s.started = true;
      API.track('compose_start', group === 'place' ? f.slug : '');
    }
    s.picks = { ...s.picks, [group]: key };
    s.order = [...s.order.filter((g) => g !== group), group];
    s.kept = false;
    this._saveDraft();
    // Plan against the line as it is now, so --ink-delay is set before the new ink is styled.
    const flight = this._planFlight(slip, origin, group, from ? this.MOTION.drop : this.MOTION.flight);
    this._syncTray({ fresh: group });
    this._renderTicket({ fresh: group });
    if (flight) this._launch(flight);
    this._announce(t(`compose.announce.${announce}`, { group: t(`compose.group.${group}`), text: f.text }));
  },

  /**
   * The signature moment: a paper copy of the slip lifts off the tray, arcs onto its line on the
   * ticket (or onto the phone's progress bar when the ticket is scrolled away) and dissolves as
   * the ink comes up. The ink, the progress bar and the frame wait for the landing via --ink-delay.
   * Transform and opacity only; nothing moves when reduced motion is asked for.
   */
  _planFlight(slip, origin, group, duration) {
    const page = document.querySelector('.compose');
    if (!page) return null;
    page.style.setProperty('--ink-delay', '0ms');
    if (!slip || !origin || !this._motion()) return null;
    const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 64;
    const onScreen = (r) => r.width > 0 && r.bottom > navH && r.top < window.innerHeight;
    const line = document.querySelector(`#compose-ticket .cline[data-group="${group}"] dd`);
    const peek = document.getElementById('compose-peek');
    let target = line && onScreen(line.getBoundingClientRect()) ? line : null;
    if (!target && peek && !peek.hidden) target = peek.querySelector('.compose-peek__title');
    if (!target || !onScreen(origin.rect)) return null;
    const land = Math.round(duration * this.MOTION.land);
    page.style.setProperty('--ink-delay', `${land}ms`);
    return { slip, origin, target: target.getBoundingClientRect(), toLine: target === line, duration, land };
  },

  _launch({ slip, origin, target: b, toLine, duration, land }) {
    const a = origin.rect;
    const scale = Math.max(0.5, Math.min(1, (Math.max(b.height, 18) * 1.35) / a.height));
    const dx = b.left - a.left;
    const dy = b.top - a.top + (b.height - a.height * scale) / 2;
    const lift = Math.min(72, 24 + Math.hypot(dx, dy) * 0.12);
    const ghost = slip.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.className = 'slip slip--flight';
    ghost.removeAttribute('aria-pressed'); // the copy is paper, not the outline left in the tray
    ghost.setAttribute('aria-hidden', 'true');
    Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
    document.body.appendChild(ghost);
    const r = origin.tilt;
    ghost.animate([
      { transform: `translate(0, 0) rotate(${r}deg) scale(1)`, opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) rotate(${-r * 1.4}deg) scale(1.06)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) rotate(0deg) scale(${scale})`, opacity: 1, offset: 0.8 },
      { transform: `translate(${dx}px, ${dy}px) rotate(0deg) scale(${scale})`, opacity: 0 },
    ], { duration, easing: this.MOTION.inOut }).finished.catch(() => {}).finally(() => ghost.remove());
    this._cleanup.push(() => ghost.remove());
    if (toLine) {
      document.getElementById('compose-frame')?.animate(
        [{ transform: 'none' }, { transform: 'translateY(2px) scale(.996)' }, { transform: 'none' }],
        { duration: 340, delay: land, easing: this.MOTION.spring },
      );
    }
  },

  _take(group, { focusSlip = false } = {}) {
    const s = this._state;
    const key = s.picks[group];
    if (!key) return;
    const f = this._by[group][key];
    const picks = { ...s.picks };
    delete picks[group];
    s.picks = picks;
    s.order = s.order.filter((g) => g !== group);
    s.kept = false;
    this._saveDraft();
    this._syncTray();
    document.querySelector('.compose')?.style.setProperty('--ink-delay', '0ms');
    this._renderTicket({ cleared: group });
    this._announce(t('compose.announce.removed', { group: t(`compose.group.${group}`), text: f.text }));
    const slip = document.getElementById(`slip-${group}-${key}`);
    if (slip && this._motion()) {
      const r = parseFloat(slip.style.getPropertyValue('--r')) || 0;
      slip.animate([
        { transform: `translateY(-10px) rotate(${r * 2}deg) scale(.94)`, opacity: 0 },
        { transform: `rotate(${r}deg)`, opacity: 1 },
      ], { duration: 380, easing: this.MOTION.spring });
    }
    if (focusSlip) slip?.focus();
  },

  _takeLast(opts) {
    const last = this._state.order[this._state.order.length - 1];
    if (last) this._take(last, opts);
    else this._announce(t('compose.announce.nothing'));
  },

  /** For the hesitant: a random slip for the next blank line (or a swap when the ticket is full),
   *  leaning towards slips of the same realm as the chosen place. */
  _shuffle() {
    const s = this._state;
    if (this._motion()) document.querySelector('#compose-shuffle .icon')?.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-360deg)' }], { duration: 520, easing: this.MOTION.inOut });
    const blanks = Compose.GROUPS.filter((g) => !s.picks[g]);
    const group = blanks.length ? blanks[0] : Compose.GROUPS[Math.floor(Math.random() * Compose.GROUPS.length)];
    const options = this._list.filter((f) => f.group === group && f.key !== s.picks[group]);
    if (!options.length) return;
    const place = s.picks.place && this._by.place[s.picks.place];
    const kin = place && place.realm ? options.filter((f) => f.realm === place.realm) : [];
    const pool = kin.length && Math.random() < 0.6 ? kin : options;
    const f = pool[Math.floor(Math.random() * pool.length)];
    this._place(group, f.key, { announce: 'shuffled' });
  },

  _new({ focus = true } = {}) {
    this._state = this._fresh();
    this._saveDraft();
    this._syncTray();
    this._renderTicket();
    if (focus) document.querySelector('#compose-tray .slip[tabindex="0"]')?.focus();
  },

  _open(id) {
    const ticket = this._mine.find((x) => x.id === id);
    if (!ticket) return;
    const picks = Compose.clean(ticket.picks, this._by);
    this._state = { ...this._fresh(), id: ticket.id, picks, order: Compose.GROUPS.filter((g) => picks[g]), created_at: ticket.created_at, code: ticket.code || '', kept: true, everKept: true, started: true, account: !ticket.local };
    this._saveDraft();
    this._syncTray();
    this._renderTicket();
    const frame = document.getElementById('compose-frame');
    frame.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    document.getElementById('compose-new')?.focus({ preventScroll: true });
  },

  // ---------- keeping and sharing ----------
  async _keep(focus = 'compose-new') {
    const s = this._state;
    if (!this._count()) return;
    const first = !s.everKept;
    if (!s.created_at) s.created_at = new Date().toISOString();
    const btn = document.getElementById('compose-keep');
    if (btn) btn.setAttribute('aria-busy', 'true');
    try {
      const saved = await Compose.keep({ id: s.id, picks: s.picks, created_at: s.created_at });
      if (saved.created_at) s.created_at = saved.created_at;
      s.id = saved.id || s.id;
      s.code = saved.code || '';
      s.account = !saved.local;
      s.kept = true;
      s.everKept = true;
      this._saveDraft();
      this._renderTicket({ stampNew: true, focus });
      if (this._motion()) {
        document.getElementById('compose-frame')?.animate(
          [{ transform: 'none' }, { transform: 'scale(.985)' }, { transform: 'none' }],
          { duration: 360, delay: 230, easing: this.MOTION.spring },
        );
      }
      if (first) API.track('compose_complete', s.picks.place ? this._by.place[s.picks.place].slug : '');
      if (saved.local) UI.toast(t('compose.toast.keptLocal'), { href: '#/register?next=%2Fcompose', label: t('nav.register') });
      else UI.toast(t('compose.toast.kept'));
      // The list below re-renders once the seal has landed, so it never competes with the stamp for a frame.
      const seq = this._seq;
      setTimeout(() => this._loadMine(seq, s.id), this._motion() ? 320 : 0);
      return saved;
    } catch (err) {
      if (btn) btn.removeAttribute('aria-busy');
      UI.toast(I18n.error(err));
      return null;
    }
  },

  async _share(btn) {
    if (!API.isLoggedIn()) {
      UI.toast(t('compose.toast.shareSignIn'), { href: '#/login?next=%2Fcompose', label: t('nav.login') });
      return;
    }
    // Keeping is idempotent, so sharing simply keeps (or re-keeps) the ticket first to get its code.
    const saved = this._state.kept && this._state.code ? { code: this._state.code } : await this._keep('compose-share');
    if (!saved || !saved.code) return;
    this._copy(Compose.shareUrl(saved.code), Compose.plainTitle(this._state, this._by), document.getElementById('compose-share') || btn);
  },

  async _shareKept(id, btn) {
    const ticket = this._mine.find((x) => x.id === id);
    if (ticket && ticket.code) this._copy(Compose.shareUrl(ticket.code), Compose.plainTitle(ticket, this._by), btn);
  },

  async _copy(url, text, btn) {
    if (btn) {
      btn.dataset.copied = 'true';
      setTimeout(() => { delete btn.dataset.copied; }, 1500);
    }
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title: t('compose.title'), text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      UI.toast(t('compose.toast.copied'));
    } catch {
      UI.toast(t('compose.toast.copyFailed', { url }));
    }
  },

  async _tear(id, btn) {
    if (btn.dataset.confirm !== 'true') {
      btn.dataset.confirm = 'true';
      btn.textContent = t('compose.mine.tearConfirm');
      clearTimeout(btn._t);
      btn._t = setTimeout(() => { if (btn.isConnected) { delete btn.dataset.confirm; btn.textContent = t('compose.mine.tear'); } }, 4000);
      return;
    }
    const ticket = this._mine.find((x) => x.id === id);
    if (!ticket) return;
    try {
      await Compose.remove(ticket);
      if (this._state.id === id) {
        this._state = this._fresh();
        this._saveDraft();
        this._syncTray();
        this._renderTicket();
      }
      UI.toast(t('compose.toast.torn'));
      await this._loadMine(this._seq);
      document.getElementById('compose-mine-title')?.focus();
    } catch (err) {
      UI.toast(I18n.error(err));
    }
  },

  // ---------- rendering ----------
  _syncTray({ fresh = '' } = {}) {
    const picks = this._state.picks;
    document.querySelectorAll('#compose-tray .slips').forEach((row) => {
      const slips = [...row.querySelectorAll('.slip')];
      const group = slips[0] && slips[0].dataset.group;
      let current = slips.find((b) => b.tabIndex === 0);
      // Touch only what changed: every slip carries a drop-shadow filter, so restyling all of them costs a frame.
      slips.forEach((b) => {
        const on = String(picks[group] === b.dataset.key);
        if (b.getAttribute('aria-pressed') !== on) b.setAttribute('aria-pressed', on);
      });
      if (!current) current = slips.find((b) => b.dataset.key === picks[group]) || slips[0];
      if (current) this._rove(current);
    });
    const n = this._count();
    const total = Compose.GROUPS.length;
    const progress = document.getElementById('compose-progress');
    if (progress) {
      progress.innerHTML = `<span class="compose__bars" aria-hidden="true">${Compose.GROUPS.map((g) => `<b class="${picks[g] ? 'on' : ''}${g === fresh ? ' is-new' : ''}"></b>`).join('')}</span><span class="num">${UI.esc(t('compose.progress', { n, total }))}</span>`;
    }
  },

  _rove(slip) {
    slip.closest('.slips').querySelectorAll('.slip').forEach((b) => {
      const want = b === slip ? 0 : -1;
      if (b.tabIndex !== want) b.tabIndex = want;
    });
  },

  _renderTicket({ fresh = '', cleared = '', stampNew = false, focus = '' } = {}) {
    const box = document.getElementById('compose-ticket');
    const foot = document.getElementById('compose-foot');
    if (!box || !foot) return;
    const esc = UI.esc;
    const s = this._state;
    const n = this._count();
    const total = Compose.GROUPS.length;
    const active = document.activeElement;
    const keepFocus = focus || (active && foot.contains(active) ? active.id : '');

    box.innerHTML = Compose.ticketHTML(s, this._by, { editable: true, fresh, cleared, stamped: s.kept, stampNew, headingId: 'compose-ticket-title' });
    let hint;
    if (s.kept) hint = t('compose.hint.kept');
    else if (s.everKept) hint = t('compose.hint.dirty');
    else if (!n) hint = t('compose.hint.empty');
    else if (n < total) hint = t('compose.hint.some', { n: total - n });
    else hint = t('compose.hint.full');
    const primary = s.kept
      ? `<button class="btn btn--primary" type="button" id="compose-new" data-action="new">${esc(t('compose.new'))}</button>`
      : `<button class="btn btn--primary" type="button" id="compose-keep" data-action="keep" ${n ? '' : 'disabled'}>${esc(t(s.everKept ? 'compose.keepAgain' : 'compose.keep'))}</button>`;
    foot.innerHTML = `
      <p class="compose__hint" id="compose-hint">${esc(hint)}</p>
      <div class="compose__actions">
        ${primary}
        <button class="icon-btn icon-btn--square" type="button" id="compose-share" data-action="share" aria-label="${esc(t('compose.share'))}" ${n ? '' : 'disabled'}>${UI.icon('share')}</button>
        <button class="icon-btn icon-btn--square" type="button" id="compose-shuffle" data-action="shuffle" aria-label="${esc(t('compose.shuffle'))}" title="${esc(t('compose.shuffle'))}">${UI.icon('refresh')}</button>
      </div>`;
    const peek = document.getElementById('compose-peek-btn');
    if (peek) {
      const title = n ? Compose.plainTitle(s, this._by) : t('compose.ticket.blank');
      peek.innerHTML = `<span class="compose-peek__title">${esc(title)}</span><span class="compose-peek__n num${fresh ? ' is-bump' : ''}">${n}/${total}</span><span class="compose-peek__go">${esc(t('compose.peek'))}${UI.icon('arrow', 'icon--sm')}</span>`;
      peek.setAttribute('aria-label', t('compose.peekAria', { title, n, total }));
    }
    if (keepFocus) {
      const target = document.getElementById(keepFocus) || document.getElementById(s.kept ? 'compose-new' : 'compose-keep');
      if (target && !target.disabled) target.focus({ preventScroll: true });
    }
  },

  _peek() {
    const frame = document.getElementById('compose-frame');
    if (!frame) return;
    frame.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    (document.getElementById('compose-keep') || document.getElementById('compose-new'))?.focus({ preventScroll: true });
  },

  _announce(text) {
    const status = document.getElementById('compose-status');
    if (status) status.textContent = text;
  },

  async _loadMine(seq, freshId = '') {
    let list;
    try {
      list = await Compose.list();
    } catch (err) {
      list = null;
    }
    if (seq !== this._seq) return;
    const box = document.getElementById('compose-mine');
    if (!box) return;
    const esc = UI.esc;
    if (!list) {
      box.innerHTML = `<h2 id="compose-mine-title" tabindex="-1">${esc(t('compose.mine.title'))}</h2><p class="compose-mine__note">${esc(t('err.network'))}</p>`;
      return;
    }
    this._mine = list;
    const local = list.some((x) => x.local);
    box.innerHTML = `
      <div class="compose-mine__head">
        <h2 id="compose-mine-title" tabindex="-1">${esc(t('compose.mine.title'))}${list.length ? ` <span class="num">${esc(t('compose.mine.count', { n: list.length }))}</span>` : ''}</h2>
        ${local ? `<p class="compose-mine__note">${esc(t('compose.mine.local'))} <a class="link" href="#/register?next=%2Fcompose">${esc(t('nav.register'))}</a> · <a class="link" href="#/login?next=%2Fcompose">${esc(t('nav.login'))}</a></p>` : ''}
      </div>
      ${list.length ? `<ul class="compose-mine__list">${list.map((x, i) => `
        <li class="kept${x.local ? ' is-local' : ''}${x.id === freshId ? ' is-new' : ''}" data-id="${esc(x.id)}">
          ${Compose.ticketHTML(x, this._by, { mini: true, stamped: true, headingId: `kept-${i}` })}
          <div class="kept__actions">
            ${x.local ? `<span class="kept__tag">${esc(t('compose.mine.localTag'))}</span>` : ''}
            <button class="btn btn--ghost btn--sm" type="button" data-action="open" data-id="${esc(x.id)}" aria-describedby="kept-${i}">${esc(t('compose.mine.open'))}</button>
            ${x.code ? `<button class="icon-btn" type="button" data-action="share-kept" data-id="${esc(x.id)}" aria-label="${esc(t('compose.share'))}" aria-describedby="kept-${i}">${UI.icon('share')}</button>` : ''}
            <button class="btn btn--quiet btn--sm kept__tear" type="button" data-action="tear" data-id="${esc(x.id)}" aria-describedby="kept-${i}">${esc(t('compose.mine.tear'))}</button>
          </div>
        </li>`).join('')}</ul>` : `<p class="compose-mine__empty">${esc(t('compose.mine.empty'))}</p>`}`;
  },

  // ---------- keyboard ----------
  _onTrayKey(e) {
    const slip = e.target.closest('.slip');
    if (!slip) return;
    const slips = [...slip.closest('.slips').querySelectorAll('.slip')];
    const i = slips.indexOf(slip);
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = slips[(i + 1) % slips.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = slips[(i - 1 + slips.length) % slips.length];
    else if (e.key === 'Home') next = slips[0];
    else if (e.key === 'End') next = slips[slips.length - 1];
    if (!next) return;
    e.preventDefault();
    this._rove(next);
    next.focus();
    next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  },

  _onKey(e) {
    if (e.key !== 'Backspace' || e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
    const el = e.target;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    if (document.querySelector('.scrim') || document.querySelector('#ai-pet-chat:not([hidden])')) return;
    e.preventDefault();
    // A take-back button disappears with its line; send focus back to the slip in the tray.
    this._takeLast({ focusSlip: !!(el && el.closest && el.closest('#compose-ticket')) });
  },

  // ---------- dragging (mouse and pen at once; touch after a short press so scrolling still works) ----------
  _onPointerDown(e) {
    const slip = e.target.closest('.slip');
    if (!slip || e.button !== 0) return;
    this._endDrag();
    const d = { slip, id: e.pointerId, type: e.pointerType, x: e.clientX, y: e.clientY, active: false, timer: 0, ghost: null };
    this._drag = d;
    const move = (ev) => this._onPointerMove(ev);
    const up = (ev) => this._onPointerUp(ev);
    const cancel = (ev) => { if (ev.pointerId === d.id) this._endDrag(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    d.release = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
    if (e.pointerType === 'touch') d.timer = setTimeout(() => this._startDrag(d.x, d.y), 320);
  },

  _onPointerMove(e) {
    const d = this._drag;
    if (!d || e.pointerId !== d.id) return;
    if (!d.active) {
      const dist = Math.hypot(e.clientX - d.x, e.clientY - d.y);
      if (d.type === 'touch') { if (dist > 10) this._endDrag(); return; } // that was a scroll
      if (dist < 6) return;
      this._startDrag(e.clientX, e.clientY);
    }
    d.x = e.clientX;
    d.y = e.clientY;
    d.ghost.style.transform = `translate(${d.x - d.dx}px, ${d.y - d.dy}px) rotate(-3deg)`;
    document.getElementById('compose-frame')?.classList.toggle('is-over', this._overFrame(d.x, d.y));
  },

  _onPointerUp(e) {
    const d = this._drag;
    if (!d || e.pointerId !== d.id) return;
    if (d.active) {
      const over = this._overFrame(e.clientX, e.clientY);
      this._suppressClick = true;
      setTimeout(() => { this._suppressClick = false; }, 0);
      const ghost = d.ghost;
      d.ghost = null;
      const rect = ghost.getBoundingClientRect();
      this._endDrag();
      if (over) {
        ghost.remove();
        this._place(d.slip.dataset.group, d.slip.dataset.key, { from: { rect, tilt: -3 } });
      } else if (this._motion() && d.slip.isConnected) {
        // Dropped outside the frame: the slip springs back to its pile.
        const home = d.slip.getBoundingClientRect();
        const r = parseFloat(d.slip.style.getPropertyValue('--r')) || 0;
        ghost.animate([
          { transform: ghost.style.transform },
          { transform: `translate(${home.left}px, ${home.top}px) rotate(${r}deg)` },
        ], { duration: 280, easing: this.MOTION.spring, fill: 'forwards' }).finished.catch(() => {}).finally(() => ghost.remove());
      } else {
        ghost.remove();
      }
      return;
    }
    this._endDrag();
  },

  _startDrag(x, y) {
    const d = this._drag;
    if (!d || d.active || !d.slip.isConnected) return;
    d.active = true;
    const r = d.slip.getBoundingClientRect();
    d.dx = x - r.left;
    d.dy = y - r.top;
    const ghost = d.slip.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.className = 'slip slip--ghost';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.width = `${r.width}px`;
    ghost.style.transform = `translate(${r.left}px, ${r.top}px) rotate(-3deg)`;
    document.body.appendChild(ghost);
    d.ghost = ghost;
    d.slip.classList.add('is-lifted');
    document.body.classList.add('is-dragging-slip');
    document.getElementById('compose-frame')?.classList.add('is-target');
  },

  _endDrag() {
    const d = this._drag;
    if (!d) return;
    clearTimeout(d.timer);
    if (d.release) d.release();
    if (d.ghost) d.ghost.remove();
    d.slip.classList.remove('is-lifted');
    document.body.classList.remove('is-dragging-slip');
    const frame = document.getElementById('compose-frame');
    if (frame) frame.classList.remove('is-target', 'is-over');
    this._drag = null;
  },

  _overFrame(x, y) {
    const frame = document.getElementById('compose-frame');
    if (!frame) return false;
    const r = frame.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  },

  // ---------- states ----------
  _renderError(main, err) {
    main.innerHTML = `
      <section class="page"><div class="container"><div class="state" role="alert">
        <h1 class="state__title">${UI.esc(t('compose.error.title'))}</h1>
        <p class="state__text">${UI.esc(I18n.error(err))}</p>
        <div class="state__actions"><button class="btn btn--primary" type="button" id="compose-retry">${UI.icon('refresh')}${UI.esc(t('common.retry'))}</button></div>
      </div></div></section>`;
    main.querySelector('#compose-retry').addEventListener('click', () => this.render({ params: {}, query: new URLSearchParams() }));
  },

  /** #/compose/:code — someone's kept ticket, read-only. */
  _renderShared(main, code, seq) {
    const esc = UI.esc;
    main.innerHTML = `<div class="page compose compose--shared" aria-busy="true"><div class="container compose-shared"><div class="cticket-skeleton skeleton"></div></div></div>`;
    Promise.all([API.getComposition(code), Compose.fragments()])
      .then(([res, list]) => {
        if (seq !== this._seq) return;
        const by = Compose.index(list);
        const ticket = res.data;
        const place = ticket.picks && ticket.picks.place && by.place && by.place[ticket.picks.place];
        main.innerHTML = `
          <div class="page compose compose--shared">
            <div class="container compose-shared">
              <header class="compose-shared__head">
                <p class="compose-shared__eyebrow">${esc(t('compose.shared.eyebrow'))}</p>
                <h1>${esc(t('compose.shared.title'))}</h1>
                <p>${esc(t('compose.shared.lead'))}</p>
              </header>
              <article class="compose-shared__ticket" aria-labelledby="shared-ticket-title">
                ${Compose.ticketHTML(ticket, by, { stamped: true, link: false, reveal: true, headingId: 'shared-ticket-title' })}
              </article>
              <div class="compose-shared__actions">
                <a class="btn btn--primary" href="#/compose">${esc(t('compose.shared.cta'))}</a>
                ${place && place.slug ? `<a class="btn btn--ghost" href="#/journey/${encodeURIComponent(place.slug)}">${esc(t('compose.ticket.entrance'))}</a>` : ''}
              </div>
            </div>
          </div>`;
      })
      .catch((err) => {
        if (seq !== this._seq) return;
        const missing = err.status === 404;
        main.innerHTML = `
          <section class="page"><div class="container"><div class="state" ${missing ? '' : 'role="alert"'}>
            <h1 class="state__title">${esc(t(missing ? 'compose.notFound.title' : 'compose.error.title'))}</h1>
            <p class="state__text">${esc(missing ? t('compose.notFound.text') : I18n.error(err))}</p>
            <div class="state__actions"><a class="btn btn--primary" href="#/compose">${esc(t('compose.shared.cta'))}</a></div>
          </div></div></section>`;
      });
  },
};
