/**
 * ui.js — shared UI building blocks: icons, escaping, labels, the journey card,
 * toasts, the modal sheet, and the signed-in session cache.
 */
const UI = (() => {
  const ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
    share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    send: '<path d="M4 12 20 4l-6 16-3-7-7-1z"/>',
    pin: '<path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  };

  function icon(name, cls = '') {
    return `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const fantasyTypes = ['solitude', 'extreme', 'spiritual', 'night', 'visual', 'culture'];
  const fantasyLabel = (type) => (fantasyTypes.includes(type) ? t(`fantasy.${type}`) : t('fantasy.visual'));
  const tagLabel = (tag) => {
    const key = `tag.${tag.slug}`;
    const label = t(key);
    return label === key ? tag.name : label;
  };
  const region = (j) => (I18n.lang === 'zh' ? String(j.region || '').replace(/\s*·\s*/g, '·') : String(j.region || ''));
  const topMbti = (j) => ((j.mbti_types || [])[0] || {}).mbti_type?.code || '';
  const coins = (n) => `${I18n.num(n)} ${t('common.coins')}`;

  function meter(value, max = 10) {
    const on = Math.round((Math.max(0, Math.min(max, value || 0)) / max) * 5);
    const dots = [0, 1, 2, 3, 4].map((i) => `<b class="${i < on ? 'on' : ''}"></b>`).join('');
    return `<span class="meter" role="img" aria-label="${esc(t('card.adventureAria', { n: value || 0 }))}">${esc(t('card.adventure'))}<span class="meter__dots">${dots}</span></span>`;
  }

  // Responsive images: generated JPEGs ship AVIF derivatives at fixed widths
  // (scripts/images/derive.py); browsers without AVIF, and other images, use the plain <img>.
  const DERIVED = [
    [/\/generated\/[^/]+\/cover\.jpg$/, [480, 720, 1120]],
    [/\/generated\/card-[^/]+\.jpg$/, [480, 720]],
    [/\/generated\/[^/]+\/(hero|scene-1|scene-2)\.jpg$/, [960, 1536]],
    [/\/generated\/[^/]+\/scene-3\.jpg$/, [600, 960]],
    [/\/generated\/[^/]+\/fork\.jpg$/, [600, 1024]],
    [/\/generated\/[^/]+\/ending\.jpg$/, [600]],
    [/\/generated\/road\/station-hall-(night|dawn)\.jpg$/, [960, 1536]],
    [/\/generated\/road\/station-hall-(night|dawn)-phone\.jpg$/, [600, 1024]],
    [/\/generated\/road\/realm-band-[a-z-]+\.jpg$/, [600, 1200]],
    [/\/generated\/road\/rubbing-stone\.jpg$/, [960, 1536]],
    [/\/generated\/hero-taoyuan\.jpg$/, [960, 1600]],
  ];
  function picture(src, { sizes = '100vw', alt = '', cls = '', eager = false, width, height, attrs = '' } = {}) {
    const rule = DERIVED.find(([re]) => re.test(String(src || '')));
    const dims = `${width ? ` width="${width}"` : ''}${height ? ` height="${height}"` : ''}`;
    const img = `<img src="${esc(src)}" alt="${esc(alt)}"${dims} loading="${eager ? 'eager' : 'lazy'}" decoding="async"${eager ? ' fetchpriority="high"' : ''}${cls ? ` class="${cls}"` : ''} ${attrs}>`;
    if (!rule) return img;
    const base = String(src).replace(/\.jpg$/, '');
    const set = (ext) => rule[1].map((w) => `${esc(base)}.${w}.${ext} ${w}w`).join(', ');
    return `<picture><source type="image/avif" srcset="${set('avif')}" sizes="${sizes}">${img}</picture>`;
  }

  function journeyCard(j, { eager = false } = {}) {
    const mood = (j.mood_keywords || [])[0];
    return `
      <a class="journey-card" href="#/journey/${encodeURIComponent(j.slug)}" data-slug="${esc(j.slug)}" data-testid="journey-card">
        <div class="journey-card__media">
          ${picture(j.image_url, { sizes: '(max-width: 760px) 50vw, (max-width: 1200px) 33vw, 300px', width: 720, height: 900, eager })}
        </div>
        <div class="journey-card__body">
          <div class="journey-card__meta">
            ${mood ? `<span class="tag-mood">${esc(mood)}</span>` : ''}
            <span class="region">${esc(region(j))}</span>
          </div>
          <h3 class="journey-card__title">${esc(j.title)}</h3>
          ${j.story_hook ? `<p class="journey-card__hook">${esc(j.story_hook)}</p>` : ''}
          <div class="journey-card__foot">
            <span class="price">${I18n.num(j.price)}<small>${esc(t('common.coins'))}</small></span>
            ${meter(j.adventure_index)}
          </div>
        </div>
      </a>`;
  }

  function skeletonCards(count) {
    return Array.from({ length: count }, () => `
      <div class="journey-card journey-card--skeleton" aria-hidden="true">
        <div class="journey-card__media skeleton"></div>
        <div class="journey-card__body"><div class="line skeleton" style="width:40%"></div><div class="line skeleton" style="width:85%"></div><div class="line skeleton" style="width:60%"></div></div>
      </div>`).join('');
  }

  // Pointer-following lantern glow on cards (one delegated listener).
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest && e.target.closest('.journey-card');
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });

  /** Page title and description (the server renders share tags for /j/:slug). */
  function setMeta({ title, description } = {}) {
    document.title = title ? `${title} · ${t('brand')}` : t('meta.title');
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', description || t('meta.description'));
  }

  // Journey cards prefetch on hover, focus or press, and lend their image to the detail page's
  // opening (a shared-element view transition) when clicked.
  const cardSel = 'a[href^="#/journey/"]';
  const slugOf = (a) => decodeURIComponent((a.getAttribute('href') || '').replace('#/journey/', '').split('?')[0]);
  ['pointerover', 'focusin', 'pointerdown'].forEach((type) => document.addEventListener(type, (e) => {
    const a = e.target.closest && e.target.closest(cardSel);
    if (a) API.prefetchJourney(slugOf(a));
  }, { passive: true }));
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest(cardSel);
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
    document.querySelectorAll('[style*="view-transition-name"]').forEach((el) => { el.style.viewTransitionName = ''; });
    const img = a.querySelector('img');
    if (img) img.style.viewTransitionName = 'journey-hero';
  });

  function trackCardClicks(root) {
    root.addEventListener('click', (e) => {
      const card = e.target.closest('[data-slug]');
      if (card && card.matches('a')) API.track('journey_click', card.dataset.slug);
    });
  }

  // --- Toasts ---
  function toast(message, action) {
    const region = document.getElementById('toast-region');
    if (!region) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.innerHTML = `<span>${esc(message)}</span>${action ? `<a href="${esc(action.href)}">${esc(action.label)}</a>` : ''}`;
    region.replaceChildren(el);
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => el.remove(), 4200);
  }

  // --- Modal sheet: focus-trapped, Esc / backdrop to close, restores focus ---
  function sheet({ label, render, onClose, wide = false }) {
    const opener = document.activeElement;
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.innerHTML = `<div class="sheet ${wide ? 'sheet--wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(label)}" tabindex="-1"></div>`;
    const box = scrim.firstElementChild;
    document.body.appendChild(scrim);
    document.body.style.overflow = 'hidden';

    const onRoute = () => api.close();
    const api = {
      el: box,
      set(html) { box.innerHTML = html; focusFirst(); },
      close() {
        if (!scrim.isConnected) return;
        scrim.remove();
        document.body.style.overflow = '';
        document.removeEventListener('keydown', onKey, true);
        window.removeEventListener('route:changed', onRoute);
        if (opener && opener.focus && opener.isConnected) opener.focus();
        if (onClose) onClose();
      },
    };
    const focusables = () => [...box.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')];
    function focusFirst() {
      const target = box.querySelector('[data-autofocus]') || focusables()[0] || box;
      target.focus();
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); api.close(); return; }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey, true);
    // A sheet belongs to the page that opened it; leaving the page closes it.
    setTimeout(() => { if (scrim.isConnected) window.addEventListener('route:changed', onRoute); }, 0);
    scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) api.close(); });
    box.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) api.close(); });
    api.set(render(api));
    return api;
  }

  return {
    icon, esc, fantasyTypes, fantasyLabel, tagLabel, region, topMbti, coins, meter,
    journeyCard, skeletonCards, trackCardClicks, toast, sheet, setMeta, picture,
  };
})();

/** MBTI reference data (names and traits) in both languages. */
const MBTI = (() => {
  const groups = { nt: ['INTJ', 'INTP', 'ENTJ', 'ENTP'], nf: ['INFJ', 'INFP', 'ENFJ', 'ENFP'], sj: ['ISTJ', 'ISFJ', 'ESTJ', 'ESFJ'], sp: ['ISTP', 'ISFP', 'ESTP', 'ESFP'] };
  const data = {
    INTJ: ['建筑师', 'Architect', '策略型探索者，偏爱计划和深度。', 'A strategic explorer who loves a plan with depth.'],
    INTP: ['逻辑学家', 'Logician', '好奇的分析者，追求知识与新奇。', 'A curious analyst chasing knowledge and novelty.'],
    ENTJ: ['指挥官', 'Commander', '果断的领队，追求效率与目标。', 'A decisive leader who travels with a goal.'],
    ENTP: ['辩论家', 'Debater', '爱挑战的发明家，越陌生越兴奋。', 'An inventive challenger who gets excited by the unfamiliar.'],
    INFJ: ['提倡者', 'Advocate', '安静的理想主义者，寻求深层连接。', 'A quiet idealist looking for deep connection.'],
    INFP: ['调停者', 'Mediator', '理想主义的旅行家，追求意义和内在体验。', 'An idealistic traveller after meaning and inner experience.'],
    ENFJ: ['主人公', 'Protagonist', '有感染力的同行者，关注身边的人。', 'A warm companion who brings people along.'],
    ENFP: ['竞选者', 'Campaigner', '热情的冒险家，渴望新鲜体验。', 'An enthusiastic adventurer hungry for new experiences.'],
    ISTJ: ['物流师', 'Logistician', '务实的组织者，偏爱结构清晰的行程。', 'A practical organiser who likes a clear itinerary.'],
    ISFJ: ['守卫者', 'Defender', '细致体贴的旅行者，注重安全和舒适。', 'A thoughtful traveller who values safety and comfort.'],
    ESTJ: ['总经理', 'Executive', '务实的管理者，重视秩序与传统。', 'A practical manager who respects order and tradition.'],
    ESFJ: ['执政官', 'Consul', '热心的合作者，关注和谐与关怀。', 'A caring collaborator who keeps the group happy.'],
    ISTP: ['鉴赏家', 'Virtuoso', '冷静的实验者，擅长动手和观察。', 'A calm experimenter, good with hands and eyes.'],
    ISFP: ['探险家', 'Adventurer', '灵活的艺术家，享受当下的感官体验。', 'A flexible artist living in the senses.'],
    ESTP: ['企业家', 'Entrepreneur', '活力四射的实干家，活在当下。', 'An energetic doer who lives in the moment.'],
    ESFP: ['表演者', 'Entertainer', '自在的表演者，热爱社交和乐趣。', 'A spontaneous entertainer who loves people and fun.'],
  };
  const codes = Object.keys(data);
  const name = (code) => (data[code] ? data[code][I18n.lang === 'zh' ? 0 : 1] : code);
  const trait = (code) => (data[code] ? data[code][I18n.lang === 'zh' ? 2 : 3] : '');
  return { groups, codes, name, trait, valid: (code) => !!data[code] };
})();

/** Session — cached signed-in user, shared by nav and pages. */
const Session = (() => {
  let user = null;
  let pending = null;
  async function load(force = false) {
    if (!API.isLoggedIn()) { user = null; return null; }
    if (user && !force) return user;
    if (!pending) {
      pending = API.me()
        .then((res) => { user = res.data; return user; })
        .catch(() => { user = null; return null; })
        .finally(() => { pending = null; });
    }
    return pending;
  }
  async function refresh() {
    const u = await load(true);
    window.dispatchEvent(new CustomEvent('session:updated', { detail: u }));
    return u;
  }
  function signOut() {
    API.clearToken();
    user = null;
    window.dispatchEvent(new CustomEvent('session:updated', { detail: null }));
  }
  window.addEventListener('auth:changed', () => { user = null; refresh(); });
  return { load, refresh, signOut, get user() { return user; } };
})();
