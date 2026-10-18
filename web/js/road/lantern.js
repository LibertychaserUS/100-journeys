/**
 * Lantern — lighting a lamp on a journey or a ticket (点灯).
 *
 * An unlit paper lantern hangs below everyone's lanterns, which are covered by a sheet of rice
 * paper so nobody lights along with the crowd. Three cords hang from it — it could be real,
 * something stirred, hour and place belong — each pulled down one of five steps (sliders: drag,
 * or arrow keys). Then one preset stamp, and private flags if something did not fit. Letting it
 * go sends it up; the paper lifts in the same moment and the lantern joins the cluster, whose
 * halo is the work's light. Reduced motion: everything fades instead.
 *
 * Lantern.mount(el, { kind, id, own, dwell, compact }) returns { destroy }.
 *   dwell: a ticket's back must be looked at for a few seconds before the cords give.
 */
const Lantern = (() => {
  const esc = (s) => UI.esc(s);
  const motion = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const AXES = ['real', 'moved', 'fit'];

  /** Deterministic sky positions for a work's cluster (no randomness between renders). */
  function stars(seed, n) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    const out = [];
    for (let i = 0; i < n; i++) {
      h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
      const a = (h >>> 0) / 4294967296;
      h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
      const b = (h >>> 0) / 4294967296;
      out.push({ x: 4 + a * 92, y: 12 + b * 70, s: 0.6 + ((a * 7 + b * 3) % 1) * 0.8, d: ((a + b) * 3.1) % 3 });
    }
    return out;
  }

  function mount(el, opts) {
    const { kind, id, own = false, dwell = false, compact = false } = opts;
    let destroyed = false;
    let state = { real: 0, moved: 0, fit: 0, stamp: '', flags: [] };
    let lit = false;
    let light = null; // public light
    let voc = null;
    let ready = !dwell;
    const timers = [];
    const cleanup = [];
    el.innerHTML = `<div class="lantern${compact ? ' lantern--compact' : ''}" aria-busy="true"><div class="lantern__sky"></div></div>`;

    const load = async () => {
      const tasks = [Road.vocab(), API.light(kind, id).catch(() => ({ data: null }))];
      if (API.isLoggedIn()) tasks.push(API.myLamp(kind, id).catch(() => null));
      const [v, pub, mineRes] = await Promise.all(tasks);
      if (destroyed) return;
      voc = v;
      light = pub && pub.data;
      const mine = mineRes && mineRes.data && mineRes.data.mine;
      const pending = Road.pendingLamp(kind, id);
      if (mine) { state = { real: mine.real, moved: mine.moved, fit: mine.fit, stamp: mine.stamp, flags: mine.flags || [] }; lit = true; }
      else if (pending) { state = { real: pending.real || 0, moved: pending.moved || 0, fit: pending.fit || 0, stamp: pending.stamp || '', flags: pending.flags || [] }; lit = true; }
      const settled = mine && mine.settled;
      if (own || (mineRes && mineRes.data && mineRes.data.own)) { renderOwn(); return; }
      render({ settled });
      if (dwell && !lit) startDwell(v.dwell_s || 8);
      else ready = true;
      API.track('lamp_open', kind === 'journey' ? id : '', { kind });
      if (pending && API.isLoggedIn() && !mine) retry(pending, 0);
    };

    function skyHTML() {
      const count = light && light.count;
      const glow = light && light.glow != null ? light.glow : 0;
      const n = count ? Math.min(42, Math.max(10, count)) : 7;
      return `
        <div class="lantern__cluster" style="--glow:${glow}" data-full="${!!count}">
          ${stars(`${kind}:${id}`, n).map((p) => `<i style="--x:${p.x}%;--y:${p.y}%;--s:${p.s};--d:${p.d}s"></i>`).join('')}
        </div>
        <div class="lantern__shade" aria-hidden="true"></div>
        <p class="sr-only">${esc(t('lamp.shade'))}</p>`;
    }

    function verdictHTML() {
      if (!light || light.count == null) return `<p class="lantern__verdict is-quiet">${esc(t('lamp.notFull'))}</p>`;
      const stamps = (light.top_stamps || []).map((k) => `<span class="lantern__stamp">${esc(Road.stampLabel(k))}</span>`).join('');
      return `<p class="lantern__verdict"><b>${esc(t('lamp.count', { n: light.count }))}</b>${light.top_axis ? `<span>${esc(t('lamp.brightest', { axis: t(`lamp.axis.${light.top_axis}`) }))}</span>` : ''}${stamps}</p>`;
    }

    function cordHTML(axis) {
      const v = state[axis];
      return `
        <div class="cord" data-axis="${axis}" style="--pull:${v}">
          <span class="cord__string" aria-hidden="true"></span>
          <span class="cord__bead" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${v}"
            aria-valuetext="${esc(t(`lamp.level.${v}`))}" aria-label="${esc(t(`lamp.axis.${axis}`))}" aria-describedby="cord-q-${axis}-${esc(id)}" ${ready ? '' : 'aria-disabled="true"'}></span>
          <span class="cord__label">${esc(t(`lamp.axis.${axis}`))}</span>
          <span class="cord__level" aria-hidden="true">${esc(t(`lamp.level.${v}`))}</span>
          <span class="cord__q" id="cord-q-${axis}-${esc(id)}">${esc(t(`lamp.axis.${axis}.q`))}</span>
        </div>`;
    }

    function render({ settled = false } = {}) {
      const box = el.querySelector('.lantern');
      box.removeAttribute('aria-busy');
      box.classList.toggle('is-lit', lit);
      box.innerHTML = `
        <div class="lantern__sky${lit ? ' is-open' : ''}">${skyHTML()}</div>
        ${lit ? verdictHTML() : ''}
        <div class="lantern__hang">
          <div class="lantern__body" style="--flame:${flame()}" aria-hidden="true">
            <span class="lantern__cap"></span><span class="lantern__paper"><span class="lantern__flame"></span></span><span class="lantern__foot"></span>
          </div>
          ${dwell && !ready ? `<div class="lantern__dwell" role="timer" aria-live="off"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="16"/></svg><span class="sr-only">${esc(t('lamp.dwell'))}</span></div>` : ''}
          <div class="lantern__cords">${AXES.map(cordHTML).join('')}</div>
        </div>
        <fieldset class="lantern__stamps">
          <legend>${esc(t('lamp.stamps'))}</legend>
          <div class="stamps">${voc.stamps.map((s) => `<button type="button" class="stamp" data-stamp="${esc(s.key)}" aria-pressed="${state.stamp === s.key}">${esc(s.label)}</button>`).join('')}</div>
        </fieldset>
        <details class="lantern__flags"${state.flags.length ? ' open' : ''}>
          <summary>${esc(t('lamp.flags'))}</summary>
          <p>${esc(t('lamp.flagsNote'))}</p>
          <div class="flags">${voc.flags.map((f) => `<label class="flag"><input type="checkbox" value="${esc(f.key)}" ${state.flags.includes(f.key) ? 'checked' : ''}><span>${esc(f.label)}</span></label>`).join('')}</div>
        </details>
        <div class="lantern__go">
          <button type="button" class="btn btn--primary lantern__release" ${settled ? 'disabled' : ''}>${esc(t(lit ? 'lamp.adjust' : 'lamp.release'))}</button>
          <p class="lantern__status" role="status" aria-live="polite">${settled ? esc(t('lamp.settled')) : ''}</p>
          <p class="sr-only" role="status" aria-live="polite" data-lit-status></p>
        </div>`;
      bind(box);
      syncRelease();
    }

    function renderOwn() {
      const box = el.querySelector('.lantern');
      box.removeAttribute('aria-busy');
      box.classList.add('is-own');
      box.innerHTML = `<div class="lantern__sky is-open">${skyHTML()}</div>${verdictHTML()}<p class="lantern__own">${esc(t('lamp.own'))}</p>`;
    }

    const flame = () => {
      const pulled = AXES.map((a) => state[a]).filter((v) => v > 0);
      return pulled.length ? (pulled.reduce((a, b) => a + b, 0) / pulled.length / 5).toFixed(2) : (state.stamp ? '0.15' : '0');
    };

    function syncRelease() {
      const btn = el.querySelector('.lantern__release');
      if (!btn) return;
      const any = AXES.some((a) => state[a] > 0) || !!state.stamp;
      btn.setAttribute('aria-disabled', String(!any || !ready));
      el.querySelector('.lantern__body')?.style.setProperty('--flame', flame());
    }

    function setCord(axis, value) {
      if (!ready) return;
      const v = Math.max(0, Math.min(5, value));
      if (v === state[axis]) return;
      state = { ...state, [axis]: v };
      const cord = el.querySelector(`.cord[data-axis="${axis}"]`);
      const bead = cord.querySelector('.cord__bead');
      cord.style.setProperty('--pull', v);
      bead.setAttribute('aria-valuenow', v);
      bead.setAttribute('aria-valuetext', t(`lamp.level.${v}`));
      cord.querySelector('.cord__level').textContent = t(`lamp.level.${v}`);
      if (motion()) cord.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(2px)' }, { transform: 'translateY(0)' }], { duration: 180 });
      syncRelease();
    }

    function bind(box) {
      box.querySelectorAll('.cord').forEach((cord) => {
        const axis = cord.dataset.axis;
        const bead = cord.querySelector('.cord__bead');
        bead.addEventListener('keydown', (e) => {
          const map = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, PageDown: 2, PageUp: -2 };
          if (e.key in map) { e.preventDefault(); setCord(axis, state[axis] + map[e.key]); }
          else if (e.key === 'Home') { e.preventDefault(); setCord(axis, 0); }
          else if (e.key === 'End') { e.preventDefault(); setCord(axis, 5); }
        });
        // Pull the cord down: every 18px is one step; a tap on the bead adds one (wrapping).
        cord.addEventListener('pointerdown', (e) => {
          if (!ready || e.button !== 0) return;
          e.preventDefault();
          bead.focus({ preventScroll: true });
          const startY = e.clientY;
          const start = state[axis];
          let moved = false;
          cord.setPointerCapture(e.pointerId);
          const move = (ev) => {
            const dy = ev.clientY - startY;
            if (Math.abs(dy) > 4) moved = true;
            setCord(axis, start + Math.round(dy / 18));
          };
          const up = () => {
            cord.removeEventListener('pointermove', move);
            cord.removeEventListener('pointerup', up);
            cord.removeEventListener('pointercancel', up);
            if (!moved) setCord(axis, state[axis] >= 5 ? 0 : state[axis] + 1);
          };
          cord.addEventListener('pointermove', move);
          cord.addEventListener('pointerup', up);
          cord.addEventListener('pointercancel', up);
        });
      });
      box.querySelectorAll('.stamp').forEach((b) => b.addEventListener('click', () => {
        state = { ...state, stamp: state.stamp === b.dataset.stamp ? '' : b.dataset.stamp };
        box.querySelectorAll('.stamp').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.stamp === state.stamp)));
        if (state.stamp && motion()) b.animate([{ transform: 'scale(1.12) rotate(-4deg)' }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        syncRelease();
      }));
      box.querySelectorAll('.flag input').forEach((c) => c.addEventListener('change', () => {
        state = { ...state, flags: [...box.querySelectorAll('.flag input:checked')].map((x) => x.value) };
      }));
      box.querySelector('.lantern__release').addEventListener('click', release);
    }

    function startDwell(seconds) {
      ready = false;
      const box = el.querySelector('.lantern');
      const started = Date.now();
      // A little longer than the server's rule, so a slow network never makes the lamp wait twice.
      const total = (seconds + 0.6) * 1000;
      box.style.setProperty('--dwell', `${total}ms`);
      box.classList.add('is-dwelling');
      const tick = () => {
        if (destroyed) return;
        const left = Math.max(0, Math.ceil((total - (Date.now() - started)) / 1000));
        const timer = box.querySelector('.lantern__dwell');
        if (timer) timer.setAttribute('aria-label', t('lamp.dwellAria', { n: left }));
        if (left > 0) { timers.push(setTimeout(tick, 1000)); return; }
        ready = true;
        box.classList.remove('is-dwelling');
        box.querySelector('.lantern__dwell')?.remove();
        box.querySelectorAll('.cord__bead').forEach((b) => b.removeAttribute('aria-disabled'));
        syncRelease();
      };
      tick();
    }

    async function release() {
      const btn = el.querySelector('.lantern__release');
      const status = el.querySelector('.lantern__status');
      if (!ready) return;
      if (btn.getAttribute('aria-disabled') === 'true') { status.textContent = t('lamp.needWick'); return; }
      btn.setAttribute('aria-busy', 'true');
      const lamp = { kind, id, ...state };
      try {
        const res = await Road.light(lamp);
        if (destroyed) return;
        API.track('lamp_light', kind === 'journey' ? id : '', { kind, local: !!res.local });
        if (!res.local) light = res.light;
        lift(res);
        if (res.held && res.wait > 0) retry(lamp, res.wait);
      } catch (err) {
        btn.removeAttribute('aria-busy');
        status.textContent = Road.error(err);
      }
    }

    /** The signature moment: the lamp rises, the paper lifts, the cluster takes it in. */
    function lift(res) {
      const box = el.querySelector('.lantern');
      const sky = box.querySelector('.lantern__sky');
      const body = box.querySelector('.lantern__body');
      const done = () => {
        if (destroyed) return;
        lit = true;
        render();
        // The light says it; only screen readers hear the words.
        const said = el.querySelector('[data-lit-status]');
        if (said) said.textContent = res.local ? t(res.held ? 'lamp.kept' : 'lamp.local') : t('lamp.lit');
        if (res.local && !res.held && !API.isLoggedIn()) {
          UI.toast(t('lamp.local'), { href: `#/login?next=${encodeURIComponent(window.location.hash.slice(1) || '/')}`, label: t('nav.login') });
        }
      };
      if (!motion() || !body || !sky) { done(); return; }
      const a = body.getBoundingClientRect();
      const b = sky.getBoundingClientRect();
      const ghost = document.createElement('span');
      ghost.className = 'lantern__ghost';
      ghost.setAttribute('aria-hidden', 'true');
      Object.assign(ghost.style, { left: `${a.left + a.width / 2 - 14}px`, top: `${a.top + a.height * 0.3}px` });
      document.body.appendChild(ghost);
      const dy = b.top + b.height * 0.42 - (a.top + a.height * 0.3);
      const dx = (b.left + b.width * 0.5) - (a.left + a.width / 2);
      ghost.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.3}px, ${dy * 0.55}px) scale(.8)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(.35)`, opacity: 0 },
      ], { duration: 1400, easing: 'cubic-bezier(.33,.0,.2,1)' }).finished.catch(() => {}).finally(() => ghost.remove());
      cleanup.push(() => ghost.remove());
      sky.querySelector('.lantern__shade')?.animate([
        { transform: 'translateY(0)', opacity: 1 },
        { transform: 'translateY(-14%)', opacity: 0.9, offset: 0.5 },
        { transform: 'translateY(-110%)', opacity: 0 },
      ], { duration: 1300, delay: 300, easing: 'cubic-bezier(.6,0,.25,1)', fill: 'forwards' });
      timers.push(setTimeout(done, 1500));
    }

    function retry(lamp, wait) {
      timers.push(setTimeout(async () => {
        if (destroyed || !API.isLoggedIn()) return;
        try {
          const res = await Road.light(lamp);
          if (!res.local && !destroyed) { light = res.light; lit = true; render(); const said = el.querySelector('[data-lit-status]'); if (said) said.textContent = t('lamp.lit'); }
        } catch {}
      }, Math.max(1, wait) * 1000 + 600));
    }

    load().catch((err) => {
      if (destroyed) return;
      el.innerHTML = `<p class="lantern__status">${esc(Road.error(err))}</p>`;
    });

    return {
      destroy() {
        destroyed = true;
        timers.forEach(clearTimeout);
        cleanup.forEach((fn) => fn());
      },
    };
  }

  return { mount };
})();
