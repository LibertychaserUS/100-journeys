/**
 * Space — where a traveller lands once their type is known: the entrances that open for
 * them, the compose game, what they took home from each fork, and (signed in) saved
 * journeys. Without a type it offers both ways to find one, so nobody falls out here.
 */
var Pages = window.Pages || {};

Pages.Space = {
  _seq: 0,
  _onSession: null,

  // Types that lean towards improvising see the compose game first.
  _composeFirst: (code) => /P$/.test(code),

  render(ctx) {
    const seq = ++this._seq;
    if (!this._onSession) {
      this._onSession = () => { if (document.body.dataset.page === 'space') this.render({ query: new URLSearchParams() }); };
      window.addEventListener('session:updated', this._onSession);
    }
    const reveal = ctx && ctx.query && ctx.query.get('reveal') === '1';
    if (reveal) Router.replaceQuery({});
    const code = Guest.mbti();
    if (!code) { this._renderEmpty(); return; }
    API.track('space_enter', '', { code });
    this._renderShell(code, reveal);
    this._load(code, seq);
  },

  destroy() {
    this._seq++;
    if (this._drift) { this._drift.destroy(); this._drift = null; }
    if (this._onSession) window.removeEventListener('session:updated', this._onSession);
    this._onSession = null;
  },

  _found(choices = {}) {
    const g = Guest.get();
    return new Set([...(g.opened || []), ...Object.keys(g.choices || {}), ...Object.keys(choices)]).size;
  },

  _setFound(n) {
    const meter = document.querySelector('.space__meter');
    if (!meter) return;
    meter.setAttribute('aria-label', t('space.foundAria', { n }));
    meter.querySelector('b').style.width = `${Math.min(100, n)}%`;
    meter.nextElementSibling.textContent = t('space.found', { n });
  },

  _renderEmpty() {
    const esc = UI.esc;
    document.getElementById('main-content').innerHTML = `
      <section class="page space">
        <div class="container">
          <div class="state space__empty">
            ${Lumi.svg('', { size: 72 })}
            <h1 class="state__title">${esc(t('space.empty.title'))}</h1>
            <p class="state__text">${esc(t('space.empty.text'))}</p>
            <div class="state__actions">
              <a class="btn btn--primary" href="#/find" data-path="self">${esc(t('invite.self'))}</a>
              <a class="btn btn--ghost" href="#/guide" data-path="pet">${esc(t('invite.pet'))}</a>
            </div>
          </div>
        </div>
      </section>`;
    document.querySelectorAll('.space__empty [data-path]').forEach((a) => a.addEventListener('click', () => API.track('path_pick', '', { path: a.dataset.path, from: 'space' })));
  },

  _renderShell(code, reveal) {
    const esc = UI.esc;
    const found = this._found();
    const formSize = window.matchMedia('(max-width: 760px)').matches ? 88 : 128;
    const formLabel = `${code} · ${MBTI.name(code)}`;
    const guest = !API.isLoggedIn();
    const compose = window.Pages && Pages.Compose ? `
      <section class="space__compose" aria-labelledby="space-compose-title">
        <div>
          <h2 id="space-compose-title">${esc(t('space.compose.title'))}</h2>
          <p>${esc(t('space.compose.text'))}</p>
        </div>
        <a class="btn btn--ghost" href="#/compose" id="space-compose">${esc(t('space.compose.cta'))}</a>
      </section>` : '';
    const picks = `
      <section class="space__section" aria-labelledby="space-picks-title">
        <div class="section-head">
          <div><h2 id="space-picks-title">${esc(t('space.picks.title'))}</h2><p>${esc(t('space.picks.sub'))}</p></div>
          <a class="btn btn--primary" id="space-first" href="#/explore" hidden>${esc(t('space.first'))}</a>
        </div>
        <div class="grid-cards" id="space-picks" aria-busy="true">${UI.skeletonCards(3)}</div>
      </section>`;

    document.getElementById('main-content').innerHTML = `
      <section class="page space">
        <div class="container">
          <header class="space__head">
            <div class="space__form" id="space-form">${reveal ? '' : Lumi.svg(code, { size: formSize, label: formLabel })}</div>
            <p class="eyebrow">${esc(t('space.eyebrow'))}</p>
            <h1><span class="tag-code space__code">${esc(code)}</span>${esc(t('space.title', { name: MBTI.name(code) }))}</h1>
            <div class="space__found">
              <span class="space__meter" role="img" aria-label="${esc(t('space.foundAria', { n: found }))}"><b style="width:${Math.min(100, found)}%"></b></span>
              <span class="num">${esc(t('space.found', { n: found }))}</span>
              <a class="link-arrow" href="#/find" id="space-change">${esc(t('space.change'))}</a>
            </div>
          </header>
          ${this._composeFirst(code) ? compose + picks : picks + compose}
          <section class="space__section" aria-labelledby="space-keeps-title">
            <div class="section-head"><div><h2 id="space-keeps-title">${esc(t('space.keeps.title'))}</h2></div></div>
            <ul class="space__keeps" id="space-keeps"><li class="space__keeps-empty">${esc(t('space.keeps.empty'))}</li></ul>
          </section>
          <div class="space__section space__drift" id="space-drift"></div>
          ${guest ? `
            <aside class="space__guest" aria-labelledby="space-guest-title">
              <div><h2 id="space-guest-title">${esc(t('space.guest.title'))}</h2><p>${esc(t('space.guest.text'))}</p></div>
              <div class="space__guest-actions">
                <a class="btn btn--primary" id="space-register" href="#/register?next=${encodeURIComponent('/space')}">${esc(t('space.guest.register'))}</a>
                <a class="btn btn--quiet" href="#/login?next=${encodeURIComponent('/space')}">${esc(t('space.guest.login'))}</a>
              </div>
            </aside>` : `
            <section class="space__section" aria-labelledby="space-saved-title" id="space-saved-section" hidden>
              <div class="section-head"><div><h2 id="space-saved-title">${esc(t('space.saved.title'))}</h2></div></div>
              <div class="grid-cards" id="space-saved"></div>
            </section>`}
        </div>
      </section>`;

    if (reveal) Lumi.condense(document.getElementById('space-form'), code, { size: formSize, label: formLabel });
    // Three tickets the wind brought: they borrowed from doors written for this type (never the authors').
    Compose.fragments().then((list) => {
      const el = document.getElementById('space-drift');
      if (!el) return;
      this._drift = Rack.mount(el, { slug: `drift-${code}`, by: Compose.index(list), eyebrow: 'drift.eyebrow', kind: 'drift', source: () => API.drifted(code) });
    }).catch(() => {});
    document.querySelector('.space').addEventListener('click', (e) => {
      const card = e.target.closest('#space-picks .journey-card, #space-first, #space-keeps a');
      if (card) API.track('entrance_open', card.dataset.slug || '', { from: 'space' });
      if (e.target.closest('#space-compose')) API.track('compose_start', '', { from: 'space' });
    });
  },

  async _load(code, seq) {
    const esc = UI.esc;
    const picksEl = document.getElementById('space-picks');
    try {
      const res = await API.getJourneys({ mbti: code, limit: 6 });
      if (seq !== this._seq) return;
      const list = res.data || [];
      picksEl.innerHTML = list.map((j, i) => UI.journeyCard(j, { eager: i < 3 })).join('');
      picksEl.removeAttribute('aria-busy');
      const first = document.getElementById('space-first');
      if (list[0] && first) {
        first.href = `#/journey/${encodeURIComponent(list[0].slug)}`;
        first.dataset.slug = list[0].slug;
        first.hidden = false;
      }
    } catch {
      if (seq !== this._seq) return;
      picksEl.removeAttribute('aria-busy');
      picksEl.innerHTML = `<p class="state__text" role="alert">${esc(t('space.error'))}</p>`;
    }

    const choices = API.isLoggedIn() ? await Guest.loadAccountChoices() : (Guest.get().choices || {});
    if (seq !== this._seq) return;
    this._setFound(this._found(choices));
    this._renderKeeps(choices, seq);
    if (API.isLoggedIn()) this._loadSaved(seq);
  },

  async _renderKeeps(choices, seq) {
    const esc = UI.esc;
    const slugs = Object.keys(choices).slice(0, 12);
    if (!slugs.length) return;
    const details = await Promise.all(slugs.map((s) => API.getJourney(s).then((r) => r.data).catch(() => null)));
    if (seq !== this._seq) return;
    const items = details.filter(Boolean).map((j) => {
      const opt = ((j.content && j.content.choice && j.content.choice.options) || []).find((o) => o.key === choices[j.slug]);
      return opt ? `<li><b>${esc(opt.keeps)}</b><a href="#/journey/${encodeURIComponent(j.slug)}" data-slug="${esc(j.slug)}">${esc(j.title)}</a></li>` : '';
    }).join('');
    if (items) document.getElementById('space-keeps').innerHTML = items;
  },

  async _loadSaved(seq) {
    try {
      const res = await API.listSaved();
      if (seq !== this._seq) return;
      const list = res.data || [];
      if (!list.length) return;
      document.getElementById('space-saved').innerHTML = list.map((j) => UI.journeyCard(j)).join('');
      document.getElementById('space-saved-section').hidden = false;
    } catch {}
  },
};
