/**
 * Recharge — tiers come from the API (each with the bonus it really credits).
 * ?need=<coins>&next=<path> preselects the smallest tier that covers a checkout shortfall
 * and returns to that checkout after the top-up.
 */
var Pages = window.Pages || {};

Pages.Recharge = {
  _tiers: [],
  _selected: null, // tier amount or 'custom'
  _user: null,
  _seq: 0,

  async render(ctx) {
    if (!API.isLoggedIn()) {
      Router.navigate(`/login?next=${encodeURIComponent(`/recharge${ctx.query.toString() ? `?${ctx.query}` : ''}`)}`);
      return;
    }
    const seq = ++this._seq;
    const esc = UI.esc;
    this._need = Math.max(0, parseInt(ctx.query.get('need'), 10) || 0);
    this._next = Router.safeNext(ctx.query.get('next'), '');
    const main = document.getElementById('main-content');
    main.innerHTML = `
      <div class="page recharge">
        <div class="container container--narrow recharge__inner">
          <header>
            <h1 class="recharge-title">${esc(t('recharge.title'))}</h1>
            <p class="recharge-sub">${esc(t('recharge.sub'))}</p>
          </header>
          <div id="recharge-need"></div>
          <div class="recharge-tiers" id="recharge-tiers" role="radiogroup" aria-label="${esc(t('recharge.amounts'))}">
            ${'<div class="recharge-tier skeleton" aria-hidden="true"></div>'.repeat(6)}
          </div>
          <div class="field recharge-custom" id="recharge-custom" hidden>
            <label for="recharge-custom-input">${esc(t('recharge.customLabel'))}</label>
            <div class="input"><input type="number" id="recharge-custom-input" inputmode="numeric" min="1" max="100000" step="1" placeholder="${esc(t('recharge.customPh'))}" aria-describedby="recharge-custom-input-error"></div>
            <p class="field__error" id="recharge-custom-input-error" hidden></p>
          </div>
          <div class="lines recharge-lines" id="recharge-lines"></div>
          <p class="alert" role="alert" id="recharge-error" hidden>${UI.icon('alert')}<span></span></p>
          <button class="btn btn--primary btn--lg btn--block" type="button" id="recharge-submit" disabled>${esc(t('recharge.submitEmpty'))}</button>
          <div class="recharge-back">
            <button class="btn btn--quiet" type="button" id="recharge-back">${UI.icon('back', 'icon--sm')}${esc(t(this._next.startsWith('/journey/') ? 'recharge.backJourney' : 'recharge.back'))}</button>
          </div>
        </div>
      </div>`;

    main.querySelector('#recharge-tiers').addEventListener('click', (e) => {
      const tier = e.target.closest('[data-amount]');
      if (tier) this._select(tier.dataset.amount === 'custom' ? 'custom' : Number(tier.dataset.amount));
    });
    main.querySelector('#recharge-tiers').addEventListener('keydown', (e) => this._onKey(e));
    main.querySelector('#recharge-custom-input').addEventListener('input', () => this._summary());
    main.querySelector('#recharge-submit').addEventListener('click', () => this._submit());
    main.querySelector('#recharge-back').addEventListener('click', () => {
      if (this._next) Router.navigate(this._next);
      else Router.back('/profile');
    });

    try {
      const [tiersRes, user] = await Promise.all([API.rechargeTiers(), Session.load(true)]);
      if (seq !== this._seq) return;
      this._tiers = tiersRes.data || [];
      this._user = user;
      this._renderNeed();
      this._renderTiers();
      const fit = this._need ? this._tiers.find((x) => x.amount >= this._need) : null;
      this._select(fit ? fit.amount : (this._tiers[1] || this._tiers[0] || {}).amount || 'custom', false);
      if (this._need && !fit) {
        this._select('custom', false);
        main.querySelector('#recharge-custom-input').value = String(Math.min(100000, this._need));
        this._summary();
      }
    } catch (err) {
      if (seq !== this._seq) return;
      this._error(I18n.error(err));
    }
  },

  destroy() { this._seq++; },

  _renderNeed() {
    const box = document.getElementById('recharge-need');
    if (!box || !this._need) return;
    box.innerHTML = `<div class="alert alert--info recharge-need">${UI.icon('alert')}<span>${UI.esc(t('recharge.needPlain', { n: I18n.num(this._need) }))}</span></div>`;
  },

  _renderTiers() {
    const esc = UI.esc;
    const fit = this._need ? this._tiers.find((x) => x.amount >= this._need) : this._tiers[1];
    document.getElementById('recharge-tiers').innerHTML = this._tiers.map((tier) => `
      <button class="recharge-tier" type="button" role="radio" aria-checked="false" tabindex="-1" data-amount="${tier.amount}">
        <b class="num">${I18n.num(tier.amount)}</b>
        <span>${tier.bonus ? esc(t('recharge.bonus', { n: I18n.num(tier.bonus) })) : esc(t('common.coinsLong'))}</span>
        ${fit && fit.amount === tier.amount ? `<em class="recharge-tier__tag">${esc(t('recharge.recommended'))}</em>` : ''}
      </button>`).join('') + `
      <button class="recharge-tier recharge-tier--custom" type="button" role="radio" aria-checked="false" tabindex="-1" data-amount="custom">
        <b>${esc(t('recharge.custom'))}</b><span class="num">${esc(t('recharge.customRange'))}</span>
      </button>`;
  },

  _onKey(e) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const items = [...document.querySelectorAll('.recharge-tier[data-amount]')];
    const i = items.findIndex((el) => el.getAttribute('aria-checked') === 'true');
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const next = items[(i + step + items.length) % items.length];
    this._select(next.dataset.amount === 'custom' ? 'custom' : Number(next.dataset.amount));
    next.focus();
  },

  _select(value, focus = true) {
    this._selected = value;
    document.querySelectorAll('.recharge-tier[data-amount]').forEach((el) => {
      const on = String(value) === el.dataset.amount;
      el.setAttribute('aria-checked', String(on));
      el.tabIndex = on ? 0 : -1;
      el.classList.toggle('recharge-tier--active', on);
    });
    const custom = document.getElementById('recharge-custom');
    custom.hidden = value !== 'custom';
    if (value === 'custom' && focus) document.getElementById('recharge-custom-input').focus();
    this._summary();
  },

  _amount() {
    if (this._selected === 'custom') {
      const raw = document.getElementById('recharge-custom-input').value.trim();
      const n = Number(raw);
      return Number.isInteger(n) && n >= 1 && n <= 100000 ? n : null;
    }
    return this._selected || null;
  },

  _summary() {
    const esc = UI.esc;
    const amount = this._amount();
    const tier = this._tiers.find((x) => x.amount === amount && this._selected !== 'custom');
    const bonus = tier ? tier.bonus : 0;
    const balance = this._user ? this._user.balance : 0;
    const lines = document.getElementById('recharge-lines');
    lines.innerHTML = `
      <div><span>${esc(t('recharge.current'))}</span><b>${esc(UI.coins(balance))}</b></div>
      ${amount ? `<div><span>${esc(t('recharge.amount'))}</span><b>+${esc(UI.coins(amount))}</b></div>` : ''}
      ${bonus ? `<div class="is-plus"><span>${esc(t('recharge.bonusLine'))}</span><b>+${esc(UI.coins(bonus))}</b></div>` : ''}
      ${amount ? `<div class="is-total"><span>${esc(t('recharge.after'))}</span><b>${esc(UI.coins(balance + amount + bonus))}</b></div>` : ''}`;
    const submit = document.getElementById('recharge-submit');
    submit.disabled = !amount;
    submit.textContent = amount ? t('recharge.submit', { n: I18n.num(amount) }) : t('recharge.submitEmpty');
    const customError = this._selected === 'custom' && document.getElementById('recharge-custom-input').value.trim() && !amount ? t('recharge.invalid') : '';
    AuthForm.setFieldError(document.querySelector('.recharge'), 'recharge-custom-input', customError);
  },

  _error(message) {
    const box = document.getElementById('recharge-error');
    if (!box) return;
    box.hidden = !message;
    box.querySelector('span').textContent = message || '';
  },

  async _submit() {
    const amount = this._amount();
    if (!amount) return;
    const submit = document.getElementById('recharge-submit');
    this._error('');
    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    submit.textContent = t('recharge.submitting');
    try {
      const res = await API.recharge(amount);
      const credited = res.data.recharged + (res.data.bonus || 0);
      this._user = await Session.refresh();
      UI.toast(t('recharge.done', { n: I18n.num(credited) }));
      if (this._next) { Router.navigate(this._next); return; }
      this._need = 0;
      document.getElementById('recharge-need').innerHTML = '';
      submit.removeAttribute('aria-busy');
      this._summary();
    } catch (err) {
      submit.removeAttribute('aria-busy');
      this._error(I18n.error(err));
      this._summary();
    }
  },
};
