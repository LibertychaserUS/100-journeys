/**
 * Detail — poster-style hero, the journey as three chapters (role, mission, clues),
 * and the "travel script ticket" booking card (bottom booking bar on phones).
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
      <article class="detail" aria-busy="true">
        <header class="detail-hero detail-hero--loading"><div class="container detail-hero__grid">
          <div class="detail-hero__text"><div class="line skeleton" style="height:14px;width:30%"></div><div class="line skeleton" style="height:56px;width:80%;margin-top:20px"></div><div class="line skeleton" style="height:20px;width:55%;margin-top:16px"></div></div>
          <div class="detail-hero__poster skeleton"></div>
        </div></header>
      </article>`;

    API.getJourney(ctx.params.slug)
      .then((res) => {
        if (seq !== this._seq) return;
        this._journey = res.data;
        this._renderPage(res.data);
        if (res.data.content) {
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
    if (this._onSession) window.removeEventListener('session:updated', this._onSession);
    this._onSession = null;
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

  _legacyStory(j) {
    const esc = UI.esc;
    const sentences = this._sentences(j.story);
    const half = Math.ceil(sentences.length / 2);
    const partA = sentences.slice(0, half).join('').trim() || j.subtitle || '';
    const partB = sentences.slice(half).join('').trim();
    const mbti = (j.mbti_types || []).map((m) => m.mbti_type.code);
    const top = mbti[0] || '';
    const role = this._role(j);
    return `
          <div class="detail-story">
            <section class="chapter" aria-labelledby="ch1">
              <span class="chapter__n" aria-hidden="true">01</span>
              <div>
                <p class="chapter__eyebrow">${esc(top ? t('detail.ch1For', { code: top }) : t('detail.ch1'))}</p>
                <h2 id="ch1">${esc(role)}</h2>
                <p>${esc(partA)}</p>
              </div>
            </section>
            <section class="chapter" aria-labelledby="ch2">
              <span class="chapter__n" aria-hidden="true">02</span>
              <div>
                <p class="chapter__eyebrow">${esc(t('detail.ch2'))}</p>
                <h2 id="ch2">${esc(t('detail.mission'))}</h2>
                ${partB ? `<p>${esc(partB)}</p>` : ''}
              </div>
            </section>
            <section class="chapter" aria-labelledby="ch3" id="clue-card">
              <span class="chapter__n" aria-hidden="true">03</span>
              <div>
                <p class="chapter__eyebrow">${esc(t('detail.ch3'))}</p>
                <h2 id="ch3">${esc(t('detail.ch3.title'))}</h2>
                <div class="clues">
                  <div class="clue"><h3>${esc(t('detail.clue.guide'))}</h3><p>${esc(t('detail.clue.guideText', { region: UI.region(j) }))}</p></div>
                  <div class="clue"><h3>${esc(t('detail.clue.gear'))}</h3><p>${esc(this._gear(j))}</p></div>
                  <div class="clue"><h3>${esc(t('detail.clue.risk', { n: j.risk_level }))}</h3><p>${esc(this._riskText(j.risk_level))}</p></div>
                  <div class="clue"><h3>${esc(t('detail.clue.match'))}</h3><p>${esc(mbti.join(' · '))}${mbti.length ? ' — ' : ''}${esc(t(j.obscurity_level > 7 ? 'detail.clue.matchQuiet' : 'detail.clue.matchOpen'))}</p></div>
                </div>
              </div>
            </section>
          </div>`;
  },

  /** Authored entrances: role and premise, the chapters, a fork, the ending, then what is real. */
  _authoredStory(j) {
    const esc = UI.esc;
    const c = j.content;
    const e = j.entrance || {};
    const chapters = c.chapters || [];
    const pick = this._choiceFor(j);
    const n = (i) => String(i).padStart(2, '0');
    const para = (list) => (list || []).map((p) => `<p>${esc(p)}</p>`).join('');
    const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
    const coverKey = `detail.cover.${e.cover_license}`;
    const coverLabel = t(coverKey) === coverKey ? e.cover_license : t(coverKey);
    const coverSource = /^https:\/\//.test(e.cover_source || '')
      ? `<a href="${esc(e.cover_source)}" target="_blank" rel="noopener noreferrer">${esc(host(e.cover_source))}</a>` : '';
    return `
          <div class="detail-story detail-story--authored">
            <section class="chapter chapter--prologue" aria-labelledby="ch-role">
              <span class="chapter__n" aria-hidden="true">00</span>
              <div>
                <p class="chapter__eyebrow">${esc(t('detail.prologue'))}</p>
                <h2 id="ch-role">${esc(c.role)}</h2>
                ${c.premise ? `<p>${esc(c.premise)}</p>` : ''}
                ${c.mission ? `<p class="mission"><span>${esc(t('detail.missionLabel'))}</span>${esc(c.mission)}</p>` : ''}
              </div>
            </section>
            ${chapters.map((ch, i) => `
            <section class="chapter" aria-labelledby="ch-${i + 1}">
              <span class="chapter__n" aria-hidden="true">${n(i + 1)}</span>
              <div><h2 id="ch-${i + 1}">${esc(ch.title)}</h2>${para(ch.paragraphs)}</div>
            </section>`).join('')}
            ${c.choice ? `
            <section class="chapter fork" aria-labelledby="fork-q" id="fork">
              <span class="chapter__n" aria-hidden="true">${n(chapters.length + 1)}</span>
              <div>
                <p class="chapter__eyebrow">${esc(t('detail.choice.eyebrow'))}</p>
                <h2 id="fork-q">${esc(c.choice.prompt)}</h2>
                <div class="fork__options" role="group" aria-labelledby="fork-q">
                  ${c.choice.options.map((o) => `<button type="button" class="fork__option" data-key="${esc(o.key)}" aria-pressed="${o.key === pick}">${esc(o.label)}</button>`).join('')}
                </div>
                <p class="fork__keeps" id="fork-keeps" aria-live="polite">${esc(this._keepsText(c, pick))}</p>
              </div>
            </section>` : ''}
            ${c.ending ? `
            <section class="chapter chapter--ending" aria-labelledby="ch-end">
              <span class="chapter__n" aria-hidden="true">${n(chapters.length + (c.choice ? 2 : 1))}</span>
              <div><p class="chapter__eyebrow" id="ch-end">${esc(t('detail.ending'))}</p><p class="ending">${esc(c.ending)}</p></div>
            </section>` : ''}
            <section class="prep" aria-labelledby="prep-title">
              <h2 id="prep-title">${esc(t('detail.prep'))}</h2>
              <div class="clues">
                <div class="clue"><h3>${esc(t('detail.clue.opens'))}</h3><p>${esc(c.opens)}</p></div>
                <div class="clue"><h3>${esc(t('detail.clue.gear'))}</h3><p>${esc(this._gear(j))}</p></div>
                <div class="clue"><h3>${esc(t('detail.clue.risk', { n: j.risk_level }))}</h3><p>${esc(this._riskText(j.risk_level))}</p></div>
              </div>
            </section>
            <aside class="truth" aria-labelledby="truth-title">
              <h2 id="truth-title">${esc(t('detail.truth.title'))}</h2>
              <h3>${esc(t('detail.truth.real'))}</h3>
              <ul class="truth__facts">${(c.facts || []).map((f) => `<li>${esc(f.text)} <a href="${esc(f.source)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(t('detail.truth.sourceAria', { host: host(f.source) }))}">${esc(host(f.source))}</a></li>`).join('')}</ul>
              ${c.fiction ? `<h3>${esc(t('detail.truth.fiction'))}</h3><p>${esc(c.fiction)}</p>` : ''}
              ${e.cover_license ? `<p class="truth__cover">${esc(t('detail.truth.cover', { label: coverLabel }))}${coverSource ? ` · ${coverSource}` : ''}</p>` : ''}
            </aside>
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

  _keepsText(c, key) {
    const o = ((c.choice && c.choice.options) || []).find((x) => x.key === key);
    return o ? t('detail.choice.keeps', { keeps: o.keeps }) : t('detail.choice.hint');
  },

  _choose(j, key) {
    Guest.choose(j.slug, key).catch((err) => UI.toast(I18n.error(err)));
    API.track('fork_choose', j.slug, { key });
    this._reflectChoice(j, key);
  },

  _reflectChoice(j, key) {
    const main = document.getElementById('main-content');
    main.querySelectorAll('.fork__option').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === key)));
    const keeps = main.querySelector('#fork-keeps');
    if (keeps) keeps.textContent = this._keepsText(j.content, key);
    const o = j.content.choice.options.find((x) => x.key === key);
    const line = main.querySelector('#ticket-keeps');
    if (line && o) { line.textContent = o.keeps; line.classList.remove('is-empty'); }
  },

  _renderPage(j) {
    const esc = UI.esc;
    const main = document.getElementById('main-content');
    const c = j.content && j.content.chapters ? j.content : null;
    const e = j.entrance;
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
    const stat = (key, value, max) => `
      <div class="ticket__stat"><span>${esc(t(key))}</span><span class="bar" aria-hidden="true"><b style="width:${Math.round(((value || 0) / max) * 100)}%"></b></span><span class="num">${value || 0}/${max}</span></div>`;

    main.innerHTML = `
      <article class="detail">
        <header class="detail-hero" style="--cover:url('${esc(j.image_url)}')">
          <div class="detail-hero__bg" aria-hidden="true"></div>
          <div class="container detail-hero__grid">
            <div class="detail-hero__text">
              <div class="detail-hero__top">
                <button class="detail-hero__back" type="button" id="detail-back" aria-label="${esc(t('detail.backLabel'))}">${UI.icon('back')}<span>${esc(t('common.back'))}</span></button>
                <nav class="detail-crumbs" aria-label="${esc(t('detail.breadcrumb'))}">
                  <a href="#/explore">${esc(t('nav.explore'))}</a><span aria-hidden="true">/</span>
                  <a href="#/explore?fantasy_type=${esc(j.fantasy_type)}" class="detail-hero__badge">${esc(fantasy)}</a><span aria-hidden="true">/</span>
                  <span>${esc(UI.region(j))}</span>
                </nav>
                <button class="detail-hero__share" type="button" id="detail-share-top" aria-label="${esc(t('detail.share'))}">${UI.icon('share')}</button>
              </div>
              ${e ? `<p class="detail-hero__no num">${esc(t('entrance.no', { n: e.no }))}${realm ? ` · ${esc(realm)}` : ''}</p>` : ''}
              <h1 class="detail-hero__title">${esc(j.title)}</h1>
              ${j.story_hook ? `<p class="detail-hero__hook">${esc(I18n.lang === 'zh' ? `「${j.story_hook}」` : `“${j.story_hook}”`)}</p>` : ''}
              <ul class="detail-hero__moods">${(j.mood_keywords || []).map((m) => `<li class="chip chip--sm">#${esc(m)}</li>`).join('')}</ul>
              <dl class="detail-hero__facts">
                <div><dt>${esc(t('detail.facts.region'))}</dt><dd>${esc(UI.region(j))}</dd></div>
                <div><dt>${esc(t('detail.facts.adventure'))}</dt><dd class="num">${j.adventure_index}/10</dd></div>
                ${c && c.opens ? `<div class="detail-hero__opens"><dt>${esc(t('detail.facts.opens'))}</dt><dd>${esc(c.opens)}</dd></div>` : top ? `<div><dt>${esc(t('detail.facts.match'))}</dt><dd>${esc(top)}</dd></div>` : ''}
                <div class="detail-hero__price"><dt>${esc(t('detail.facts.price'))}</dt><dd class="num">${esc(UI.coins(j.price))}</dd></div>
              </dl>
            </div>
            <img class="detail-hero__poster" src="${esc(j.image_url)}" alt="" width="720" height="900" fetchpriority="high">
          </div>
        </header>

        <div class="container detail-body">
          ${c ? this._authoredStory(j) : this._legacyStory(j)}

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
    const url = window.location.href.split('?')[0];
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
