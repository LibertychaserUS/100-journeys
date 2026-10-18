/**
 * Lumi (小旅) — the lantern sprite, drawn in SVG so it stays crisp at any size and in both themes.
 *
 * Without a type Lumi is a small breathing flame. Once a traveller's type is known, Lumi takes
 * that type's form, built from a fixed grammar rather than sixteen unrelated drawings:
 *   group   → body:  NT crystal lantern · NF peach-blossom lantern · SJ paper lantern · SP flame
 *   E / I   → light: rays reaching out · a closed halo
 *   J / P   → pose:  upright and steady · tilted and swaying
 *   F       → warmth: blushing cheeks
 *   E / I   → also the mouth: an open smile · a quiet one
 *   type    → its own glass colour within the group's family, and one small keepsake
 * Colours here and in --lumi-* tokens are illustration only, never UI roles. Lumi.condense() plays
 * the moment a type is found: sparks gather into the flame, which becomes the type's form.
 */
var Lumi = (() => {
  const GROUP = { NT: 'crystal', NF: 'blossom', SJ: 'paper', SP: 'flame' };
  // Glass colour per type (top, bottom): cool crystals, blossom pinks, lantern reds, embers.
  const GLASS = {
    INTJ: ['#e0e9fb', '#7d9cd6'], INTP: ['#dcf4f2', '#62b8b9'], ENTJ: ['#e7e3fb', '#8b82d6'], ENTP: ['#ddf0fd', '#58a9e2'],
    INFJ: ['#efe4fb', '#b08ed8'], INFP: ['#ffe3e9', '#ee98ae'], ENFJ: ['#ffe5da', '#f09a78'], ENFP: ['#fff1d4', '#f2b456'],
    ISTJ: ['#f4dccb', '#b9694c'], ISFJ: ['#ffdccf', '#e48870'], ESTJ: ['#ffcbb4', '#d8523e'], ESFJ: ['#ffd8de', '#df667d'],
    ISTP: ['#fff0c6', '#d6a03f'], ISFP: ['#ffe3d0', '#ec8b67'], ESTP: ['#ffd99f', '#ee6c36'], ESFP: ['#ffeaa9', '#f29c38'],
  };
  const groupOf = (code) => (code[1] === 'N' ? `N${code[2]}` : `S${code[3]}`);
  let uid = 0;

  const bodies = {
    crystal: (id) => `
      <path class="lumi__body" fill="url(#${id}-b)" d="M60 20 L89 38 L89 80 L60 102 L31 80 L31 38 Z"/>
      <path class="lumi__facet" d="M60 20 L60 50 M31 38 L60 50 L89 38 M60 50 L60 64" />
      <path class="lumi__shine" d="M40 44 L52 37" />`,
    blossom: (id) => {
      const petals = Array.from({ length: 5 }, (_, i) => {
        const a = (-90 + i * 72) * Math.PI / 180;
        return `<circle cx="${(60 + Math.cos(a) * 22).toFixed(1)}" cy="${(64 + Math.sin(a) * 22).toFixed(1)}" r="17"/>`;
      }).join('');
      return `
      <g class="lumi__body lumi__petals" fill="url(#${id}-b)">${petals}</g>
      <circle class="lumi__body" fill="url(#${id}-c)" cx="60" cy="64" r="22"/>`;
    },
    paper: (id, t) => `
      <rect class="lumi__cap" x="47" y="${t ? 25 : 24}" width="26" height="7" rx="${t ? 1 : 3.5}"/>
      <ellipse class="lumi__body" fill="url(#${id}-b)" cx="60" cy="64" rx="31" ry="34"/>
      <path class="lumi__rib" d="M60 30 C44 40 44 88 60 98 M60 30 C76 40 76 88 60 98 M60 30 C34 42 34 86 60 98 M60 30 C86 42 86 86 60 98"/>
      <rect class="lumi__cap" x="47" y="${t ? 96 : 95}" width="26" height="7" rx="${t ? 1 : 3.5}"/>
      <path class="lumi__tassel" d="M60 103 L60 113"/>`,
    flame: (id, t) => `
      <path class="lumi__body" fill="url(#${id}-b)" d="${t
        ? 'M62 16 L84 52 C92 66 90 88 76 98 C68 104 52 104 44 98 C30 88 30 66 40 54 L52 40 L56 50 Z'
        : 'M62 16 C74 34 90 52 88 76 C86 96 72 104 60 104 C46 104 32 96 32 78 C32 62 44 52 50 40 C52 46 54 50 58 52 C58 40 60 28 62 16 Z'}"/>
      <path class="lumi__inner" d="M60 58 C66 66 70 74 68 84 C66 92 54 92 52 84 C50 76 56 70 60 58 Z"/>`,
  };

  const props = {
    INTJ: '<path d="M0 14 L14 14 L0 0 Z M4 10 L7 10 L4 7 Z"/>',
    INTP: '<circle cx="7" cy="7" r="2.6"/><ellipse cx="7" cy="7" rx="8" ry="3.2" fill="none" transform="rotate(-30 7 7)"/>',
    ENTJ: '<path d="M2 15 L2 0 M2 1 L13 4.5 L2 8" />',
    ENTP: '<path d="M8 0 L2 8 L7 8 L4 15 L12 6 L7 6 Z"/>',
    INFJ: '<path d="M10 1 A7 7 0 1 0 14 12 A5.5 5.5 0 1 1 10 1 Z"/>',
    INFP: '<path d="M3 13 A3.5 3.5 0 0 1 3.5 6 A5 5 0 0 1 13 6.5 A3.3 3.3 0 0 1 13 13 Z"/>',
    ENFJ: '<circle cx="7.5" cy="7.5" r="3.6"/><path d="M7.5 0 V2 M7.5 13 V15 M0 7.5 H2 M13 7.5 H15 M2.2 2.2 L3.6 3.6 M11.4 11.4 L12.8 12.8 M2.2 12.8 L3.6 11.4 M11.4 3.6 L12.8 2.2"/>',
    ENFP: '<path d="M5 0 L6.3 3.7 L10 5 L6.3 6.3 L5 10 L3.7 6.3 L0 5 L3.7 3.7 Z M12 8 L12.8 10.2 L15 11 L12.8 11.8 L12 14 L11.2 11.8 L9 11 L11.2 10.2 Z"/>',
    ISTJ: '<circle cx="4.5" cy="4.5" r="3.5" fill="none"/><path d="M7 7 L14 14 M11 11 L13 9 M12.5 12.5 L14.5 10.5"/>',
    ISFJ: '<path d="M1 14 C1 6 6 1 14 1 C14 9 9 14 1 14 Z M1 14 L9 6"/>',
    ESTJ: '<path d="M7.5 1 C3.5 1 3 5 3 8 L1.5 11.5 H13.5 L12 8 C12 5 11.5 1 7.5 1 Z M6 13 A1.8 1.8 0 0 0 9 13"/>',
    ESFJ: '<path d="M7.5 14 C3 10.5 0.5 8 0.5 5 A3.4 3.4 0 0 1 7.5 3.4 A3.4 3.4 0 0 1 14.5 5 C14.5 8 12 10.5 7.5 14 Z"/>',
    ISTP: '<path d="M7.5 0.5 L13.6 4 L13.6 11 L7.5 14.5 L1.4 11 L1.4 4 Z"/><circle cx="7.5" cy="7.5" r="2.6" class="lumi__prop-hole"/>',
    ISFP: '<path d="M13.5 1 C6 2 2 8 1.5 14 C5 10 9 8 13.5 1 Z M1.5 14 L8 6.5"/>',
    ESTP: '<path d="M1 14 L13 2 M6 2 H13 V9"/>',
    ESFP: '<path d="M5 12 V2 L13 0.5 V10.5" fill="none"/><circle cx="3.2" cy="12" r="2.4"/><circle cx="11.2" cy="10.5" r="2.4"/>',
  };

  function defs(id, group, glass) {
    const [top, bottom] = glass || [`var(--lumi-${group}-1)`, `var(--lumi-${group}-2)`];
    return `<defs>
      <radialGradient id="${id}-g"><stop offset="0" style="stop-color:var(--lumi-glow);stop-opacity:.55"/><stop offset="1" style="stop-color:var(--lumi-glow);stop-opacity:0"/></radialGradient>
      <linearGradient id="${id}-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${top}"/><stop offset="1" style="stop-color:${bottom}"/></linearGradient>
      <radialGradient id="${id}-c" cx=".5" cy=".42" r=".6"><stop offset="0" style="stop-color:var(--lumi-core)"/><stop offset="1" style="stop-color:${top}"/></radialGradient>
      <radialGradient id="${id}-f" cx=".5" cy=".6" r=".6"><stop offset="0" style="stop-color:var(--lumi-core)"/><stop offset=".7" style="stop-color:var(--lumi-flame-1)"/><stop offset="1" style="stop-color:var(--lumi-flame-2)"/></radialGradient>
    </defs>`;
  }

  // mouth: 'open' (a small open smile), 'quiet' (a soft closed curve) or '' for none.
  const face = (cheeks, y = 66, mouth = '') => `
    <g class="lumi__face">
      <g class="lumi__eyes"><ellipse cx="52" cy="${y}" rx="3" ry="3.6"/><ellipse cx="68" cy="${y}" rx="3" ry="3.6"/></g>
      ${cheeks ? `<ellipse class="lumi__cheek" cx="45" cy="${y + 6}" rx="4" ry="2.4"/><ellipse class="lumi__cheek" cx="75" cy="${y + 6}" rx="4" ry="2.4"/>` : ''}
      ${mouth === 'open' ? `<path class="lumi__mouth" d="M56 ${y + 6} Q60 ${y + 12} 64 ${y + 6} Z"/>` : ''}
      ${mouth === 'quiet' ? `<path class="lumi__mouth lumi__mouth--line" d="M56.5 ${y + 7} Q60 ${y + 9.5} 63.5 ${y + 7}"/>` : ''}
    </g>`;

  /** The type-less guide: a small flame with a face and three drifting sparks. */
  function idle(id) {
    return `${defs(id, 'flame')}
      <circle class="lumi__glow" cx="60" cy="66" r="56" fill="url(#${id}-g)"/>
      <g class="lumi__float">
        <path class="lumi__body" fill="url(#${id}-f)" d="M60 22 C68 36 84 50 84 72 C84 88 73 98 60 98 C47 98 36 88 36 72 C36 56 50 46 54 34 C56 40 58 42 60 44 C59 36 59 30 60 22 Z"/>
        ${face(true, 72)}
      </g>
      <g class="lumi__sparks"><circle cx="24" cy="44" r="2"/><circle cx="98" cy="36" r="1.6"/><circle cx="94" cy="92" r="1.8"/></g>`;
  }

  function form(id, code) {
    const group = GROUP[groupOf(code)];
    const extro = code[0] === 'E';
    const judging = code[3] === 'J';
    const feeling = code[2] === 'F';
    const thinking = code[2] === 'T';
    const light = extro
      ? `<g class="lumi__rays">${Array.from({ length: 8 }, (_, i) => `<path transform="rotate(${i * 45} 60 64)" d="M60 6 L60 13"/>`).join('')}</g>`
      : '<circle class="lumi__halo" cx="60" cy="64" r="52"/>';
    return `${defs(id, group, GLASS[code])}
      <circle class="lumi__glow" cx="60" cy="64" r="58" fill="url(#${id}-g)"/>
      ${light}
      <g class="lumi__float lumi__pose--${judging ? 'steady' : 'sway'}">
        ${bodies[group](id, thinking)}
        ${face(feeling, 66, extro ? 'open' : 'quiet')}
        <g class="lumi__prop" transform="translate(73 3) scale(1.4)">${props[code] || ''}</g>
      </g>`;
  }

  /**
   * SVG markup for Lumi. code: an MBTI code for that type's form, or '' for the guide's own flame.
   * opts.label gives it an accessible name; without one it is decorative.
   */
  function svg(code = '', { size = 64, label = '', still = false } = {}) {
    const id = `lumi${++uid}`;
    const valid = /^[EI][NS][TF][JP]$/.test(code || '');
    const a11y = label ? `role="img" aria-label="${UI.esc(label)}"` : 'aria-hidden="true" focusable="false"';
    return `<svg class="lumi ${valid ? `lumi--form lumi--${GROUP[groupOf(code)]}` : 'lumi--idle'}${still ? ' lumi--still' : ''}" viewBox="0 0 120 120" width="${size}" height="${size}" ${a11y} data-lumi="${valid ? code : ''}">${valid ? form(id, code) : idle(id)}</svg>`;
  }

  /**
   * Plays the condensing moment inside el: the flame draws in a ring of sparks, flares, and
   * becomes code's form. Resolves when done; with reduced motion the form simply appears.
   */
  function condense(el, code, { size = 160, label = '' } = {}) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { el.innerHTML = svg(code, { size, label }); return Promise.resolve(); }
    const sparks = Array.from({ length: 18 }, (_, i) => {
      const a = (i / 18) * Math.PI * 2 + Math.random() * 0.3;
      const r = size * (0.55 + Math.random() * 0.25);
      return `<i style="--dx:${(Math.cos(a) * r).toFixed(0)}px;--dy:${(Math.sin(a) * r).toFixed(0)}px;--d:${(Math.random() * 260).toFixed(0)}ms"></i>`;
    }).join('');
    el.innerHTML = `<span class="lumi-condense" style="--size:${size}px">
      <span class="lumi-condense__from">${svg('', { size })}</span>
      <span class="lumi-condense__sparks" aria-hidden="true">${sparks}</span>
      <span class="lumi-condense__flash" aria-hidden="true"></span>
      <span class="lumi-condense__to">${svg(code, { size, label })}</span>
    </span>`;
    const wrap = el.firstElementChild;
    requestAnimationFrame(() => wrap.classList.add('is-on'));
    return new Promise((resolve) => setTimeout(() => {
      el.innerHTML = svg(code, { size, label });
      resolve();
    }, 1500));
  }

  return { svg, condense, group: (code) => GROUP[groupOf(code)] };
})();
