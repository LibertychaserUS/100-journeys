/**
 * Scenes — the scroll engine behind each journey's immersive page.
 *
 * Markup: a root with `.scenes__backdrop` (fixed layers: sky, motif, texture) and sections marked
 * `[data-scene]`. The engine
 *   - reveals each scene once as it enters (`is-in`; children with `data-reveal` stagger by --i),
 *   - writes each scene's pass progress as --p (0 → 1) and the page's as --page-p, from one rAF
 *     loop fed by passive scroll events and cached offsets (no layout reads while scrolling),
 *   - walks the journey's lighting arc: the scene nearest the middle sets --arc-h / --arc-s,
 *   - runs the journey's signature motif (Scenes.motifs[id]); unknown ids fall back to "drift".
 * Only transform, opacity and custom properties change per frame. With prefers-reduced-motion,
 * everything is shown at once, the arc still changes colour, and motifs draw a still frame.
 */
var Scenes = (() => {
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DEFAULT_ARC = [{ h: 222, s: 30 }, { h: 30, s: 40 }, { h: 210, s: 20 }];
  let live = null;

  function mount(root, scene = {}) {
    destroy();
    const sections = [...root.querySelectorAll('[data-scene]')];
    const arc = (scene.arc && scene.arc.length ? scene.arc : DEFAULT_ARC);
    sections.forEach((el, i) => {
      const stop = sections.length > 1 ? Math.round((i * (arc.length - 1)) / (sections.length - 1)) : 0;
      el.dataset.tone = String(stop);
      el.querySelectorAll('[data-reveal]').forEach((c, j) => c.style.setProperty('--i', String(j)));
    });
    const motif = motifs[scene.motif] || motifs.drift;
    const ctx = {
      root, scene, sections, reduce: reduced(),
      layer: root.querySelector('.scenes__motif'),
      cleanups: [],
    };

    // Reveal once on entry.
    let io = null;
    if (ctx.reduce || !('IntersectionObserver' in window)) {
      sections.forEach((s) => s.classList.add('is-in'));
    } else {
      io = new IntersectionObserver((entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      }), { threshold: 0.12, rootMargin: '0px 0px -10% 0px' });
      sections.forEach((s) => io.observe(s));
    }

    // Cached geometry, refreshed on resize and when images settle.
    let tops = [];
    let heights = [];
    let docH = 1;
    const measure = () => {
      const y = window.scrollY;
      tops = sections.map((s) => s.getBoundingClientRect().top + y);
      heights = sections.map((s) => s.offsetHeight);
      docH = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    };
    let tone = -1;
    let queued = false;
    const frame = () => {
      queued = false;
      const y = window.scrollY;
      const vh = window.innerHeight;
      const pageP = clamp(y / docH);
      root.style.setProperty('--page-p', pageP.toFixed(4));
      let nearest = 0;
      let best = Infinity;
      const progress = sections.map((el, i) => {
        const p = clamp((y + vh - tops[i]) / (heights[i] + vh));
        if (!ctx.reduce) el.style.setProperty('--p', p.toFixed(4));
        const d = Math.abs(tops[i] + heights[i] / 2 - (y + vh / 2));
        if (d < best) { best = d; nearest = i; }
        return p;
      });
      const stop = Number(sections[nearest] && sections[nearest].dataset.tone) || 0;
      if (stop !== tone) {
        tone = stop;
        const t = arc[clamp(stop, 0, arc.length - 1)];
        root.style.setProperty('--arc-h', String(t.h));
        root.style.setProperty('--arc-s', String(t.s));
        root.dataset.activeScene = sections[nearest] ? (sections[nearest].dataset.scene || '') : '';
      }
      const el = sections[nearest];
      if (motif.update) motif.update(ctx, { pageP, progress, active: nearest, el, beat: (el && el.dataset.beat) || '' });
    };
    const request = () => { if (!queued) { queued = true; requestAnimationFrame(frame); } };
    const onResize = () => { measure(); request(); };

    measure();
    if (motif.mount) motif.mount(ctx);
    frame();
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', onResize);
    const ro = 'ResizeObserver' in window ? new ResizeObserver(onResize) : null;
    if (ro) ro.observe(root);
    root.querySelectorAll('img').forEach((img) => { if (!img.complete) img.addEventListener('load', onResize, { once: true }); });

    live = { io, ro, request, onResize, motif, ctx };
    return live;
  }

  function destroy() {
    if (!live) return;
    window.removeEventListener('scroll', live.request);
    window.removeEventListener('resize', live.onResize);
    if (live.io) live.io.disconnect();
    if (live.ro) live.ro.disconnect();
    if (live.motif.destroy) live.motif.destroy(live.ctx);
    live.ctx.cleanups.forEach((fn) => { try { fn(); } catch {} });
    live = null;
  }

  // A low-cost animation loop for canvas motifs: ~30fps, paused when the tab is hidden.
  function loop(ctx, draw) {
    let raf = 0;
    let last = 0;
    const tick = (t) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || t - last < 33) return;
      last = t;
      draw(t);
    };
    raf = requestAnimationFrame(tick);
    ctx.cleanups.push(() => cancelAnimationFrame(raf));
  }

  function canvas(ctx, scale = 0.5) {
    const c = document.createElement('canvas');
    c.className = 'scenes__canvas';
    ctx.layer.appendChild(c);
    const g = c.getContext('2d');
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2) * scale;
      c.width = Math.round(window.innerWidth * dpr);
      c.height = Math.round(window.innerHeight * dpr);
    };
    size();
    window.addEventListener('resize', size);
    ctx.cleanups.push(() => window.removeEventListener('resize', size));
    return { c, g };
  }

  const motifs = {
    // Gentle depth only: the default for motifs not drawn yet.
    drift: {},

    // 镜面 — the sky falls to the ground: a horizon rises, the lower half is the sky reflected,
    // stillest in the middle of the journey, then broken into glitter when the sun comes up.
    mirror: {
      mount(ctx) {
        const img = ctx.root.dataset.backdrop;
        ctx.layer.innerHTML = `
          <div class="mirror"><div class="mirror__sky" style="background-image:url('${img}')"></div>
          <div class="mirror__water" style="background-image:url('${img}')"></div>
          <div class="mirror__line"></div><div class="mirror__glitter">${Array.from({ length: 70 }, () => `<i style="left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 100).toFixed(1)}%;--s:${(Math.random() * 2.2 + 0.8).toFixed(1)}px;--d:${(Math.random() * 3).toFixed(2)}s"></i>`).join('')}</div></div>`;
      },
      update(ctx, { pageP, beat }) {
        const m = ctx.layer.firstElementChild;
        if (!m) return;
        // Dark before dawn, perfectly still at the entrance, broken into glitter once the sun is up.
        const target = { dark: [0.15, 0, 0.35], still: [1, 0, 1], flare: [0.35, 1, 1] }[beat];
        const [still, glitter, light] = ctx.reduce ? [1, 0, 1] : (target || [1 - Math.abs(smooth(0.1, 0.9, pageP) * 2 - 1), smooth(0.7, 0.9, pageP) * 0.6, 0.8]);
        m.style.setProperty('--horizon', `${(62 - pageP * 22).toFixed(2)}%`);
        m.style.setProperty('--still', still.toFixed(3));
        m.style.setProperty('--glitter', glitter.toFixed(3));
        m.style.setProperty('--light', light.toFixed(3));
      },
    },

    // 下行 — descending into the earth: daylight drains away, a depth gauge counts down, a
    // headlamp follows the pointer (or the middle on touch), and one scene turns the lamp off.
    descent: {
      mount(ctx) {
        ctx.layer.innerHTML = '<div class="descent"><div class="descent__dark"></div><div class="descent__lamp"></div><div class="descent__gauge" aria-hidden="true"><b>0</b><span>m</span><i></i></div></div>';
        const root = ctx.root;
        let px = 0.5;
        let py = 0.45;
        let queued = false;
        const apply = () => {
          queued = false;
          root.style.setProperty('--lx', `${(px * 100).toFixed(1)}%`);
          root.style.setProperty('--ly', `${(py * 100).toFixed(1)}%`);
        };
        const onMove = (e) => {
          if (e.pointerType === 'touch') return;
          px = e.clientX / window.innerWidth;
          py = e.clientY / window.innerHeight;
          if (!queued) { queued = true; requestAnimationFrame(apply); }
        };
        apply();
        if (!ctx.reduce) {
          window.addEventListener('pointermove', onMove, { passive: true });
          ctx.cleanups.push(() => window.removeEventListener('pointermove', onMove));
        }
      },
      update(ctx, { pageP, el }) {
        const d = ctx.layer.firstElementChild;
        if (!d) return;
        const depth = smooth(0.04, 0.7, pageP) * (1 - smooth(0.86, 1, pageP)); // back to daylight at the end
        const dark = el && el.hasAttribute('data-dark') ? 1 : 0;
        const vast = el && el.dataset.beat === 'vast' ? 1 : 0;
        d.style.setProperty('--depth', (vast ? depth * 0.75 : depth).toFixed(3));
        d.classList.toggle('is-vast', !!vast);
        ctx.root.style.setProperty('--lamp', dark ? '0' : vast ? '1.6' : (0.25 + depth * 0.75).toFixed(3));
        ctx.root.classList.toggle('is-lights-out', !!dark);
        const metres = Math.round(smooth(0, 0.8, pageP) * 47);
        const b = d.querySelector('.descent__gauge b');
        if (b && b.textContent !== `−${metres}`) b.textContent = `−${metres}`;
        d.querySelector('.descent__gauge i').style.transform = `scaleY(${smooth(0, 0.8, pageP).toFixed(3)})`;
      },
    },

    // 极光 — a polar sky: stars wheel slowly with the scroll, and aurora curtains gather,
    // brightest in the middle of the night.
    aurora: {
      mount(ctx) {
        const { c, g } = canvas(ctx, 0.5);
        const stars = Array.from({ length: 220 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.sqrt(Math.random()), s: Math.random() * 1.2 + 0.3, tw: Math.random() * 6 }));
        ctx.aurora = { glow: 0, turn: 0, sat: 85 };
        const draw = (t) => {
          const w = c.width;
          const h = c.height;
          const { glow, turn } = ctx.aurora;
          const light = document.documentElement.getAttribute('data-theme') === 'light';
          g.clearRect(0, 0, w, h);
          const cx = w * 0.72;
          const cy = -h * 0.15;
          const R = Math.hypot(w, h) * 1.1;
          g.fillStyle = light ? 'rgba(40,60,90,.55)' : 'rgba(235,245,255,.9)';
          for (const s of stars) {
            const a = s.a + turn;
            const x = cx + Math.cos(a) * s.r * R;
            const y = cy + Math.sin(a) * s.r * R;
            if (x < 0 || y < 0 || x > w || y > h) continue;
            g.globalAlpha = (0.35 + 0.65 * Math.abs(Math.sin(t / 900 + s.tw))) * (light ? 0.5 : 1);
            g.fillRect(x, y, s.s, s.s);
          }
          g.globalAlpha = 1;
          if (glow > 0.01) {
            // Curtains: a bright lower edge with rays fading upward, swaying slowly.
            g.globalCompositeOperation = light ? 'multiply' : 'screen';
            const sat = ctx.aurora.sat;
            for (let k = 0; k < 3; k++) {
              const base = h * (0.36 + k * 0.09);
              const hue = k === 2 ? 290 : 140 + k * 18;
              const edge = (x) => base + Math.sin(x / w * 5.2 + t / (3200 + k * 900) + k * 1.7) * h * 0.06 + Math.sin(x / w * 13 + t / 1700 + k) * h * 0.014;
              const grad = g.createLinearGradient(0, base - h * 0.42, 0, base + h * 0.04);
              grad.addColorStop(0, `hsla(${hue}, ${sat}%, 60%, 0)`);
              grad.addColorStop(0.75, `hsla(${hue}, ${sat}%, ${light ? 42 : 58}%, ${(0.22 - k * 0.05) * glow})`);
              grad.addColorStop(0.97, `hsla(${hue}, ${sat}%, ${light ? 40 : 72}%, ${(0.55 - k * 0.12) * glow})`);
              grad.addColorStop(1, `hsla(${hue}, ${sat}%, 70%, 0)`);
              g.fillStyle = grad;
              g.beginPath();
              g.moveTo(0, 0);
              for (let x = 0; x <= w; x += w / 64) g.lineTo(x, edge(x));
              g.lineTo(w, 0);
              g.closePath();
              g.fill();
              // Rays
              g.strokeStyle = `hsla(${hue}, ${sat}%, ${light ? 40 : 75}%, ${0.05 * glow})`;
              g.lineWidth = Math.max(1, w / 900);
              for (let x = 0; x < w; x += w / 90) {
                const y = edge(x);
                const len = h * (0.12 + 0.18 * Math.abs(Math.sin(x * 0.013 + t / 2100 + k)));
                g.beginPath();
                g.moveTo(x, y);
                g.lineTo(x, y - len);
                g.stroke();
              }
            }
            g.globalCompositeOperation = 'source-over';
          }
        };
        ctx.aurora.draw = draw;
        if (ctx.reduce) draw(0);
        else loop(ctx, draw);
      },
      update(ctx, { pageP, beat }) {
        if (!ctx.aurora) return;
        // Leaving the lights: only stars. A grey arc that could be cloud. Then green.
        const target = { dark: [0, 0], grey: [0.8, 6], flare: [1, 85] }[beat];
        const [glow, sat] = target || [smooth(0.2, 0.6, pageP) * 0.5, 60];
        ctx.aurora.glow = ctx.reduce ? 0.8 : glow;
        ctx.aurora.sat = ctx.reduce ? 80 : sat;
        ctx.aurora.turn = pageP * 0.6;
        if (ctx.reduce && ctx.aurora.draw) ctx.aurora.draw(0);
      },
    },
  };

  return { mount, destroy, motifs, smooth, clamp };
})();
