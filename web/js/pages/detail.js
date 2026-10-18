/**
 * Detail — the journey as a scroll of scenes: a full-bleed opening, who you are here, one scene
 * per chapter, the fork, the ending, then the practical part and the "travel script ticket".
 * Each journey brings its own art direction (j.scene: lighting arc, texture, signature motif,
 * per-chapter beats and images), played by web/js/scenes.js. Without authored content the
 * older story is staged the same way.
 */
var Pages = window.Pages || {};

Pages.Detail = {
  _journey: null,
  _saved: false,
  _seq: 0,
  _onSession: null,

  render(ctx) {
    const seq = ++this._seq;
    if (!this._onSession) {
      this._onSession = () => this._refreshBalance();
      window.addEventListener('session:updated', this._onSession);
    }
    this._journey = null;
    const main = document.getElementById('main-content');
    document.body.dataset.mediaHeader = '';
    main.innerHTML = `
      <article class="detail scenes" aria-busy="true">
        <header class="scene scene--hero detail-hero detail-hero--loading"><div class="container scene__inner">
          <div class="line skeleton" style="height:14px;width:30%"></div><div class="line skeleton" style="height:64px;width:70%;margin-top:20px"></div><div class="line skeleton" style="height:20px;width:45%;margin-top:16px"></div>
        </div></header>
      </article>`;

    return API.getJourney(ctx.params.slug)
      .then((res) => {
        if (seq !== this._seq) return;
        this._journey = res.data;
        UI.setMeta({ title: res.data.title, description: res.data.story_hook });
        this._renderPage(res.data);
        if (res.data.content) {
          RoadEnd.mount(res.data);
          Guest.markOpened(res.data.slug);
          if (API.isLoggedIn()) this._syncChoice(res.data, seq);
        }
        this._loadSaved(res.data.slug, seq);
        const orderId = ctx.query.get('order');
        if (orderId) {
          Router.replaceQuery({});
          Checkout.resume(orderId, res.data, { onPaid: () => this._refreshBalance() });
        }
      })
      .catch((err) => {
        if (seq !== this._seq) return;
        if (err.status === 404) this._renderNotFound(main);
        else this._renderError(main, err, ctx);
      });
  },

  destroy() {
    this._seq++;
    RoadEnd.destroy();
    if (this._onSession) window.removeEventListener('session:updated', this._onSession);
    this._onSession = null;
    Scenes.destroy();
    if (this._barObserver) this._barObserver.disconnect();
    this._barObserver = null;
  },

  _sentences(text) {
    const parts = String(text || '').match(/[^。！？.!?]+[。！？.!?]+["”’]?\s*/g) || [];
    const joined = parts.join('');
    const rest = String(text || '').slice(joined.length).trim();
    return rest ? [...parts, rest] : parts;
  },

  _role(j) {
    const key = `detail.role.${j.fantasy_type}`;
    const label = t(key);
    return label === key ? t('detail.role.visual') : label;
  },

  _gear(j) {
    const a = j.adventure_index || 5;
    const r = j.risk_level || 3;
    if (a > 7 && r >= 4) return t('detail.gear.pro');
    if (a > 6) return t('detail.gear.trek');
    if (r >= 4) return t('detail.gear.safety');
    return t('detail.gear.light');
  },

  _riskText(r) {
    if (r <= 2) return t('detail.risk.low');
    if (r <= 3) return t('detail.risk.mid');
    return t('detail.risk.high');
  },

  // Each scene shows its own image. The cover appears once, in the opening; a scene whose image
  // doesn't exist yet gets a plate in the journey's palette instead of the cover again.
  _img(j, slot, i = 0) {
    const imgs = (j.scene && j.scene.images) || {};
    if (slot === 'scene') return imgs.scenes && imgs.scenes[i] ? imgs.scenes[i] : '';
    return imgs[slot] || (slot === 'hero' ? j.image_url : '');
  },

  // The arc's tone at a point of the page (0 = opening, 1 = ending), for plates.
  _tone(j, at) {
    const arc = (j.scene && j.scene.arc) || [];
    if (!arc.length) return null;
    return arc[Math.min(arc.length - 1, Math.max(0, Math.round(at * (arc.length - 1))))];
  },

  _media(j, slot, i, cls = '', at = 0.5) {
    const src = this._img(j, slot, i);
    if (!src) {
      const kind = slot === 'scene' ? (cls.includes('bleed') ? 'field' : 'horizon') : slot === 'fork' ? 'lamp' : 'stub';
      const tone = this._tone(j, at);
      const style = tone ? ` style="--ph:${Number(tone.h) || 0};--ps:${Number(tone.s) || 0}"` : '';
      const no = kind === 'stub' && j.entrance && j.entrance.no ? `<span class="plate__no num">No.${String(j.entrance.no).padStart(3, '0')}</span><span class="plate__stamp"></span>` : '';
      return `<div class="scene__media scene__plate ${cls}" data-plate="${kind}"${style} aria-hidden="true"><span class="plate__light"></span>${no}</div>`;
    }
    const sizes = { hero: '100vw', ending: '220px', fork: '(max-width: 960px) 100vw, 40vw' }[slot] || (cls.includes('bleed') ? '100vw' : '(max-width: 960px) 100vw, 45vw');
    return `<div class="scene__media ${cls}">${UI.picture(src, { sizes, eager: slot === 'hero' })}</div>`;
  },

  _paras(list) { return (list || []).map((p) => `<p data-reveal>${UI.esc(p)}</p>`).join(''); },

  /** One chapter as a scene; layouts rotate (split, full bleed, art word) so each feels its own. */
  _chapterScene(j, ch, i, total) {
    const esc = UI.esc;
    const beats = (j.scene && j.scene.beats) || [];
    const beat = beats[i] || '';
    const layout = ['split', 'bleed', 'word'][i % 3];
    const at = (i + 1) / (total + 2); // where this chapter sits on the lighting arc
    const n = `${String(i + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
    const head = `<p class="scene__num num" data-reveal>${esc(n)}</p><h2 id="ch-${i + 1}" class="scene__title" data-reveal>${esc(ch.title)}</h2>`;
    const attrs = `class="scene scene--chapter scene--${layout} chapter" data-scene="ch-${i + 1}" ${beat ? `data-beat="${esc(beat)}"` : ''} ${beat === 'dark' ? 'data-dark' : ''} aria-labelledby="ch-${i + 1}"`;
    if (layout === 'bleed') {
      return `
        <section ${attrs}>
          ${this._media(j, 'scene', i, 'scene__media--bleed', at)}
          <div class="scene__scrim" aria-hidden="true"></div>
          <div class="container scene__inner scene__inner--low on-media">${head}<div class="scene__prose">${this._paras(ch.paragraphs)}</div></div>
        </section>`;
    }
    if (layout === 'word') {
      return `
        <section ${attrs}>
          <div class="container scene__grid scene__grid--word">
            ${this._img(j, 'scene', i) ? `<div class="scene__artcol"><p class="scene__art" aria-hidden="true" data-reveal>${esc(ch.title)}</p><figure class="scene__frame scene__frame--inset" data-reveal>${this._media(j, 'scene', i)}</figure></div>` : `<p class="scene__art" aria-hidden="true" data-reveal>${esc(ch.title)}</p>`}
            <div class="scene__text">${head}<div class="scene__prose">${this._paras(ch.paragraphs)}</div></div>
          </div>
        </section>`;
    }
    return `
      <section ${attrs}>
        <div class="container scene__grid">
          <figure class="scene__frame" data-reveal>${this._media(j, 'scene', i, '', at)}</figure>
          <div class="scene__text">${head}<div class="scene__prose">${this._paras(ch.paragraphs)}</div></div>
        </div>
      </section>`;
  },

  /** Authored entrances as scenes: who you are, each chapter, the fork, the ending. */
  _authoredScenes(j) {
    const esc = UI.esc;
    const c = j.content;
    const chapters = c.chapters || [];
    const pick = this._choiceFor(j);
    return `
      <section class="scene scene--prologue chapter chapter--prologue" data-scene="prologue" aria-labelledby="ch-role">
        <div class="container scene__inner scene__inner--narrow">
          <h2 id="ch-role" class="scene__display" data-reveal>${esc(c.role)}</h2>
          ${c.premise ? `<p class="scene__lead" data-reveal>${esc(c.premise)}</p>` : ''}
          ${c.mission ? `<p class="mission" data-reveal>${esc(c.mission)}</p>` : ''}
        </div>
      </section>
      ${chapters.map((ch, i) => this._chapterScene(j, ch, i, chapters.length)).join('')}
      ${c.choice ? `
      <section class="scene scene--fork chapter fork" id="fork" data-scene="fork" aria-labelledby="fork-q">
        <div class="container scene__grid scene__grid--fork">
          <figure class="scene__frame scene__frame--still" data-reveal>${this._media(j, 'fork', 3, '', 0.85)}</figure>
          <div class="scene__text">
            <h2 id="fork-q" class="scene__title" data-reveal>${esc(c.choice.prompt)}</h2>
            <div class="fork__options" role="group" aria-labelledby="fork-q" data-reveal>
              ${c.choice.options.map((o) => `<button type="button" class="fork__option" data-key="${esc(o.key)}" aria-pressed="${o.key === pick}"><span class="fork__lamp" aria-hidden="true"></span><span>${esc(o.label)}</span></button>`).join('')}
            </div>
            <p class="fork__keeps" id="fork-keeps" aria-live="polite" data-reveal>${this._keepsHtml(c, pick)}</p>
          </div>
        </div>
      </section>` : ''}
      ${c.ending ? `
      <section class="scene scene--ending chapter chapter--ending" data-scene="ending">
        <div class="container scene__inner scene__inner--narrow">
          <figure class="scene__echo" data-reveal>${this._media(j, 'ending', 4, '', 1)}</figure>
          <p class="ending scene__display scene__display--prose" data-reveal>${esc(c.ending)}</p>
        </div>
      </section>` : ''}`;
  },

  /** Journeys without authored content: the older story, staged as two scenes. */
  _legacyScenes(j) {
    const esc = UI.esc;
    const sentences = this._sentences(j.story);
    const half = Math.ceil(sentences.length / 2);
    const partA = sentences.slice(0, half).join('').trim() || j.subtitle || '';
    const partB = sentences.slice(half).join('').trim();
    return `
      <section class="scene scene--prologue chapter" data-scene="prologue" aria-labelledby="ch1">
        <div class="container scene__inner scene__inner--narrow">
          <p class="scene__eyebrow" data-reveal>${esc(t('detail.ch1'))}</p>
          <h2 id="ch1" class="scene__display" data-reveal>${esc(this._role(j))}</h2>
          <p class="scene__lead" data-reveal>${esc(partA)}</p>
        </div>
      </section>
      ${partB ? `
      <section class="scene scene--chapter scene--bleed chapter" data-scene="ch-1" aria-labelledby="ch2">
        ${this._media(j, 'scene', 1, 'scene__media--bleed')}
        <div class="scene__scrim" aria-hidden="true"></div>
        <div class="container scene__inner scene__inner--low on-media">
          <p class="scene__eyebrow" data-reveal>${esc(t('detail.ch2'))}</p>
          <h2 id="ch2" class="scene__title" data-reveal>${esc(t('detail.mission'))}</h2>
          <div class="scene__prose"><p data-reveal>${esc(partB)}</p></div>
        </div>
      </section>` : ''}`;
  },

  /** The practical part after the story: when to go, gear, risk; then one line of small print. */
  _practical(j) {
    const esc = UI.esc;
    const c = j.content && j.content.chapters ? j.content : null;
    const mbti = (j.mbti_types || []).map((m) => m.mbti_type.code);
    const clues = c ? `
        <div class="clue"><h3>${esc(t('detail.clue.opens'))}</h3><p>${esc(c.opens)}</p></div>
        <div class="clue"><h3>${esc(t('detail.clue.gear'))}</h3><p>${esc(this._gear(j))}</p></div>
        <div class="clue"><h3>${esc(t('detail.clue.risk', { n: j.risk_level }))}</h3><p>${esc(this._riskText(j.risk_level))}</p></div>` : `
        <div class="clue"><h3>${esc(t('detail.clue.guide'))}</h3><p>${esc(t('detail.clue.guideText', { region: UI.region(j) }))}</p></div>
        <div class="clue"><h3>${esc(t('detail.clue.gear'))}</h3><p>${esc(this._gear(j))}</p></div>
        <div class="clue"><h3>${esc(t('detail.clue.risk', { n: j.risk_level }))}</h3><p>${esc(this._riskText(j.risk_level))}</p></div>
        <div class="clue"><h3>${esc(t('detail.clue.match'))}</h3><p>${esc(mbti.join(' · '))}</p></div>`;
    return `
      <div class="detail-story">
        <section class="prep" aria-labelledby="prep-title" ${c ? '' : 'id="clue-card"'}>
          <h2 id="prep-title">${esc(t(c ? 'detail.prep' : 'detail.ch3.title'))}</h2>
          <div class="clues">${clues}</div>
        </section>
        ${c ? '<div class="road-end" id="road-end"></div>' : ''}
        <p class="detail-fine">${esc(t('detail.fine'))}</p>
      </div>`;
  },

  _choiceFor(j) {
    const options = (j.content && j.content.choice && j.content.choice.options) || [];
    const key = Guest.pick(j.slug);
    return options.some((o) => o.key === key) ? key : '';
  },

  /** Signed in, the account holds the pick: load it and reflect it once it arrives. */
  async _syncChoice(j, seq) {
    await Guest.loadAccountChoices();
    if (seq !== this._seq) return;
    const key = this._choiceFor(j);
    if (key) this._reflectChoice(j, key);
  },

  _keepsHtml(c, key) {
    const kept = this._keepsText(c, key);
    return kept ? `<span class="sr-only">${UI.esc(t('detail.choice.keptSr'))}</span>${UI.esc(kept)}` : '';
  },

  _keepsText(c, key) {
    const o = ((c.choice && c.choice.options) || []).find((x) => x.key === key);
    return o ? o.keeps : '';
  },

  _choose(j, key) {
    Guest.choose(j.slug, key).catch((err) => UI.toast(I18n.error(err)));
    API.track('fork_choose', j.slug, { key });
    const btn = document.querySelector(`.fork__option[data-key="${CSS.escape(key)}"]`);
    if (btn) { btn.classList.remove('is-lit'); void btn.offsetWidth; btn.classList.add('is-lit'); }
    this._reflectChoice(j, key);
  },

  _reflectChoice(j, key) {
    const main = document.getElementById('main-content');
    main.querySelectorAll('.fork__option').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === key)));
    const keeps = main.querySelector('#fork-keeps');
    if (keeps) keeps.innerHTML = this._keepsHtml(j.content, key);
    const o = j.content.choice.options.find((x) => x.key === key);
    const line = main.querySelector('#ticket-keeps');
    if (line && o) { line.textContent = o.keeps; line.classList.remove('is-empty'); }
  },

  _renderPage(j) {
    const esc = UI.esc;
    const main = document.getElementById('main-content');
    const c = j.content && j.content.chapters ? j.content : null;
    const e = j.entrance;
    const sc = j.scene || {};
    const mbti = (j.mbti_types || []).map((m) => m.mbti_type.code);
    const top = mbti[0] || '';
    const fantasy = UI.fantasyLabel(j.fantasy_type);
    const user = Session.user;
    const role = c ? c.role : this._role(j);
    const ticketNo = String(e ? e.no : (j.id || 0)).padStart(3, '0');
    const realmKey = e ? `entrance.realm.${e.realm}` : '';
    const realm = e && t(realmKey) !== realmKey ? t(realmKey) : '';
    const pick = c ? this._choiceFor(j) : '';
    const kept = pick ? c.choice.options.find((o) => o.key === pick).keeps : '';
    const imgs = sc.images || {};
    const texture = imgs.texture ? ` style="background-image:url('${esc(imgs.texture).replace(/['()\\]/g, '')}')"` : '';
    const stat = (key, value, max) => `
      <div class="ticket__stat"><span>${esc(t(key))}</span><span class="bar" aria-hidden="true"><b style="width:${Math.round(((value || 0) / max) * 100)}%"></b></span><span class="num">${value || 0}/${max}</span></div>`;

    main.innerHTML = `
      <article class="detail scenes motif-${esc(sc.motif || 'drift')} tex-${esc(sc.texture || 'none')}" style="--accent:${esc(sc.accent || '#f2c46d')}">
        <div class="scenes__backdrop" aria-hidden="true"><div class="scenes__sky"></div><div class="scenes__motif"></div><div class="scenes__texture${imgs.texture ? ' scenes__texture--image' : ''}"${texture}></div></div>

        <header class="scene scene--hero detail-hero" data-scene="hero">
          ${this._media(j, 'hero', 0, 'scene__media--bleed scene__media--hero')}
          <div class="scene__scrim scene__scrim--hero" aria-hidden="true"></div>
          <div class="container scene__top on-media">
            <div class="detail-hero__top">
              <button class="detail-hero__back" type="button" id="detail-back" aria-label="${esc(t('detail.backLabel'))}">${UI.icon('back')}<span>${esc(t('common.back'))}</span></button>
              <nav class="detail-crumbs" aria-label="${esc(t('detail.breadcrumb'))}">
                <a href="#/explore">${esc(t('nav.explore'))}</a><span aria-hidden="true">/</span>
                <a href="#/explore?fantasy_type=${esc(j.fantasy_type)}" class="detail-hero__badge">${esc(fantasy)}</a><span aria-hidden="true">/</span>
                <span>${esc(UI.region(j))}</span>
              </nav>
              <button class="detail-hero__share" type="button" id="detail-share-top" aria-label="${esc(t('detail.share'))}">${UI.icon('share')}</button>
            </div>
          </div>
          <div class="container scene__inner scene__inner--hero on-media">
            <div class="detail-hero__text">
              ${e ? `<p class="detail-hero__no num" data-reveal>${esc(t('entrance.no', { n: String(e.no).padStart(3, '0') }))}${realm ? ` · ${esc(realm)}` : ''}</p>` : ''}
              <h1 class="detail-hero__title" data-reveal>${String(j.title).split(' · ').map((part, i, all) => `<span class="nowrap">${esc(part)}${i < all.length - 1 ? '<span class="detail-hero__dot"> ·</span>' : ''}</span>`).join(' ')}</h1>
              ${j.story_hook ? `<p class="detail-hero__hook" data-reveal>${esc(I18n.lang === 'zh' ? `「${j.story_hook}」` : `“${j.story_hook}”`)}</p>` : ''}
              <ul class="detail-hero__moods" data-reveal>${(j.mood_keywords || []).map((m) => `<li class="chip chip--sm">#${esc(m)}</li>`).join('')}</ul>
              <dl class="detail-hero__facts" data-reveal>
                <div><dt>${esc(t('detail.facts.region'))}</dt><dd>${esc(UI.region(j))}</dd></div>
                <div><dt>${esc(t('detail.facts.adventure'))}</dt><dd class="num">${j.adventure_index}/10</dd></div>
                ${c && c.opens ? `<div class="detail-hero__opens"><dt>${esc(t('detail.facts.opens'))}</dt><dd>${esc(c.opens)}</dd></div>` : top ? `<div><dt>${esc(t('detail.facts.match'))}</dt><dd>${esc(top)}</dd></div>` : ''}
                <div class="detail-hero__price"><dt>${esc(t('detail.facts.price'))}</dt><dd class="num">${esc(UI.coins(j.price))}</dd></div>
              </dl>
            </div>
            <a class="scene__cue" href="#${c ? 'ch-role' : 'ch1'}" data-cue aria-label="${esc(t('detail.cue'))}"><span aria-hidden="true"></span></a>
          </div>
        </header>

        ${c ? this._authoredScenes(j) : this._legacyScenes(j)}

        <div class="container detail-body">
          ${this._practical(j)}

          <aside class="ticket" id="detail-ticket" aria-label="${esc(t('detail.ticketAria'))}">
            <div class="ticket__top">
              <p class="ticket__label num">${esc(t(e ? 'detail.ticket.entrance' : 'detail.ticket', { no: ticketNo }))}</p>
              <p class="ticket__role">${esc(t('detail.roleLine', { role }))}</p>
              ${c && c.choice ? `<p class="ticket__keeps"><span>${esc(t('detail.ticket.keeps'))}</span><b id="ticket-keeps" class="${kept ? '' : 'is-empty'}">${esc(kept || t('detail.ticket.keepsEmpty'))}</b></p>` : ''}
              <div class="ticket__stats">
                ${stat('detail.stat.adventure', j.adventure_index, 10)}
                ${stat('detail.stat.obscurity', j.obscurity_level, 10)}
                ${stat('detail.stat.risk', j.risk_level, 5)}
              </div>
              ${mbti.length ? `<div class="ticket__match">${(j.mbti_types || []).map((m) => `<span class="tag-code">${esc(m.mbti_type.code)}<i>${esc(t('detail.matchScore', { n: m.compatibility_score }))}</i></span>`).join('')}</div>` : ''}
            </div>
            <div class="ticket__perf" aria-hidden="true"></div>
            <div class="ticket__bottom">
              <div class="ticket__price"><b class="num">${I18n.num(j.price)} <small>${esc(t('common.coins'))}</small></b><span class="num" data-balance>${user ? esc(t('detail.balance', { n: I18n.num(user.balance) })) : ''}</span></div>
              <div class="ticket__actions">
                <button class="btn btn--primary btn--lg" type="button" id="detail-cta-buy" ${j.price > 0 ? '' : 'disabled'}>${esc(t('detail.buy'))}</button>
                <button class="icon-btn icon-btn--square" type="button" id="detail-cta-save" aria-pressed="false" aria-label="${esc(t('detail.save'))}">${UI.icon('heart')}</button>
                <button class="icon-btn icon-btn--square" type="button" id="detail-share" aria-label="${esc(t('detail.share'))}">${UI.icon('share')}</button>
              </div>
              <p class="ticket__note">${esc(t('detail.note'))}</p>
            </div>
          </aside>
        </div>

        <div class="bookbar" id="detail-bookbar">
          <div class="bookbar__price"><b class="num">${esc(UI.coins(j.price))}</b><span class="num" data-balance>${user ? esc(t('detail.balance', { n: I18n.num(user.balance) })) : ''}</span></div>
          <button class="icon-btn" type="button" id="bookbar-save" aria-pressed="false" aria-label="${esc(t('detail.save'))}">${UI.icon('heart')}</button>
          <button class="btn btn--primary" type="button" id="bookbar-buy">${esc(t('detail.buy'))}</button>
        </div>
      </article>`;
    document.body.dataset.bookbar = '';
    this._bind(j);
    const article = main.querySelector('.scenes');
    Scenes.mount(article, sc);
    article.classList.add('is-armed');
  },

  _bind(j) {
    const main = document.getElementById('main-content');
    main.querySelector('#detail-back').addEventListener('click', () => Router.back('/explore'));
    const buy = () => Checkout.start(j, { onPaid: () => this._refreshBalance() });
    main.querySelector('#detail-cta-buy').addEventListener('click', buy);
    main.querySelector('#bookbar-buy').addEventListener('click', buy);
    main.querySelector('#detail-cta-save').addEventListener('click', () => this._toggleSave(j));
    main.querySelector('#bookbar-save').addEventListener('click', () => this._toggleSave(j));
    main.querySelector('#detail-share').addEventListener('click', (e) => this._share(j, e.currentTarget));
    main.querySelector('#detail-share-top').addEventListener('click', (e) => this._share(j, e.currentTarget));
    main.querySelectorAll('.fork__option').forEach((b) => b.addEventListener('click', () => this._choose(j, b.dataset.key)));
    main.querySelector('[data-cue]').addEventListener('click', (e) => {
      const target = document.getElementById(e.currentTarget.getAttribute('href').slice(1));
      if (!target) return;
      e.preventDefault();
      target.closest('.scene').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
    // The booking bar appears once the opening has scrolled away (always shown on phones).
    const bar = main.querySelector('#detail-bookbar');
    if ('IntersectionObserver' in window) {
      this._barObserver = new IntersectionObserver(([entry]) => bar.classList.toggle('is-visible', !entry.isIntersecting), { threshold: 0.05 });
      this._barObserver.observe(main.querySelector('.scene--hero'));
    } else bar.classList.add('is-visible');
  },

  _refreshBalance() {
    const user = Session.user;
    document.querySelectorAll('[data-balance]').forEach((el) => {
      el.textContent = user ? t('detail.balance', { n: I18n.num(user.balance) }) : '';
    });
  },

  async _loadSaved(slug, seq) {
    if (!API.isLoggedIn()) return;
    try {
      const res = await API.listSaved();
      if (seq !== this._seq) return;
      this._setSaved((res.data || []).some((j) => j.slug === slug));
    } catch {}
  },

  _setSaved(saved) {
    this._saved = saved;
    ['detail-cta-save', 'bookbar-save'].forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.setAttribute('aria-pressed', String(saved));
      btn.classList.toggle('is-saved', saved);
      btn.setAttribute('aria-label', t(saved ? 'detail.saved' : 'detail.save'));
      btn.innerHTML = UI.icon('heart', saved ? 'icon--fill' : '');
    });
  },

  async _toggleSave(j) {
    if (!API.isLoggedIn()) {
      UI.toast(t('detail.toast.loginToSave'), { href: `#/login?next=${encodeURIComponent(`/journey/${j.slug}`)}`, label: t('nav.login') });
      return;
    }
    const next = !this._saved;
    this._setSaved(next);
    try {
      if (next) await API.saveJourney(j.slug);
      else await API.unsaveJourney(j.slug);
      UI.toast(t(next ? 'detail.toast.saved' : 'detail.toast.unsaved'), next ? { href: '#/profile?tab=saved', label: t('detail.toast.viewSaved') } : null);
    } catch (err) {
      this._setSaved(!next);
      UI.toast(I18n.error(err));
    }
  },

  async _share(j, btn) {
    const url = `${window.location.origin}/j/${encodeURIComponent(j.slug)}${I18n.lang === 'en' ? '?lang=en' : ''}`;
    btn.dataset.copied = 'true';
    setTimeout(() => { delete btn.dataset.copied; }, 1500);
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title: j.title, text: j.story_hook, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      UI.toast(t('detail.toast.copied'));
    } catch {
      UI.toast(t('detail.toast.copyFailed'));
    }
  },

  _renderNotFound(main) {
    delete document.body.dataset.mediaHeader;
    main.innerHTML = `
      <section class="page"><div class="container"><div class="state detail-notfound">
        <p class="error-code" aria-hidden="true">404</p>
        <h1 class="state__title detail-notfound__title">${UI.esc(t('detail.notFound.title'))}</h1>
        <p class="state__text">${UI.esc(t('detail.notFound.text'))}</p>
        <div class="state__actions"><a class="btn btn--primary" href="#/explore">${UI.esc(t('error.explore'))}</a><a class="btn btn--ghost" href="#/">${UI.esc(t('error.home'))}</a></div>
      </div></div></section>`;
  },

  _renderError(main, err, ctx) {
    delete document.body.dataset.mediaHeader;
    main.innerHTML = `
      <section class="page"><div class="container"><div class="state" role="alert">
        <h1 class="state__title">${UI.esc(t('detail.error.title'))}</h1>
        <p class="state__text">${UI.esc(I18n.error(err))}</p>
        <div class="state__actions"><button class="btn btn--primary" type="button" id="detail-retry">${UI.icon('refresh')}${UI.esc(t('common.retry'))}</button><a class="btn btn--ghost" href="#/explore">${UI.esc(t('error.explore'))}</a></div>
      </div></div></section>`;
    main.querySelector('#detail-retry').addEventListener('click', () => this.render(ctx));
  },
};
