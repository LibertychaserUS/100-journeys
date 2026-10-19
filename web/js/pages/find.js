/**
 * Find — the self-select path: sixteen quiet type cards in four groups (no trait text).
 * Picking one sets the traveller's type and goes straight into their space; "not sure"
 * hands over to the guide's walk.
 */
var Pages = window.Pages || {};

Pages.Find = {
  render() {
    const esc = UI.esc;
    const current = Guest.mbti();
    const main = document.getElementById('main-content');
    main.innerHTML = `
      <section class="page find">
        <div class="container">
          <header class="find__head">
            <p class="eyebrow">${esc(t('find.eyebrow'))}</p>
            <h1>${esc(t('find.title'))}</h1>
            <p>${esc(t('find.text'))}</p>
          </header>
          <div class="find__groups">
            ${Object.entries(MBTI.groups).map(([g, codes]) => `
              <div class="find__group" role="group" aria-labelledby="find-g-${g}">
                <h2 id="find-g-${g}">${esc(t(`persona.group.${g}`))}</h2>
                ${codes.map((c) => `
                  <button class="type-card" type="button" data-code="${c}" aria-pressed="${c === current}">
                    ${Lumi.svg(c, { size: 56, still: true })}
                    <span class="type-card__text"><b>${esc(MBTI.name(c))}</b><span>${esc(MBTI.trait(c))}</span><small class="type-card__code num">${c}</small></span>
                  </button>`).join('')}
              </div>`).join('')}
          </div>
          <aside class="find__unsure">
            ${Lumi.svg('', { size: 56 })}
            <div><h2>${esc(t('find.unsure.title'))}</h2><p>${esc(t('find.unsure.text'))}</p></div>
            <a class="btn btn--ghost" id="find-unsure" href="#/guide">${esc(t('find.unsure.cta'))}</a>
          </aside>
        </div>
      </section>`;

    main.querySelector('.find__groups').addEventListener('click', (e) => {
      const card = e.target.closest('[data-code]');
      if (card) this._pick(card);
    });
    main.querySelector('#find-unsure').addEventListener('click', () => API.track('path_pick', '', { path: 'pet', from: 'find' }));
  },

  async _pick(card) {
    const code = card.dataset.code;
    card.setAttribute('aria-busy', 'true');
    try {
      await Guest.setMbti(code, 'self');
      API.track('type_found', '', { via: 'self', code });
      Router.navigate('/space?reveal=1');
    } catch (err) {
      card.removeAttribute('aria-busy');
      UI.toast(I18n.error(err));
    }
  },
};
