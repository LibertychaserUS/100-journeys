/**
 * Staff — the station master's queue on the admin page (站务): tickets three trusted travellers
 * dimmed, and tickets handed over but still hanging. Restore, take down, or silence the author
 * (every ticket down, every lamp they lit taken out of the light). Reasons are preset keys.
 */
const Staff = (() => {
  const esc = (s) => UI.esc(s);

  async function mount(el) {
    let items;
    let by;
    try {
      const [res, list] = await Promise.all([API.roadQueue(), Compose.fragments(), Road.vocab()]);
      items = res.data || [];
      by = Compose.index(list);
    } catch (err) {
      el.innerHTML = `<p class="admin-road__empty">${esc(Road.error(err))}</p>`;
      return;
    }
    const voc = await Road.vocab();
    const reason = (k) => (voc.reason[k] ? voc.reason[k].label : k);
    el.innerHTML = items.length ? `<ul class="admin-road">${items.map((it) => `
      <li class="admin-road__item" data-code="${esc(it.ticket.code)}">
        <div class="admin-road__ticket">${Road.stubHTML(it.ticket, by, { mini: true })}</div>
        <div class="admin-road__meta">
          <p class="admin-road__status ${it.status === 'hidden' ? 'is-hidden' : ''}">${esc(t(it.status === 'hidden' ? 'admin.road.hidden' : 'admin.road.live'))} · <span class="num">${esc(t('admin.road.reports', { n: it.reports, t: it.trusted }))}</span></p>
          <ul class="admin-road__reasons">${Object.entries(it.reasons).map(([k, n]) => `<li>${esc(reason(k))} <b class="num">${n}</b></li>`).join('')}</ul>
          <div class="admin-road__actions">
            <button type="button" class="btn btn--ghost btn--sm" data-review="restore">${esc(t('admin.road.restore'))}</button>
            <button type="button" class="btn btn--ghost btn--sm" data-review="remove">${esc(t('admin.road.remove'))}</button>
            <button type="button" class="btn btn--quiet btn--sm" data-review="silence">${esc(t('admin.road.silence'))}</button>
          </div>
        </div>
      </li>`).join('')}</ul>` : `<p class="admin-road__empty">${esc(t('admin.road.empty'))}</p>`;
    el.querySelectorAll('.stub').forEach((b) => b.addEventListener('click', () => {
      const it = items.find((x) => x.ticket.code === b.dataset.code);
      if (it) Road.open(it.ticket, by);
    }));
    el.querySelectorAll('[data-review]').forEach((b) => b.addEventListener('click', async () => {
      if (b.dataset.review !== 'restore' && b.dataset.confirm !== 'true') {
        b.dataset.confirm = 'true';
        b.textContent = t('admin.road.confirm');
        return;
      }
      const code = b.closest('[data-code]').dataset.code;
      try {
        await API.roadReview(code, b.dataset.review);
        UI.toast(t('admin.road.done'));
        mount(el);
      } catch (err) { UI.toast(Road.error(err)); }
    }));
  }

  return { mount };
})();
