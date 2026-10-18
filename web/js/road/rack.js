/**
 * Rack — the line by the door (门边票夹): at most six tickets that borrowed from this entrance,
 * pegged on a thin line at the end of its page. The line sways with how fast you scroll (one
 * spring, paused off screen, still under reduced motion). The viewer's hour bucket — worked
 * out on this device — brings tickets of the same hour forward. A ticket opens to its back.
 *
 * Rack.mount(el, { slug, by }) returns { destroy }. `by` is the slip index (Compose.index).
 */
const Rack = (() => {
  const esc = (s) => UI.esc(s);
  const motion = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function mount(el, { slug, by, eyebrow = 'rack.eyebrow', source = null, kind = 'rack' }) {
    let destroyed = false;
    let raf = 0;
    let io = null;
    const cleanup = [];
    let items = [];

    const load = async () => {
      const hour = Road.hourNow();
      const res = await (source ? source() : API.rack(slug, hour));
      const blocked = await Road.blocked();
      if (destroyed) return;
      items = (res.data || []).filter((v) => !blocked.has(v.aid));
      render();
      if (kind === 'rack') API.track('rack_view', slug, { n: items.length });
    };

    function render() {
      const n = items.length;
      if (!n && kind === 'drift') { el.innerHTML = ''; return; } // the wind brings nothing yet: no empty line in the space
      el.innerHTML = `
        <section class="rack${n ? '' : ' is-empty'}" aria-labelledby="rack-title-${esc(slug)}">
          <p class="rack__eyebrow" id="rack-title-${esc(slug)}">${esc(t(eyebrow))}</p>
          ${kind === 'drift' ? `<p class="rack__lead">${esc(t('drift.lead'))}</p>` : ''}
          <div class="rack__line">
            <svg class="rack__thread" viewBox="0 0 1000 80" preserveAspectRatio="none" aria-hidden="true"><path d="M-10 14 Q 500 ${n ? 74 : 54} 1010 14"/></svg>
            ${n ? `<ul class="rack__tickets" style="--n:${n}">${items.map((v, i) => `
              <li class="rack__item" style="--i:${i};--x:${((i + 0.5) / n) * 100};--sag:${sag((i + 0.5) / n, n)}">
                <span class="rack__peg" aria-hidden="true"></span>
                ${Road.stubHTML(v, by, { mini: true })}
              </li>`).join('')}</ul>` : `
              <p class="rack__empty">${esc(t('rack.empty'))} <a class="link" href="#/compose">${esc(t('rack.cta'))}</a></p>`}
          </div>
          ${n && kind === 'rack' ? `<a class="rack__more link" href="#/station">${esc(t('rack.toStation'))}${UI.icon('arrow', 'icon--sm')}</a>` : ''}
        </section>`;
      el.querySelectorAll('.stub').forEach((b) => b.addEventListener('click', () => {
        const v = items.find((x) => x.code === b.dataset.code);
        if (v) Road.open(v, by, { onBlocked: (aid) => { items = items.filter((x) => x.aid !== aid); render(); } });
      }));
      if (n && motion()) sway();
    }

    // The line hangs as a quadratic curve; each peg sits on it.
    function sag(x, n) {
      const depth = n ? 60 : 40; // matches the path's control point
      return 4 * x * (1 - x) * depth * 0.5;
    }

    /** One spring for the whole line: scroll velocity pushes it, it settles back. */
    function sway() {
      const line = el.querySelector('.rack__tickets');
      if (!line) return;
      let angle = 0;
      let vel = 0;
      let lastY = window.scrollY;
      let lastT = performance.now();
      let visible = false;
      const step = (now) => {
        raf = 0;
        const dt = Math.min(48, now - lastT) / 1000;
        lastT = now;
        const y = window.scrollY;
        const push = (y - lastY) / Math.max(dt, 0.001);
        lastY = y;
        vel += (-angle * 60 - vel * 7) * dt + Math.max(-1, Math.min(1, push / 2400)) * 4 * dt * 60;
        angle += vel * dt;
        angle = Math.max(-9, Math.min(9, angle));
        line.style.setProperty('--sway', `${angle.toFixed(2)}deg`);
        if (visible && (Math.abs(angle) > 0.02 || Math.abs(vel) > 0.02 || Math.abs(push) > 1)) raf = requestAnimationFrame(step);
      };
      const kick = () => { if (visible && !raf) { lastT = performance.now(); raf = requestAnimationFrame(step); } };
      window.addEventListener('scroll', kick, { passive: true });
      cleanup.push(() => window.removeEventListener('scroll', kick));
      if ('IntersectionObserver' in window) {
        io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) kick(); });
        io.observe(line);
      } else {
        visible = true;
      }
    }

    load().catch(() => { if (!destroyed) el.innerHTML = ''; });

    return {
      destroy() {
        destroyed = true;
        if (raf) cancelAnimationFrame(raf);
        if (io) io.disconnect();
        cleanup.forEach((fn) => fn());
      },
    };
  }

  return { mount };
})();
