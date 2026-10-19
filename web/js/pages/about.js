/**
 * About — what the product is, who it is for, and the demo scope.
 */
var Pages = window.Pages || {};

Pages.About = {
  render() {
    const esc = UI.esc;
    document.getElementById('main-content').innerHTML = `
      <div class="page about">
        <div class="container">
          <header class="about-head">
            <p class="about-kicker">${esc(t('about.kicker'))}</p>
            <h1>${esc(t('about.title'))}</h1>
            <p class="about-lead">${esc(t('about.lead'))}</p>
          </header>
          <div class="about-grid">
            ${[1, 2, 3].map((n) => `<section><h2>${esc(t(`about.c${n}.title`))}</h2><p>${esc(t(`about.c${n}.text`))}</p></section>`).join('')}
          </div>
          <footer class="about-colophon">
            <p><b>${esc(t('about.stack.title'))}</b> ${esc(t('about.stack.text'))}</p>
            <a class="link-arrow" href="https://github.com/LibertychaserUS/100-journeys" target="_blank" rel="noopener">${esc(t('about.source'))} ${UI.icon('arrow', 'icon--sm')}</a>
          </footer>
        </div>
      </div>`;
  },
};
