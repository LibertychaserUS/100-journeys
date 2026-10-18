/**
 * Error pages — 404 for unknown routes, 403, 500 and offline, with a way back
 * and (for 404) three journeys to continue with.
 */
var Pages = window.Pages || {};

Pages.Error = {
  render(code = 404) {
    const known = [404, 403, 500, 0];
    const c = known.includes(code) ? code : 500;
    const esc = UI.esc;
    const main = document.getElementById('main-content');
    if (!main) return;
    main.innerHTML = `
      <div class="page error-page">
        <div class="container">
          <div class="state">
            <p class="error-code" aria-hidden="true">${c === 0 ? 'OFFLINE' : c}</p>
            <h1 class="state__title error-title">${esc(t(`error.${c}.title`))}</h1>
            <p class="state__text">${esc(t(`error.${c}.text`))}</p>
            <div class="state__actions">
              <a class="btn btn--primary" href="#/">${esc(t('error.home'))}</a>
              <a class="btn btn--ghost" href="#/explore">${esc(t('error.explore'))}</a>
              ${c === 500 || c === 0 ? `<button class="btn btn--ghost" type="button" id="error-retry">${UI.icon('refresh')}${esc(t('common.retry'))}</button>` : ''}
            </div>
          </div>
          ${c === 404 ? `<section class="error-suggest" aria-labelledby="error-suggest"><h2 id="error-suggest">${esc(t('error.suggest'))}</h2><div class="grid-cards" id="error-picks">${UI.skeletonCards(3)}</div></section>` : ''}
        </div>
      </div>`;
    main.querySelector('#error-retry')?.addEventListener('click', () => Router.refresh());
    if (c === 404) this._picks();
  },

  async _picks() {
    const el = document.getElementById('error-picks');
    try {
      const res = await API.getJourneys({ limit: 4 });
      if (el && el.isConnected) el.innerHTML = (res.data || []).map((j) => UI.journeyCard(j)).join('');
    } catch {
      if (el) el.closest('.error-suggest').remove();
    }
  },
};
