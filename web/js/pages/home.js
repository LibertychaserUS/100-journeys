/**
 * Home page controller
 * Renders hero, MBTI teaser, and featured journeys grid.
 */
var Pages = window.Pages || {};

Pages.Home = {
  /**
   * Main render entry — clears main-content and builds the full home page.
   */
  render() {
    const main = document.getElementById('main-content');
    if (!main) return;

    main.innerHTML = '';
    main.appendChild(this._buildHero());
    main.appendChild(this._buildMbtiTeaser());
    main.appendChild(this._buildFeatured());

    this._loadFeatured();
  },

  /* ================================================================
     Hero Section
     ================================================================ */
  _buildHero() {
    const section = document.createElement('section');
    section.className = 'home-hero';

    section.innerHTML = `
      <div class="home-hero__bg" aria-hidden="true"></div>
      <div class="home-hero__overlay" aria-hidden="true"></div>
      <div class="home-hero__content">
        <h1 class="home-hero__title">100种不可思议的旅行</h1>
        <p class="home-hero__subtitle">每一种人格，都有属于自己的奇幻旅程</p>
        <button class="home-hero__cta" data-action="explore">开始探索</button>
      </div>
    `;

    section.querySelector('[data-action="explore"]').addEventListener('click', () => {
      Router.navigate('#/explore');
    });

    return section;
  },

  /* ================================================================
     MBTI Teaser Section
     ================================================================ */
  _buildMbtiTeaser() {
    const section = document.createElement('section');
    section.className = 'home-mbti';

    const mbtiTypes = [
      'INTJ', 'INTP', 'ENTJ', 'ENTP',
      'INFJ', 'INFP', 'ENFJ', 'ENFP',
      'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
      'ISTP', 'ISFP', 'ESTP', 'ESFP',
    ];

    const chipsHtml = mbtiTypes
      .map(
        (type) =>
          `<button class="home-mbti__chip" data-mbti="${type}">${type}</button>`
      )
      .join('');

    section.innerHTML = `
      <div class="home-mbti__header container">
        <h2 class="home-mbti__title">按人格探索</h2>
        <p class="home-mbti__desc">选择你的 MBTI 类型，发现为你量身定制的旅程</p>
      </div>
      <div class="home-mbti__scroll">${chipsHtml}</div>
    `;

    section.querySelectorAll('.home-mbti__chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const code = chip.dataset.mbti;
        Router.navigate(`#/explore?mbti=${encodeURIComponent(code)}`);
      });
    });

    return section;
  },

  /* ================================================================
     Featured Section
     ================================================================ */
  _buildFeatured() {
    const section = document.createElement('section');
    section.className = 'home-featured';
    section.id = 'home-featured';

    section.innerHTML = `
      <div class="home-featured__header container">
        <h2 class="home-featured__title">精选旅程</h2>
        <a class="home-featured__more" href="#/explore">查看全部 &rarr;</a>
      </div>
      <div class="home-featured__grid" id="featured-grid">
        <p class="home-featured__loading" style="grid-column: 1 / -1; color: var(--color-text-muted); font-size: var(--text-sm);">
          加载中…
        </p>
      </div>
    `;

    return section;
  },

  /* ================================================================
     Data Loading
     ================================================================ */
  async _loadFeatured() {
    const grid = document.getElementById('featured-grid');
    if (!grid) return;

    try {
      const res = await API.getJourneys({ limit: 6 });
      const journeys = res.data || res || [];

      if (!journeys.length) {
        grid.innerHTML = `<p style="grid-column: 1 / -1; color: var(--color-text-muted); font-size: var(--text-sm);">暂无旅程数据</p>`;
        return;
      }

      grid.innerHTML = journeys.map((j) => this._renderCard(j)).join('');

      // Bind card clicks
      grid.querySelectorAll('.home-card').forEach((card) => {
        card.addEventListener('click', (e) => {
          // If user clicked an MBTI chip inside the card, let that handler run
          if (e.target.closest('.home-card__tag--mbti')) return;
          const slug = card.dataset.slug;
          if (slug) Router.navigate(`#/journey/${encodeURIComponent(slug)}`);
        });
      });

      // Bind MBTI chip clicks inside cards
      grid.querySelectorAll('.home-card__tag--mbti').forEach((chip) => {
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          const code = chip.dataset.mbti;
          if (code) Router.navigate(`#/explore?mbti=${encodeURIComponent(code)}`);
        });
      });
    } catch (err) {
      grid.innerHTML = `<p style="grid-column: 1 / -1; color: var(--color-text-muted); font-size: var(--text-sm);">加载失败，请稍后重试</p>`;
      // eslint-disable-next-line no-console
      console.error('Home featured load failed:', err);
    }
  },

  /* ================================================================
     Card Template
     ================================================================ */
  _renderCard(j) {
    const imageUrl = j.image_url
      ? API.mediaUrl(j.image_url)
      : '/static/assets/images/placeholder.jpg';

    const typeTag = j.fantasy_type
      ? `<span class="home-card__tag home-card__tag--type">${this._escapeHtml(j.fantasy_type)}</span>`
      : '';

    const mbtiTags = (j.mbti_types || [])
      .slice(0, 2)
      .map(
        (code) =>
          `<span class="home-card__tag home-card__tag--mbti" data-mbti="${this._escapeHtml(code)}">${this._escapeHtml(code)}</span>`
      )
      .join('');

    const difficultyDots = this._renderDifficulty(j.risk_level);

    return `
      <article class="home-card" data-slug="${this._escapeHtml(j.slug)}">
        <div class="home-card__media">
          <img src="${this._escapeHtml(imageUrl)}" alt="${this._escapeHtml(j.title)}" loading="lazy" />
        </div>
        <div class="home-card__body">
          <div class="home-card__tags">
            ${typeTag}
            ${mbtiTags}
          </div>
          <h3 class="home-card__title">${this._escapeHtml(j.title)}</h3>
          <p class="home-card__hook">${this._escapeHtml(j.story_hook || j.subtitle || '')}</p>
          <div class="home-card__meta">
            <div class="home-card__difficulty">${difficultyDots}</div>
          </div>
        </div>
      </article>
    `;
  },

  _renderDifficulty(level) {
    const max = 5;
    const safe = Math.max(0, Math.min(max, Number(level) || 0));
    let dots = '';
    for (let i = 1; i <= max; i++) {
      dots += `<span class="home-card__dot ${i <= safe ? 'home-card__dot--active' : ''}"></span>`;
    }
    const labels = ['', '轻松', '适中', '挑战', '极限', '传说'];
    const label = labels[safe] || '';
    return `${dots}<span class="home-card__difficulty-label">${label}</span>`;
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
};
