/**
 * RoadEnd — what waits at the end of an authored entrance, after "what is real, what is not":
 * the rubbing of the door, a lantern for the journey, and the line of tickets by the door.
 *
 * Signed in, opening the page records the first view and reaching the ending records the
 * arrival; a journey's lantern only counts when the two are a reading's length apart.
 *
 * RoadEnd.mount(journey) after the detail page rendered #road-end; returns { destroy }.
 */
const RoadEnd = (() => {
  const esc = (s) => UI.esc(s);
  let current = null;

  function mount(journey) {
    if (current) current.destroy();
    const host = document.getElementById('road-end');
    if (!host || !journey.content || !journey.entrance) return null;
    const parts = [];
    let io = null;
    let destroyed = false;

    Road.arrive('journey', journey.slug, 'view');
    const ending = document.querySelector('.chapter--ending') || host;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) Road.arrive('journey', journey.slug, 'end');
      }, { threshold: 0.6 });
      io.observe(ending);
    }

    host.innerHTML = `
      <div class="road-end__rub" id="road-rub"></div>
      <section class="road-end__lamp" aria-labelledby="road-lamp-title">
        <h2 class="sr-only" id="road-lamp-title">${esc(t('lamp.title'))}</h2>
        <div id="road-lamp"></div>
      </section>
      <div class="road-end__rack" id="road-rack"></div>`;

    Compose.fragments().then((list) => {
      if (destroyed) return;
      const by = Compose.index(list);
      parts.push(Rubbing.mount(host.querySelector('#road-rub'), { journey, list, by }));
      parts.push(Lantern.mount(host.querySelector('#road-lamp'), { kind: 'journey', id: journey.slug }));
      parts.push(Rack.mount(host.querySelector('#road-rack'), { slug: journey.slug, by }));
    }).catch(() => { host.innerHTML = ''; });

    current = {
      destroy() {
        destroyed = true;
        if (io) io.disconnect();
        parts.forEach((p) => p && p.destroy());
        if (current === this) current = null;
      },
    };
    return current;
  }

  window.addEventListener('route:changed', () => {
    if (current && !document.getElementById('road-end')) current.destroy();
  });

  return { mount, destroy: () => current && current.destroy() };
})();
