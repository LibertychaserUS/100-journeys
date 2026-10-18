/**
 * Rubbing — taking a rubbing of a door at the end of its journey (拓印纸笺).
 *
 * A sheet of rice paper lies over the door's number and an engraved line; under it are the
 * slips this door hands out: its place, its hour, its season, and what you took from its fork.
 * Rubbing back and forth darkens the paper where the relief is (slower strokes leave more
 * charcoal; in the dark theme it is lamp ash, pale gold). Coverage is counted on a 32×16 grid;
 * at 60% the paper lifts from its corners and the slips drop into the slip box below.
 * Reduced motion, keyboards and screen readers press and hold instead.
 *
 * Rubbing.mount(el, { journey, list, by }) returns { destroy }.
 */
const Rubbing = (() => {
  const esc = (s) => UI.esc(s);
  const motion = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COLS = 32;
  const ROWS = 16;
  const DONE = 0.6;

  function mount(el, { journey, list, by }) {
    const no = journey.entrance.no;
    const slug = journey.slug;
    let destroyed = false;
    let held = {};
    let done = false;
    let hold = null;
    const cleanup = [];
    const listen = (target, type, fn, o) => { target.addEventListener(type, fn, o); cleanup.push(() => target.removeEventListener(type, fn, o)); };

    const option = () => Guest.pick(slug) || '';
    const slips = () => Road.slipsAt(no, option(), list);
    const holdsAll = () => slips().every((f) => held[Road.slipId(f)]) && !!option();
    const keepCount = () => list.filter((f) => Road.owns(f, held) && f.unlock !== 'open' && f.unlock !== 'starter').length;

    function slipHTML(f) {
      return `<li class="rslip" data-group="${f.group}"><span class="rslip__g">${esc(t(`compose.line.${f.group}`))}</span><span class="rslip__t">${esc(f.text)}</span></li>`;
    }

    const forkHTML = (forkSlip) => (forkSlip ? slipHTML(forkSlip).replace('class="rslip"', 'class="rslip" data-fork') : `<li class="rslip rslip--empty" data-fork><span class="rslip__g">${esc(t('rub.fork'))}</span><a class="rslip__t link" href="#fork">${esc(t('rub.forkEmpty'))}</a></li>`);

    function render() {
      const s = slips();
      const forkSlip = s.find((f) => f.group === 'keepsake');
      const already = holdsAll();
      done = already;
      el.innerHTML = `
        <section class="rubbing${already ? ' is-done is-settled' : ''}" aria-labelledby="rub-title">
          <h2 class="sr-only" id="rub-title">${esc(t('rub.title'))}</h2>
          ${already ? '' : `<p class="sr-only" id="rub-lead">${esc(t(motion() ? 'rub.lead' : 'rub.leadHold'))}</p>`}
          <div class="rubbing__stone" data-realm="${esc(journey.entrance.realm)}">
            <div class="rubbing__relief">
              <p class="rubbing__no num"><span>№</span>${no}</p>
              <p class="rubbing__line">${esc(journey.content.role)}</p>
              <ul class="rubbing__slips">
                ${s.filter((f) => f.group !== 'keepsake').map(slipHTML).join('')}
                ${forkHTML(forkSlip)}
              </ul>
            </div>
            ${already ? '' : `<canvas class="rubbing__paper" aria-label="${esc(t('rub.paper', { n: no }))}" aria-describedby="rub-lead" role="img"></canvas>`}
          </div>
          ${already ? '' : `<div class="rubbing__controls"><button type="button" class="btn btn--ghost rubbing__hold" aria-describedby="rub-hold-help">${esc(t('rub.hold'))}<span class="rubbing__meter" aria-hidden="true"><b></b></span></button><span class="sr-only" id="rub-hold-help">${esc(t('rub.holdAria'))}</span></div>`}
          <div class="rubbing__box${already ? ' is-full' : ''}">
            <a class="slipbox" href="#/compose" aria-label="${esc(t('rub.boxAria', { n: keepCount() }))}">
              <span class="slipbox__lid" aria-hidden="true"></span>
              <span class="slipbox__label">${esc(t('rub.box'))}</span>
              <b class="slipbox__n num" aria-hidden="true">${keepCount()}</b>
            </a>
            <a class="btn btn--primary btn--sm rubbing__compose" href="#/compose">${esc(t('rub.compose'))}</a>
          </div>
          <p class="sr-only" role="status" aria-live="polite" id="rub-status"></p>
        </section>`;
      if (!already) paper();
    }

    // ---------- the paper ----------
    function paper() {
      const canvas = el.querySelector('.rubbing__paper');
      const stone = el.querySelector('.rubbing__stone');
      if (!canvas || !stone) return;
      const dark = document.documentElement.getAttribute('data-theme') !== 'light';
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const size = () => {
        const r = stone.getBoundingClientRect();
        canvas.width = Math.max(1, Math.round(r.width * dpr));
        canvas.height = Math.max(1, Math.round(r.height * dpr));
        canvas.style.width = `${r.width}px`;
        canvas.style.height = `${r.height}px`;
      };
      size();
      const ctx = canvas.getContext('2d');
      // Rice paper: a warm sheet with fibres, drawn once.
      const fibres = (seed) => {
        let h = seed;
        const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; };
        return rnd;
      };
      const drawPaper = () => {
        const w = canvas.width;
        const hgt = canvas.height;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = dark ? '#e9dfcb' : '#f8f2e4';
        ctx.fillRect(0, 0, w, hgt);
        const rnd = fibres(no * 7919 + 17);
        ctx.strokeStyle = dark ? 'rgba(120, 96, 60, .09)' : 'rgba(120, 96, 60, .07)';
        ctx.lineWidth = dpr * 0.8;
        for (let i = 0; i < 150; i++) {
          const x = rnd() * w;
          const y = rnd() * hgt;
          const len = (6 + rnd() * 26) * dpr;
          const a = rnd() * Math.PI;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + rnd() * 6, y + Math.sin(a) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
          ctx.stroke();
        }
      };
      // A short swipe already worn into one corner shows what the paper is for, without a word.
      const hint = () => {
        const w = canvas.width;
        const hgt = canvas.height;
        ctx.globalCompositeOperation = 'destination-out';
        for (let i = 0; i <= 14; i++) {
          const x = w * (0.06 + i * 0.012);
          const y = hgt * (0.86 - i * 0.012);
          const g = ctx.createRadialGradient(x, y, 0, x, y, 16 * dpr);
          g.addColorStop(0, 'rgba(0,0,0,.22)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, 16 * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      };
      drawPaper();
      hint();
      const grid = new Uint8Array(COLS * ROWS);
      let covered = 0;
      const mark = (x, y, r) => {
        const cw = canvas.width / COLS;
        const ch = canvas.height / ROWS;
        for (let gx = Math.max(0, Math.floor((x - r) / cw)); gx <= Math.min(COLS - 1, Math.floor((x + r) / cw)); gx++) {
          for (let gy = Math.max(0, Math.floor((y - r) / ch)); gy <= Math.min(ROWS - 1, Math.floor((y + r) / ch)); gy++) {
            const i = gy * COLS + gx;
            if (grid[i] < 3) {
              grid[i]++;
              if (grid[i] === 2) covered++;
            }
          }
        }
        if (!done && covered / grid.length >= DONE) finish();
      };
      // A stroke wears the paper thin (the relief shows through) and leaves dust on it.
      let last = null;
      const stroke = (x, y, t) => {
        const r = 22 * dpr;
        let alpha = 0.32;
        if (last) {
          const speed = Math.hypot(x - last.x, y - last.y) / Math.max(1, t - last.t);
          alpha = Math.max(0.12, Math.min(0.42, 0.42 - speed * 0.08)); // slower is darker
        }
        const from = last || { x, y };
        const steps = Math.max(1, Math.ceil(Math.hypot(x - from.x, y - from.y) / (r * 0.4)));
        for (let s = 1; s <= steps; s++) {
          const px = from.x + ((x - from.x) * s) / steps;
          const py = from.y + ((y - from.y) * s) / steps;
          const g = ctx.createRadialGradient(px, py, 0, px, py, r);
          g.addColorStop(0, `rgba(0,0,0,${alpha})`);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalCompositeOperation = 'destination-out';
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
          mark(px, py, r * 0.7);
        }
        last = { x, y, t };
      };
      const point = (e) => {
        const r = canvas.getBoundingClientRect();
        return { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr };
      };
      let down = false;
      listen(canvas, 'pointerdown', (e) => {
        if (done) return;
        down = true;
        last = null;
        canvas.setPointerCapture(e.pointerId);
        const p = point(e);
        stroke(p.x, p.y, e.timeStamp);
      });
      listen(canvas, 'pointermove', (e) => {
        if (!down || done) return;
        const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
        events.forEach((ev) => { const p = point(ev); stroke(p.x, p.y, ev.timeStamp); });
      });
      const up = () => { down = false; last = null; };
      listen(canvas, 'pointerup', up);
      listen(canvas, 'pointercancel', up);
      canvas.style.touchAction = 'none';

      // Press and hold: the paper thins all over at once.
      const btn = el.querySelector('.rubbing__hold');
      const meter = el.querySelector('.rubbing__meter b');
      let progress = 0;
      const start = () => {
        if (done || hold) return;
        const begin = performance.now() - progress * 1600;
        const tick = (now) => {
          progress = Math.min(1, (now - begin) / 1600);
          if (meter) meter.style.transform = `scaleX(${progress})`;
          ctx.globalCompositeOperation = 'source-over';
          drawPaper();
          ctx.globalCompositeOperation = 'destination-out';
          ctx.fillStyle = `rgba(0,0,0,${progress * 0.92})`;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          if (progress >= 1) { hold = null; finish(); return; }
          hold = requestAnimationFrame(tick);
        };
        hold = requestAnimationFrame(tick);
      };
      const stop = () => { if (hold) cancelAnimationFrame(hold); hold = null; };
      if (btn) {
        listen(btn, 'pointerdown', (e) => { e.preventDefault(); start(); });
        listen(btn, 'pointerup', stop);
        listen(btn, 'pointerleave', stop);
        listen(btn, 'keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } });
        listen(btn, 'keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') stop(); });
        listen(btn, 'blur', stop);
      }
    }

    // ---------- done ----------
    async function finish() {
      if (done) return;
      done = true;
      const section = el.querySelector('.rubbing');
      const canvas = el.querySelector('.rubbing__paper');
      section.classList.add('is-done');
      let res;
      try {
        res = await Road.rub(slug, no, option(), list);
      } catch (err) {
        UI.toast(Road.error(err));
        return;
      }
      API.track('rub', slug, { n: res.fresh.length });
      res.ids.forEach((id) => { held[id] = slug; });
      if (destroyed) return;
      const status = el.querySelector('#rub-status');
      if (status) status.textContent = `${t('rub.got')}: ${slips().map((f) => f.text).join('、')}`;
      const settle = () => {
        if (destroyed) return;
        canvas?.remove();
        section.classList.add('is-settled');
        const n = el.querySelector('.slipbox__n');
        if (n) n.textContent = keepCount();
        el.querySelector('.slipbox')?.setAttribute('aria-label', t('rub.boxAria', { n: keepCount() }));
        el.querySelector('.rubbing__box')?.classList.add('is-full');
        el.querySelector('.rubbing__controls')?.remove();
        if (res.local) UI.toast(t('rub.local'), { href: `#/register?next=${encodeURIComponent(`/journey/${slug}`)}`, label: t('nav.register') });
      };
      if (!motion()) { settle(); return; }
      canvas?.animate([
        { transform: 'none', opacity: 1, clipPath: 'polygon(0 0,100% 0,100% 100%,0 100%)' },
        { transform: 'translateY(-6px) rotateX(8deg)', opacity: 0.9, clipPath: 'polygon(4% 3%,96% 0,100% 97%,0 100%)', offset: 0.4 },
        { transform: 'translateY(-40px) rotateX(24deg) scale(.96)', opacity: 0, clipPath: 'polygon(10% 6%,90% 0,96% 90%,4% 96%)' },
      ], { duration: 900, easing: 'cubic-bezier(.6,0,.25,1)', fill: 'forwards' });
      // The slips fly into the box below, one after another, along a short arc.
      const box = el.querySelector('.slipbox');
      const target = box && box.getBoundingClientRect();
      el.querySelectorAll('.rslip:not(.rslip--empty)').forEach((li, i) => {
        if (!target) return;
        const a = li.getBoundingClientRect();
        const ghost = li.cloneNode(true);
        ghost.classList.add('rslip--flight');
        ghost.setAttribute('aria-hidden', 'true');
        Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px` });
        document.body.appendChild(ghost);
        cleanup.push(() => ghost.remove());
        const dx = target.left + target.width / 2 - (a.left + a.width / 2);
        const dy = target.top + target.height * 0.3 - (a.top + a.height / 2);
        ghost.animate([
          { transform: 'translate(0,0) rotate(0) scale(1)', opacity: 1 },
          { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) rotate(${i % 2 ? 8 : -8}deg) scale(.8)`, opacity: 1, offset: 0.5 },
          { transform: `translate(${dx}px, ${dy}px) rotate(0) scale(.3)`, opacity: 0 },
        ], { duration: 820, delay: 700 + i * 140, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'backwards' }).finished.catch(() => {}).finally(() => ghost.remove());
      });
      setTimeout(settle, 900 + 140 * 4 + 820);
    }

    // The fork may be chosen (or changed) after the rubbing was mounted: under the paper only the
    // keepsake changes (a rubbing in progress keeps its charcoal); once rubbed, a new side of the
    // fork lays fresh paper over the door.
    listen(document, 'click', (e) => {
      if (!e.target.closest || !e.target.closest('.fork__option')) return;
      setTimeout(() => {
        if (destroyed) return;
        if (done) { if (!holdsAll()) render(); return; }
        const li = el.querySelector('.rubbing__slips [data-fork]');
        if (li) li.outerHTML = forkHTML(slips().find((f) => f.group === 'keepsake'));
      }, 0);
    });

    Road.rubbed().then((r) => { if (destroyed) return; held = r; render(); }).catch(() => { held = {}; render(); });

    return {
      destroy() {
        destroyed = true;
        if (hold) cancelAnimationFrame(hold);
        cleanup.forEach((fn) => fn());
      },
    };
  }

  return { mount };
})();
