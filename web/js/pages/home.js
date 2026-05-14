/**
 * Home page controller
 * Minimal brand-led discovery surface for fantasy travel inspiration.
 */
var Pages = window.Pages || {};

Pages.Home = {
  _sceneIndex: 0,
  _sceneTimer: null,
  _particleFrame: null,
  _particles: [],
  _particleHero: null,
  _resizeHandler: null,
  _pointerMoveHandler: null,
  _pointerLeaveHandler: null,
  _imageMap: {
    'bolivia-salt-flat-trek': '/static/assets/images/generated/card-salt-mirror.jpg',
    'iceland-lava-tunnel-cycling': '/static/assets/images/generated/card-lava-tunnel.jpg',
    'japan-onsen-temple-meditation': '/static/assets/images/generated/card-temple-onsen.jpg',
    'morocco-sahara-camel-camp': '/static/assets/images/generated/card-sahara-stars.jpg',
    'greenland-dog-sled-solo': '/static/assets/images/generated/card-greenland-sled.jpg',
    'norway-aurora-hunt': '/static/assets/images/generated/card-sahara-stars.jpg',
    'new-zealand-milford-kayak': '/static/assets/images/generated/card-lava-tunnel.jpg',
    'patagonia-torres-del-paine-trek': '/static/assets/images/generated/card-greenland-sled.jpg',
    'turkey-cappadocia-balloon': '/static/assets/images/generated/card-city-rules.jpg',
    'peru-machu-picchu-inca-trail': '/static/assets/images/generated/card-city-rules.jpg',
    'namibia-deadvlei-stars': '/static/assets/images/generated/card-sahara-stars.jpg',
    'maldives-underwater-dining': '/static/assets/images/generated/card-salt-mirror.jpg',
  },
  _fallbackImages: [
    '/static/assets/images/generated/card-salt-mirror.jpg',
    '/static/assets/images/generated/card-lava-tunnel.jpg',
    '/static/assets/images/generated/card-temple-onsen.jpg',
    '/static/assets/images/generated/card-sahara-stars.jpg',
    '/static/assets/images/generated/card-greenland-sled.jpg',
    '/static/assets/images/generated/card-city-rules.jpg',
  ],
  _instantJourneys: [
    {
      slug: 'bolivia-salt-flat-trek',
      title: '天空之镜独行日记',
      story_hook: '走进镜面世界，分不清天与地的边界。',
      mood_keywords: ['想逃离'],
      mbti_types: [{ mbti_type: { code: 'INFP' } }],
    },
    {
      slug: 'iceland-lava-tunnel-cycling',
      title: '火山熔岩隧道骑行计划',
      story_hook: '沿着地球内部的暗线，完成一场装备型探索。',
      mood_keywords: ['想冒险'],
      mbti_types: [{ mbti_type: { code: 'ISTP' } }],
    },
    {
      slug: 'japan-onsen-temple-meditation',
      title: '古寺温泉 · 晨钟冥想',
      story_hook: '在蒸汽和晨钟之间，把日常噪声慢慢关小。',
      mood_keywords: ['想治愈'],
      mbti_types: [{ mbti_type: { code: 'INFJ' } }],
    },
    {
      slug: 'morocco-sahara-camel-camp',
      title: '撒哈拉星营地之夜',
      story_hook: '临时成为游牧者，在火光旁等银河落下来。',
      mood_keywords: ['另一个世界'],
      mbti_types: [{ mbti_type: { code: 'ENFP' } }],
    },
    {
      slug: 'greenland-dog-sled-solo',
      title: '格陵兰冰原狗拉雪橇信标',
      story_hook: '用路线、信标和勇气，在白色世界里确认方向。',
      mood_keywords: ['想挑战'],
      mbti_types: [{ mbti_type: { code: 'INTJ' } }],
    },
    {
      slug: 'turkey-cappadocia-balloon',
      title: '陌生城市规则挑战',
      story_hook: '带着一张规则卡，在陌生街巷里寻找隐藏出口。',
      mood_keywords: ['想实验'],
      mbti_types: [{ mbti_type: { code: 'ENTP' } }],
    },
  ],
  _scenes: [
    {
      image: '/static/assets/images/generated/hero-taoyuan.jpg',
      title: '桃源百旅',
      subtitle: '不是选择目的地，而是选择进入的世界。',
      note: '为想逃离、想治愈、想冒险、想换一种身份生活一天的人，收集一百种不可思议的旅行脚本。',
      tone: 'scene-taoyuan',
    },
    {
      image: '/static/assets/images/generated/card-salt-mirror.jpg',
      title: '天空倒映在脚下',
      subtitle: '给 INFP 的低声量逃离。',
      note: '当日常太吵，就去一个边界消失的地方，重新听见自己。',
      tone: 'scene-mirror',
    },
    {
      image: '/static/assets/images/generated/card-sahara-stars.jpg',
      title: '夜里进入另一片星空',
      subtitle: '给 ENFP 的临时游牧身份。',
      note: '不追打卡点，只追一束火光、一条路、和突然变大的世界。',
      tone: 'scene-night',
    },
  ],

  render() {
    const main = document.getElementById('main-content');
    if (!main) return;

    this._teardown();
    main.innerHTML = '';
    main.appendChild(this._buildHero());
    main.appendChild(this._buildPersonaStrip());
    main.appendChild(this._buildFeatured());

    this._preloadCriticalImages();
    this._startHero();
    this._loadFeatured();
  },

  _teardown() {
    if (this._sceneTimer) {
      clearInterval(this._sceneTimer);
      this._sceneTimer = null;
    }
    if (this._particleFrame) {
      cancelAnimationFrame(this._particleFrame);
      this._particleFrame = null;
    }
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    if (this._particleHero && this._pointerMoveHandler) {
      this._particleHero.removeEventListener('pointermove', this._pointerMoveHandler);
      this._pointerMoveHandler = null;
    }
    if (this._particleHero && this._pointerLeaveHandler) {
      this._particleHero.removeEventListener('pointerleave', this._pointerLeaveHandler);
      this._pointerLeaveHandler = null;
    }
    this._particleHero = null;
    this._particles = [];
  },

  _buildHero() {
    const scene = this._scenes[0];
    const section = document.createElement('section');
    section.className = `home-hero ${scene.tone}`;
    section.innerHTML = `
      <div class="home-hero__slides" aria-hidden="true">
        <div class="home-hero__slide is-active" style="background-image:url('${scene.image}')"></div>
      </div>
      <canvas class="home-hero__particles" id="hero-particles" aria-hidden="true"></canvas>
      <div class="home-hero__shade" aria-hidden="true"></div>
      <div class="home-hero__content">
        <div class="home-hero__brand">
          <img class="home-hero__mark" src="/static/assets/images/generated/brand-mark.png" alt="" aria-hidden="true">
          <span>桃源百旅</span>
        </div>
        <h1 class="home-hero__title" id="hero-title">${this._escapeHtml(scene.title)}</h1>
        <p class="home-hero__subtitle" id="hero-subtitle">${this._escapeHtml(scene.subtitle)}</p>
        <p class="home-hero__note" id="hero-note">${this._escapeHtml(scene.note)}</p>
        <form class="home-hero__search" id="hero-search">
          <input data-testid="search-input" type="search" name="q" placeholder="输入一个心情、身份或线索">
          <button type="submit">探索</button>
        </form>
        <div class="home-hero__quick" aria-label="快速探索">
          ${this._quickLink('想逃离', 'tag', 'solitude')}
          ${this._quickLink('想治愈', 'mbti', 'INFP')}
          ${this._quickLink('想冒险', 'tag', 'extreme')}
          ${this._quickLink('另一个世界', 'fantasy_type', 'night')}
        </div>
      </div>
      <button class="home-hero__guide" type="button" id="hero-guide" aria-label="快速进入探索">
        <span class="home-hero__guide-symbol" aria-hidden="true">⌕</span>
      </button>
    `;

    section.querySelector('#hero-search').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = new FormData(e.currentTarget).get('q');
      const params = new URLSearchParams();
      if (q && String(q).trim()) params.set('q', String(q).trim());
      Router.navigate(`#/explore${params.toString() ? '?' + params.toString() : ''}`);
    });

    section.querySelectorAll('[data-filter-key]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const params = new URLSearchParams();
        params.set(btn.dataset.filterKey, btn.dataset.filterValue);
        Router.navigate(`#/explore?${params.toString()}`);
      });
    });

    section.querySelector('#hero-guide').addEventListener('click', () => {
      Router.navigate('#/explore?mbti=INFP');
    });

    return section;
  },

  _quickLink(label, key, value) {
    return `<button class="home-hero__chip" type="button" data-filter-key="${key}" data-filter-value="${value}">${label}</button>`;
  },

  _startHero() {
    this._startParticles();
    this._sceneTimer = setInterval(() => this._nextScene(), 6200);
  },

  _nextScene() {
    const hero = document.querySelector('.home-hero');
    const slides = document.querySelector('.home-hero__slides');
    const title = document.getElementById('hero-title');
    const subtitle = document.getElementById('hero-subtitle');
    const note = document.getElementById('hero-note');
    if (!hero || !slides || !title || !subtitle || !note) return;

    this._sceneIndex = (this._sceneIndex + 1) % this._scenes.length;
    const scene = this._scenes[this._sceneIndex];
    const next = document.createElement('div');
    next.className = 'home-hero__slide';
    next.style.backgroundImage = `url('${scene.image}')`;
    slides.appendChild(next);
    requestAnimationFrame(() => next.classList.add('is-active'));

    hero.className = `home-hero ${scene.tone}`;
    title.classList.add('is-switching');
    subtitle.classList.add('is-switching');
    note.classList.add('is-switching');
    setTimeout(() => {
      title.textContent = scene.title;
      subtitle.textContent = scene.subtitle;
      note.textContent = scene.note;
      title.classList.remove('is-switching');
      subtitle.classList.remove('is-switching');
      note.classList.remove('is-switching');
    }, 220);

    const oldSlides = slides.querySelectorAll('.home-hero__slide');
    setTimeout(() => {
      oldSlides.forEach((slide) => {
        if (slide !== next) slide.remove();
      });
    }, 1200);
  },

  _startParticles() {
    const canvas = document.getElementById('hero-particles');
    const hero = document.querySelector('.home-hero');
    if (!canvas || !hero) return;
    const ctx = canvas.getContext('2d');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pointer = { x: -9999, y: -9999, active: false };
    const resize = () => {
      const rect = hero.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      this._seedParticles(rect.width, rect.height);
    };
    resize();
    this._particleHero = hero;
    this._resizeHandler = resize;
    this._pointerMoveHandler = (e) => {
      const rect = hero.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.active = true;
    };
    this._pointerLeaveHandler = () => {
      pointer.active = false;
      pointer.x = -9999;
      pointer.y = -9999;
    };
    window.addEventListener('resize', this._resizeHandler, { passive: true });
    hero.addEventListener('pointermove', this._pointerMoveHandler, { passive: true });
    hero.addEventListener('pointerleave', this._pointerLeaveHandler, { passive: true });

    const draw = () => {
      const rect = hero.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      if (pointer.active) {
        const glow = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 96);
        glow.addColorStop(0, 'rgba(255, 229, 178, 0.16)');
        glow.addColorStop(0.34, 'rgba(190, 222, 190, 0.08)');
        glow.addColorStop(1, 'rgba(255, 198, 105, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(pointer.x - 96, pointer.y - 96, 192, 192);
      }
      for (const p of this._particles) {
        if (pointer.active) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < 128) {
            const force = (1 - dist / 128) * 0.6;
            p.vx += (dx / dist) * force * 0.035;
            p.vy += (dy / dist) * force * 0.035;
          }
        }
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.992;
        p.vy *= 0.992;
        p.life += p.speed;
        if (p.y < -20 || p.x > rect.width + 20 || p.life > 1) {
          p.x = Math.random() * rect.width;
          p.y = rect.height + Math.random() * 80;
          p.life = 0;
        }
        const alpha = Math.sin(p.life * Math.PI) * p.alpha;
        ctx.beginPath();
        ctx.fillStyle = `hsla(${p.hue}, 76%, 75%, ${alpha})`;
        ctx.shadowColor = `hsla(${p.hue}, 85%, 72%, 0.62)`;
        ctx.shadowBlur = p.blur;
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      if (!reduceMotion) this._particleFrame = requestAnimationFrame(draw);
    };
    draw();
  },

  _seedParticles(width, height) {
    const count = Math.max(64, Math.min(130, Math.floor(width / 13)));
    this._particles = Array.from({ length: count }, () => ({
      x: Math.random() < 0.55
        ? Math.random() * width * 0.22
        : width * (0.78 + Math.random() * 0.22),
      y: Math.random() * height,
      vx: 0.08 + Math.random() * 0.18,
      vy: -0.08 - Math.random() * 0.22,
      size: 0.8 + Math.random() * 1.9,
      blur: 6 + Math.random() * 14,
      alpha: 0.12 + Math.random() * 0.34,
      hue: 42 + Math.random() * 92,
      speed: 0.001 + Math.random() * 0.003,
      life: Math.random(),
    }));
  },

  _buildPersonaStrip() {
    const section = document.createElement('section');
    section.className = 'home-personas';
    section.innerHTML = `
      <div class="home-personas__inner container">
        ${this._personaCard('95后 / 00后', '视觉优先、社交分享、想要被一句话击中的旅行灵感。')}
        ${this._personaCard('反向生活者', '拒绝热门打卡，偏爱小众、深度、带一点反常识的路线。')}
        ${this._personaCard('沉浸幻想用户', '想像剧本杀一样进入角色，完成一场只属于自己的任务。')}
      </div>
    `;
    return section;
  },

  _personaCard(title, body) {
    return `
      <article class="home-personas__item">
        <h2>${this._escapeHtml(title)}</h2>
        <p>${this._escapeHtml(body)}</p>
      </article>
    `;
  },

  _buildFeatured() {
    const section = document.createElement('section');
    section.className = 'home-featured';
    section.id = 'home-featured';
    section.innerHTML = `
      <div class="home-featured__header container">
        <div>
          <h2 class="home-featured__title">先进入一条隐秘小径</h2>
          <p class="home-featured__subtitle">少量精选入口，适合先感受产品气质。</p>
        </div>
        <a class="home-featured__more" href="#/explore">全部旅程</a>
      </div>
      <div class="home-featured__grid container" id="featured-grid" data-testid="journey-feed">
        ${this._instantJourneys.map((j, idx) => this._renderCard(j, idx, { eager: idx < 2 })).join('')}
      </div>
    `;
    return section;
  },

  _skeletonCards(count) {
    return Array.from({ length: count }, () => '<div class="home-card home-card--skeleton"></div>').join('');
  },

  async _loadFeatured() {
    const grid = document.getElementById('featured-grid');
    if (!grid) return;

    try {
      const res = await API.getJourneys({ limit: 6 });
      const journeys = res.data || res || [];
      if (!journeys.length) {
        this._bindCards(grid);
        return;
      }

      grid.innerHTML = journeys.map((j, idx) => this._renderCard(j, idx, { eager: idx < 2 })).join('');
      this._bindCards(grid);
    } catch (err) {
      this._bindCards(grid);
      console.error('Home featured load failed:', err);
    }
  },

  _bindCards(grid) {
    grid.querySelectorAll('.home-card').forEach((card) => {
      if (card.dataset.bound === 'true') return;
      card.dataset.bound = 'true';
      card.addEventListener('click', () => {
        const slug = card.dataset.slug;
        if (slug) {
          this._trackEvent('journey_click', slug);
          Router.navigate(`#/journey/${encodeURIComponent(slug)}`);
        }
      });
    });
  },

  _preloadCriticalImages() {
    const urls = [
      this._scenes[0].image,
      this._imageMap['bolivia-salt-flat-trek'],
      this._imageMap['iceland-lava-tunnel-cycling'],
    ];
    urls.forEach((url) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
    });
  },

  _renderCard(j, idx, options = {}) {
    const imageUrl = this._imageMap[j.slug] || this._fallbackImages[idx % this._fallbackImages.length];
    const mood = (j.mood_keywords || [])[0] || '不可思议';
    const mbti = (j.mbti_types || [])[0]?.mbti_type?.code || 'MBTI';
    const hook = j.story_hook || j.subtitle || '把目的地变成一个可以进入的世界。';
    const loading = options.eager ? 'eager' : 'lazy';
    const priority = options.eager ? 'high' : 'auto';
    return `
      <article class="home-card" data-testid="journey-card" data-slug="${this._escapeHtml(j.slug)}">
        <div class="home-card__media">
          <img src="${this._escapeHtml(imageUrl)}" alt="${this._escapeHtml(j.title)}" width="900" height="1125" loading="${loading}" decoding="async" fetchpriority="${priority}">
        </div>
        <div class="home-card__body">
          <div class="home-card__tags">
            <span>${this._escapeHtml(mood)}</span>
            <span>${this._escapeHtml(mbti)}</span>
          </div>
          <h3>${this._escapeHtml(j.title)}</h3>
          <p>${this._escapeHtml(hook)}</p>
        </div>
      </article>
    `;
  },

  _escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  _trackEvent(type, slug) {
    try {
      const payload = JSON.stringify({ type, journey_slug: slug || '' });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(`${window.APP_CONFIG.apiBase}/analytics/events`, new Blob([payload], { type: 'application/json' }));
        return;
      }
      fetch(`${window.APP_CONFIG.apiBase}/analytics/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    } catch {}
  },
};
