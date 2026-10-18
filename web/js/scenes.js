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


  // Extra motifs share helpers: the active beat, and one value eased toward a target.
  const beatOf = (b, map, fallback) => (b && map[b] != null ? map[b] : fallback);
  const ease = (cur, target, k = 0.08) => cur + (target - cur) * k;
  const isLight = () => document.documentElement.getAttribute('data-theme') === 'light';

  Object.assign(motifs, {
    // 星轨 — a long exposure: stars wheel round the pole and their trails lengthen as the night goes on.
    'sky-rotate': {
      mount(ctx) {
        const { c, g } = canvas(ctx, 0.5);
        const stars = Array.from({ length: 260 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.pow(Math.random(), 0.7), s: Math.random() * 1.1 + 0.4, hue: Math.random() < 0.2 ? 30 : 210 }));
        ctx.sky = { turn: 0, trail: 0.02, glow: 0.4, cur: { trail: 0.02, glow: 0.4 } };
        const draw = () => {
          const w = c.width;
          const h = c.height;
          const st = ctx.sky;
          st.cur.trail = ease(st.cur.trail, st.trail);
          st.cur.glow = ease(st.cur.glow, st.glow);
          g.clearRect(0, 0, w, h);
          const cx = w * 0.5;
          const cy = h * 0.12;
          const R = Math.hypot(w, h);
          const light = isLight();
          g.lineCap = 'round';
          for (const p of stars) {
            const r = p.r * R;
            const a0 = p.a + st.turn;
            g.strokeStyle = `hsla(${p.hue}, 60%, ${light ? 35 : 88}%, ${(light ? 0.35 : 0.75) * st.cur.glow + 0.15})`;
            g.lineWidth = p.s;
            g.beginPath();
            g.arc(cx, cy, r, a0, a0 + st.cur.trail);
            g.stroke();
          }
          // The band of the Milky Way, brightest at the full moment.
          const band = g.createLinearGradient(0, h * 0.9, w, h * 0.1);
          band.addColorStop(0.35, 'rgba(255,255,255,0)');
          band.addColorStop(0.5, `rgba(${light ? '120,110,160' : '230,225,255'}, ${0.12 * st.cur.glow})`);
          band.addColorStop(0.65, 'rgba(255,255,255,0)');
          g.fillStyle = band;
          g.fillRect(0, 0, w, h);
        };
        ctx.sky.draw = draw;
        if (ctx.reduce) { ctx.sky.trail = ctx.sky.cur.trail = 0.35; draw(); } else loop(ctx, draw);
      },
      update(ctx, { pageP, beat }) {
        if (!ctx.sky) return;
        ctx.sky.turn = pageP * 0.9;
        ctx.sky.trail = ctx.reduce ? 0.35 : 0.02 + smooth(0.05, 0.95, pageP) * 0.9;
        ctx.sky.glow = beatOf(beat, { dark: 1, grey: 0.6, flare: 1.4, vast: 1.2, still: 0.8 }, 0.5 + pageP * 0.5);
        if (ctx.reduce && ctx.sky.draw) ctx.sky.draw();
      },
    },

    // 雾 — layers of mist drift; thick in the dark, thinning as you climb, parting round a warm light.
    mist: {
      mount(ctx) {
        ctx.layer.innerHTML = `<div class="mist">${[0, 1, 2, 3].map((i) => `<i class="mist__bank mist__bank--${i}"></i>`).join('')}<b class="mist__light"></b></div>`;
      },
      update(ctx, { pageP, beat }) {
        const m = ctx.layer.firstElementChild;
        if (!m) return;
        const fog = beatOf(beat, { dark: 1, still: 0.85, grey: 0.75, flare: 0.25, vast: 0.15 }, 0.9 - pageP * 0.5);
        const light = beatOf(beat, { flare: 1, vast: 0.7, grey: 0.3 }, smooth(0.6, 1, pageP) * 0.5);
        m.style.setProperty('--fog', fog.toFixed(3));
        m.style.setProperty('--glow', light.toFixed(3));
        m.style.setProperty('--rise', `${(-pageP * 18).toFixed(2)}vh`);
      },
    },

    // 潮 — the water rises up the page; light shafts and caustics below the surface.
    tide: {
      mount(ctx) {
        ctx.layer.innerHTML = `<div class="tide"><div class="tide__water"><svg class="tide__surface" viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 20 Q 75 6 150 20 T 300 20 T 450 20 T 600 20 T 750 20 T 900 20 T 1050 20 T 1200 20 V40 H0 Z"/></svg><i class="tide__caustics"></i><i class="tide__rays"></i></div></div>`;
      },
      update(ctx, { pageP, beat }) {
        const t = ctx.layer.firstElementChild;
        if (!t) return;
        const level = beatOf(beat, { dark: 0.85, vast: 1, flare: 0.75, still: 0.6 }, 0.08 + smooth(0, 0.85, pageP) * 0.8);
        t.style.setProperty('--level', (ctx.reduce ? 0.5 : level).toFixed(3));
        t.style.setProperty('--rays', beatOf(beat, { flare: 1, vast: 0.8, still: 0.5 }, 0.3).toFixed(2));
      },
    },

    // 辙 — snow falls; a sled track is drawn down the page, the snowfall thinning in the clear.
    track: {
      mount(ctx) {
        const { c, g } = canvas(ctx, 0.5);
        const flakes = Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + 0.6, v: Math.random() * 0.4 + 0.3, sway: Math.random() * 6 }));
        ctx.snow = { rate: 1, cur: 1 };
        ctx.layer.insertAdjacentHTML('beforeend', '<svg class="track" viewBox="0 0 100 1000" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M92 0 C 86 120, 97 220, 90 340 S 84 560, 92 680 S 96 880, 89 1000"/><path pathLength="1" d="M94.5 0 C 88.5 120, 99.5 220, 92.5 340 S 86.5 560, 94.5 680 S 98.5 880, 91.5 1000"/></svg>');
        const draw = (t) => {
          const w = c.width;
          const h = c.height;
          ctx.snow.cur = ease(ctx.snow.cur, ctx.snow.rate, 0.05);
          g.clearRect(0, 0, w, h);
          g.fillStyle = isLight() ? 'rgba(120,140,170,.55)' : 'rgba(245,250,255,.85)';
          for (const f of flakes) {
            if (!ctx.reduce) {
              f.y += (f.v * ctx.snow.cur) / 260;
              if (f.y > 1.02) { f.y = -0.02; f.x = Math.random(); }
            }
            const x = (f.x + Math.sin(t / 1400 + f.sway) * 0.01) * w;
            g.globalAlpha = 0.25 + 0.75 * Math.min(1, ctx.snow.cur);
            g.beginPath();
            g.arc(x, f.y * h, f.r, 0, Math.PI * 2);
            g.fill();
          }
          g.globalAlpha = 1;
        };
        ctx.snow.draw = draw;
        if (ctx.reduce) draw(0); else loop(ctx, draw);
      },
      update(ctx, { pageP, beat }) {
        const svg = ctx.layer.querySelector('.track');
        if (svg) svg.style.setProperty('--drawn', (ctx.reduce ? 1 : smooth(0.02, 0.95, pageP)).toFixed(4));
        if (ctx.snow) ctx.snow.rate = beatOf(beat, { dark: 1.6, still: 0.15, flare: 0.05, vast: 0.3, grey: 0.8 }, 1);
      },
    },

    // 路线 — an old route is drawn as you go; each chapter lights the next milestone.
    map: {
      mount(ctx) {
        const n = ctx.sections.length;
        const pts = ctx.sections.map((_, i) => ({ x: 88 + ((i * 5) % 4) * 2 - 3, y: 40 + (i * 920) / Math.max(1, n - 1) })); // the right margin
        const d = pts.map((p, i) => (i ? `S ${p.x - 5} ${p.y - 60}, ${p.x} ${p.y}` : `M ${p.x} ${p.y}`)).join(' ');
        ctx.layer.innerHTML = `<div class="map"><i class="map__contours"></i><svg class="map__route" viewBox="0 0 100 1000" preserveAspectRatio="none" aria-hidden="true"><path class="map__ghost" d="${d}"/><path class="map__line" pathLength="1" d="${d}"/></svg>${pts.map((p, i) => `<i class="map__stop" data-i="${i}" style="left:${p.x}%;top:${(p.y / 10).toFixed(2)}%"></i>`).join('')}</div>`;
      },
      update(ctx, { pageP, active, beat }) {
        const m = ctx.layer.firstElementChild;
        if (!m) return;
        m.style.setProperty('--drawn', (ctx.reduce ? 1 : smooth(0, 0.98, pageP)).toFixed(4));
        m.style.setProperty('--contours', beatOf(beat, { vast: 0.15, flare: 0.5, dark: 0.9 }, 0.6).toFixed(2));
        m.querySelectorAll('.map__stop').forEach((c) => c.classList.toggle('is-passed', Number(c.dataset.i) <= active));
      },
    },

    // 升 — balloons lift off at dawn and climb as you scroll, catching the sun at the full moment.
    rise: {
      mount(ctx) {
        const balloons = Array.from({ length: 11 }, (_, i) => {
          const size = 18 + Math.random() * 46;
          const side = i % 2 ? 78 + Math.random() * 18 : 2 + Math.random() * 18; // outer bands only
          return `<i class="rise__b" style="--x:${side.toFixed(1)}%;--s:${size.toFixed(0)}px;--speed:${(0.5 + size / 60).toFixed(2)};--h:${[14, 28, 350, 42, 200][i % 5]};--delay:${(i / 11).toFixed(2)}"></i>`;
        }).join('');
        ctx.layer.innerHTML = `<div class="rise"><b class="rise__sun"></b>${balloons}</div>`;
      },
      update(ctx, { pageP, beat }) {
        const r = ctx.layer.firstElementChild;
        if (!r) return;
        r.style.setProperty('--lift', (ctx.reduce ? 0.5 : pageP).toFixed(4));
        r.style.setProperty('--sun', beatOf(beat, { flare: 1, vast: 0.8, still: 0.5, dark: 0 }, smooth(0.2, 0.7, pageP)).toFixed(3));
      },
    },
  });

  return { mount, destroy, motifs, smooth, clamp };
})();
