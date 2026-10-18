/**
 * Guide — the lantern guide's walk: six small scenes, each answer a way of walking.
 * The type comes from fixed weights (no model call); progress lives in Guest.dialog so
 * the walk can be left and resumed. Ends with a reveal that leads into the space.
 */
var Pages = window.Pages || {};

Pages.Guide = {
  // Each option adds weight to letters; ties lean I, N, F, P.
  scenes: [
    { a: { E: 2, F: 1 }, b: { S: 2, T: 1 }, c: { I: 1, N: 2, P: 1 } },
    { a: { J: 2 }, b: { P: 2, E: 1 }, c: { I: 1, S: 1 } },
    { a: { E: 2, F: 1 }, b: { I: 2, J: 1 }, c: { S: 1, T: 2 } },
    { a: { F: 2, E: 1 }, b: { T: 2, S: 1 }, c: { I: 1, N: 1 } },
    { a: { S: 2, P: 1 }, b: { N: 1, J: 2 }, c: { N: 2, P: 1 } },
    { a: { I: 2 }, b: { E: 2, F: 1, P: 1 }, c: { J: 2, T: 1 } },
  ],

  score(answers) {
    const s = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };
    answers.forEach((key, i) => Object.entries((this.scenes[i] || {})[key] || {}).forEach(([k, v]) => { s[k] += v; }));
    return (s.E > s.I ? 'E' : 'I') + (s.S > s.N ? 'S' : 'N') + (s.T > s.F ? 'T' : 'F') + (s.J > s.P ? 'J' : 'P');
  },

  _state() {
    const d = Guest.get().dialog;
    return d && Array.isArray(d.answers) ? { step: d.step || 0, answers: d.answers.slice(0, this.scenes.length) } : null;
  },

  _save(state) { Guest.update((g) => { g.dialog = state; }); },

  render() {
    const state = this._state();
    if (!state) this._renderIntro();
    else if (state.answers.length >= this.scenes.length) this._renderReveal(this.score(state.answers));
    else this._renderStep(state.answers);
  },

  _shell(inner, { step } = {}) {
    const esc = UI.esc;
    const total = this.scenes.length;
    const progress = step != null ? `
      <div class="guide__progress" role="img" aria-label="${esc(t('guide.progressAria', { n: step + 1, total }))}">
        ${this.scenes.map((_, i) => `<b class="${i <= step ? 'on' : ''}"></b>`).join('')}<span class="num">${step + 1} / ${total}</span>
      </div>` : '';
    document.getElementById('main-content').innerHTML = `
      <section class="page guide">
        <div class="container guide__inner">
          <p class="eyebrow">${esc(t('guide.eyebrow'))}</p>
          ${progress}
          <div class="guide__speaker">
            <span class="guide__face" id="guide-face">${Lumi.svg('', { size: 64 })}</span>
            <span>${esc(AIPet.name())}</span>
          </div>
          ${inner}
        </div>
      </section>`;
  },

  _renderIntro() {
    const esc = UI.esc;
    this._shell(`
      <h1 class="guide__line">${esc(t('guide.intro'))}</h1>
      <div class="guide__actions"><button class="btn btn--primary btn--lg" type="button" id="guide-start">${esc(t('guide.start'))}</button></div>`);
    document.getElementById('guide-start').addEventListener('click', () => {
      this._save({ step: 0, answers: [] });
      this._renderStep([]);
      document.querySelector('.guide__option')?.focus();
    });
  },

  _renderStep(answers) {
    const esc = UI.esc;
    const step = answers.length;
    const n = step + 1;
    this._shell(`
      <h1 class="guide__line" id="guide-q" tabindex="-1">${esc(t(`guide.s${n}.q`))}</h1>
      <div class="guide__options" role="group" aria-labelledby="guide-q">
        ${['a', 'b', 'c'].map((k) => `<button class="guide__option" type="button" data-key="${k}">${esc(t(`guide.s${n}.${k}`))}</button>`).join('')}
      </div>
      <div class="guide__foot">
        ${step > 0 ? `<button class="btn btn--quiet" type="button" id="guide-back">${UI.icon('back')}${esc(t('guide.back'))}</button>` : '<span></span>'}
        <a class="btn btn--quiet" id="guide-leave" href="#/explore">${esc(t('guide.leave'))}</a>
      </div>`, { step });

    const main = document.getElementById('main-content');
    main.querySelector('.guide__options').addEventListener('click', (e) => {
      const opt = e.target.closest('[data-key]');
      if (!opt) return;
      const next = [...answers, opt.dataset.key];
      this._save({ step: next.length, answers: next });
      if (next.length >= this.scenes.length) this._finish(next);
      else {
        this._renderStep(next);
        document.getElementById('guide-q')?.focus();
      }
    });
    main.querySelector('#guide-back')?.addEventListener('click', () => {
      const prev = answers.slice(0, -1);
      this._save({ step: prev.length, answers: prev });
      this._renderStep(prev);
      document.getElementById('guide-q')?.focus();
    });
  },

  async _finish(answers) {
    const code = this.score(answers);
    try {
      await Guest.setMbti(code, 'pet');
    } catch (err) {
      UI.toast(I18n.error(err));
    }
    API.track('type_found', '', { via: 'pet', code });
    this._renderReveal(code, { condense: true });
    document.getElementById('guide-reveal')?.focus();
  },

  _renderReveal(code, { condense = false } = {}) {
    const esc = UI.esc;
    const label = `${code} · ${MBTI.name(code)}`;
    this._shell(`
      <div class="guide__reveal" id="guide-reveal" tabindex="-1">
        <div class="guide__form" id="guide-form">${condense ? '' : Lumi.svg(code, { size: 168, label })}</div>
        <p class="guide__lit">${esc(t('guide.reveal.eyebrow'))}</p>
        <h1><b>${esc(code)}</b><span>${esc(MBTI.name(code))}</span></h1>
        <p class="guide__line guide__line--sm">${esc(t('guide.reveal.text'))}</p>
      </div>
      <div class="guide__actions">
        <a class="btn btn--primary btn--lg" id="guide-enter" href="#/space?reveal=1">${esc(t('guide.reveal.cta'))}</a>
        <a class="btn btn--ghost" href="#/find">${esc(t('guide.reveal.notMe'))}</a>
        <button class="btn btn--quiet" type="button" id="guide-again">${esc(t('guide.reveal.again'))}</button>
      </div>`);
    document.querySelector('.guide__speaker')?.remove(); // Lumi has become the form below
    if (condense) Lumi.condense(document.getElementById('guide-form'), code, { size: 168, label });
    document.getElementById('guide-again').addEventListener('click', () => {
      this._save({ step: 0, answers: [] });
      this._renderStep([]);
      document.getElementById('guide-q')?.focus();
    });
  },
};
