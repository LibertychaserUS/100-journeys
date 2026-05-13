/**
 * Explore page controller — Discovery feed with filters + masonry card grid
 * Xiaohongshu-style card-based discovery with infinite scroll
 */

var Pages = window.Pages || {};

Pages.Explore = {
  _currentFilter: {},
  _currentPage: 1,
  _isLoading: false,
  _hasMore: true,
  _tags: [],
  _debounceTimer: null,

  render() {
    const main = document.getElementById('main-content');
    if (!main) return;

    main.innerHTML = '';
    main.appendChild(this._buildSearch());
    main.appendChild(this._buildFilters());
    main.appendChild(this._buildGrid());

    // Parse hash params for initial filters
    this._parseHashFilters();
    this._loadTags();
    this._loadJourneys(true);
  },

  /* ================================================================
     Search Bar
     ================================================================ */
  _buildSearch() {
    const div = document.createElement('div');
    div.className = 'explore-search';
    div.innerHTML = `
      <div class="container explore-search__input-wrap">
        <span class="explore-search__icon" aria-hidden="true">⌕</span>
        <input type="search" class="explore-search__input" id="explore-search"
               placeholder="搜索旅行目的地、风格、关键词..."
               value="${this._escapeHtml(this._currentFilter.q || '')}">
      </div>
    `;
    const input = div.querySelector('#explore-search');
    input.addEventListener('input', (e) => {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        this._currentFilter.q = e.target.value.trim() || undefined;
        this._updateHash();
        this._loadJourneys(true);
      }, 300);
    });
    return div;
  },

  /* ================================================================
     Filters
     ================================================================ */
  _buildFilters() {
    const div = document.createElement('div');
    div.className = 'explore-filters';

    const mbtiTypes = [
      'INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP',
      'ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP',
    ];

    const visualStyles = ['写实','动漫','油画','像素','水墨','赛博朋克'];
    const fantasyTypes = ['科幻','奇幻','武侠','末日','蒸汽朋克','克苏鲁'];

    const advMin = this._currentFilter.adventure_min ?? 0;
    const advMax = this._currentFilter.adventure_max ?? 10;

    div.innerHTML = `
      <div class="container">
        <!-- MBTI -->
        <div class="explore-filters__section">
          <span class="explore-filters__label">MBTI 性格</span>
          <div class="explore-filters__chips" role="group" aria-label="MBTI 筛选" id="filter-mbti">
            ${mbtiTypes.map(m => {
              const active = this._currentFilter.mbti === m ? 'explore-chip--active' : '';
              return `<button class="explore-chip explore-chip--mbti-${m} ${active}" data-key="mbti" data-value="${m}" type="button" aria-pressed="${!!active}">${m}</button>`;
            }).join('')}
          </div>
        </div>

        <!-- Tags (populated after API call) -->
        <div class="explore-filters__section">
          <span class="explore-filters__label">标签</span>
          <div class="explore-filters__chips" role="group" aria-label="标签筛选" id="filter-tags">
            <span style="color:var(--color-text-muted);font-size:var(--text-sm);">加载中...</span>
          </div>
        </div>

        <!-- Visual Style -->
        <div class="explore-filters__section">
          <span class="explore-filters__label">视觉风格</span>
          <div class="explore-filters__chips" role="group" aria-label="视觉风格筛选" id="filter-visual">
            ${visualStyles.map(v => {
              const active = this._currentFilter.visual_style === v ? 'explore-chip--active' : '';
              return `<button class="explore-chip ${active}" data-key="visual_style" data-value="${v}" type="button" aria-pressed="${!!active}">${v}</button>`;
            }).join('')}
          </div>
        </div>

        <!-- Fantasy Type -->
        <div class="explore-filters__section">
          <span class="explore-filters__label">幻想类型</span>
          <div class="explore-filters__chips" role="group" aria-label="幻想类型筛选" id="filter-fantasy">
            ${fantasyTypes.map(f => {
              const active = this._currentFilter.fantasy_type === f ? 'explore-chip--active' : '';
              return `<button class="explore-chip ${active}" data-key="fantasy_type" data-value="${f}" type="button" aria-pressed="${!!active}">${f}</button>`;
            }).join('')}
          </div>
        </div>

        <!-- Adventure Slider -->
        <div class="explore-filters__section">
          <span class="explore-filters__label" id="adventure-label">冒险程度: ${Math.min(advMin, advMax)} - ${Math.max(advMin, advMax)}</span>
          <div class="explore-filters__slider-wrap">
            <input type="range" class="explore-filters__slider" id="filter-adventure-min" min="0" max="10" step="1" value="${advMin}">
            <input type="range" class="explore-filters__slider" id="filter-adventure-max" min="0" max="10" step="1" value="${advMax}">
          </div>
        </div>
      </div>
    `;

    // Chip click handlers (delegation for static chips)
    div.querySelectorAll('.explore-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const key = chip.dataset.key;
        const value = chip.dataset.value;
        const isActive = chip.classList.contains('explore-chip--active');

        // Toggle: if already active, deactivate; otherwise activate this one only
        div.querySelectorAll(`.explore-chip[data-key="${key}"]`).forEach(c => {
          c.classList.remove('explore-chip--active');
          c.setAttribute('aria-pressed', 'false');
        });
        if (!isActive) {
          chip.classList.add('explore-chip--active');
          chip.setAttribute('aria-pressed', 'true');
          this._currentFilter[key] = value;
        } else {
          delete this._currentFilter[key];
        }
        this._updateHash();
        this._loadJourneys(true);
      });
    });

    // Adventure sliders
    const minSlider = div.querySelector('#filter-adventure-min');
    const maxSlider = div.querySelector('#filter-adventure-max');
    const advLabel = div.querySelector('#adventure-label');

    const updateAdvLabel = () => {
      const min = parseInt(minSlider.value, 10);
      const max = parseInt(maxSlider.value, 10);
      advLabel.textContent = `冒险程度: ${Math.min(min, max)} - ${Math.max(min, max)}`;
    };

    const onAdvChange = () => {
      const min = parseInt(minSlider.value, 10);
      const max = parseInt(maxSlider.value, 10);
      this._currentFilter.adventure_min = Math.min(min, max);
      this._currentFilter.adventure_max = Math.max(min, max);
      updateAdvLabel();
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        this._updateHash();
        this._loadJourneys(true);
      }, 300);
    };

    minSlider.addEventListener('input', updateAdvLabel);
    minSlider.addEventListener('change', onAdvChange);
    maxSlider.addEventListener('input', updateAdvLabel);
    maxSlider.addEventListener('change', onAdvChange);

    return div;
  },

  /* ================================================================
     Grid
     ================================================================ */
  _buildGrid() {
    const div = document.createElement('div');
    div.className = 'container';
    div.innerHTML = `
      <p class="explore-results-meta" id="explore-results" aria-live="polite"></p>
      <div class="explore-grid" id="explore-grid" role="feed" aria-busy="true">
        ${this._skeletonCards(6)}
      </div>
      <div class="explore-load-more" id="explore-loadmore"></div>
    `;

    // Infinite scroll
    this._scrollHandler = () => {
      if (this._isLoading || !this._hasMore) return;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;
      if (scrollTop + clientHeight >= scrollHeight - 400) {
        this._currentPage++;
        this._loadJourneys(false);
      }
    };
    window.addEventListener('scroll', this._scrollHandler);

    return div;
  },

  _skeletonCards(count) {
    return Array.from({ length: count }, () => `
      <div class="skeleton-card">
        <div class="skeleton-card__image"></div>
        <div class="skeleton-card__body">
          <div class="skeleton-card__text skeleton-card__text--short"></div>
          <div class="skeleton-card__text skeleton-card__text--medium"></div>
          <div class="skeleton-card__text skeleton-card__text--long"></div>
        </div>
      </div>
    `).join('');
  },

  /* ================================================================
     Tags (from API)
     ================================================================ */
  async _loadTags() {
    try {
      const res = await API.getTags();
      this._tags = res.data || res || [];
      const tagContainer = document.getElementById('filter-tags');
      if (!tagContainer) return;

      const names = this._tags.map(t => t.name || t.slug || t);
      tagContainer.innerHTML = names.map(name => {
        const active = this._currentFilter.tag === name ? 'explore-chip--active' : '';
        return `<button class="explore-chip ${active}" data-key="tag" data-value="${this._escapeHtml(name)}" type="button" aria-pressed="${!!active}">${this._escapeHtml(name)}</button>`;
      }).join('');

      // Bind clicks
      tagContainer.querySelectorAll('.explore-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const key = chip.dataset.key;
          const value = chip.dataset.value;
          const isActive = chip.classList.contains('explore-chip--active');

          tagContainer.querySelectorAll('.explore-chip').forEach(c => {
            c.classList.remove('explore-chip--active');
            c.setAttribute('aria-pressed', 'false');
          });
          if (!isActive) {
            chip.classList.add('explore-chip--active');
            chip.setAttribute('aria-pressed', 'true');
            this._currentFilter[key] = value;
          } else {
            delete this._currentFilter[key];
          }
          this._updateHash();
          this._loadJourneys(true);
        });
      });
    } catch (err) {
      console.error('Tag load failed:', err);
      const tagContainer = document.getElementById('filter-tags');
      if (tagContainer) tagContainer.innerHTML = '<span style="color:var(--color-text-muted);font-size:var(--text-sm);">加载失败</span>';
    }
  },

  /* ================================================================
     Data Loading
     ================================================================ */
  async _loadJourneys(reset = false) {
    if (this._isLoading) return;
    this._isLoading = true;

    const grid = document.getElementById('explore-grid');
    const results = document.getElementById('explore-results');
    const loadMoreWrap = document.getElementById('explore-loadmore');

    if (reset) {
      this._currentPage = 1;
      this._hasMore = true;
      if (grid) {
        grid.setAttribute('aria-busy', 'true');
        grid.innerHTML = this._skeletonCards(6);
      }
    } else {
      if (loadMoreWrap) {
        loadMoreWrap.innerHTML = '<div class="explore-load-more__spinner" aria-label="加载中"></div>';
      }
    }

    const filter = {
      ...this._currentFilter,
      page: this._currentPage,
      limit: 12,
    };

    try {
      const res = await API.getJourneys(filter);
      const journeys = res.data || [];
      const total = res.total || journeys.length;

      if (reset) {
        if (journeys.length === 0) {
          grid.innerHTML = `
            <div class="explore-empty" style="grid-column: 1 / -1;">
              <p class="explore-empty__title">暂无结果</p>
              <p class="explore-empty__hint">尝试调整筛选条件或搜索关键词，发现更多不可思议的旅行。</p>
            </div>
          `;
        } else {
          grid.innerHTML = journeys.map(j => this._renderCard(j)).join('');
        }
      } else {
        const html = journeys.map(j => this._renderCard(j)).join('');
        grid.insertAdjacentHTML('beforeend', html);
      }

      grid.setAttribute('aria-busy', 'false');

      // Bind card clicks
      grid.querySelectorAll('.journey-card').forEach(card => {
        card.addEventListener('click', () => {
          const slug = card.dataset.slug;
          if (slug) Router.navigate(`/journey/${encodeURIComponent(slug)}`);
        });
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const slug = card.dataset.slug;
            if (slug) Router.navigate(`/journey/${encodeURIComponent(slug)}`);
          }
        });
      });

      // Results text
      if (results) {
        results.textContent = reset && journeys.length === 0 ? '' : `共 ${total} 个结果`;
      }

      this._hasMore = journeys.length === 12;
      if (loadMoreWrap) {
        if (!this._hasMore && journeys.length > 0) {
          loadMoreWrap.innerHTML = '<p class="explore-end">已到底部</p>';
        } else if (!this._hasMore) {
          loadMoreWrap.innerHTML = '';
        } else {
          loadMoreWrap.innerHTML = `
            <button class="explore-load-more__btn" type="button" id="btn-loadmore">加载更多</button>
          `;
          const btn = loadMoreWrap.querySelector('#btn-loadmore');
          if (btn) {
            btn.addEventListener('click', () => {
              if (!this._isLoading && this._hasMore) {
                this._currentPage++;
                this._loadJourneys(false);
              }
            });
          }
        }
      }
    } catch (err) {
      console.error('Explore load failed:', err);
      if (grid) {
        grid.setAttribute('aria-busy', 'false');
        if (reset) {
          grid.innerHTML = `
            <div class="explore-empty" style="grid-column: 1 / -1;">
              <p class="explore-empty__title">加载失败</p>
              <p class="explore-empty__hint">${this._escapeHtml(err.message || '请检查网络连接后重试')}</p>
            </div>
          `;
        }
      }
      if (loadMoreWrap) loadMoreWrap.innerHTML = '';
    } finally {
      this._isLoading = false;
    }
  },

  _renderCard(j) {
    const imageUrl = j.cover_image
      ? (j.cover_image.startsWith('http') ? j.cover_image : API.mediaUrl(j.cover_image))
      : '/static/assets/images/placeholder.jpg';

    const aspectStyle = j.aspect_ratio
      ? `padding-bottom: ${(1 / j.aspect_ratio * 100).toFixed(2)}%;`
      : 'padding-bottom: 133.33%;';

    const adventureLevel = j.adventure_level ?? j.risk_level ?? 0;
    const filled = Math.max(0, Math.min(5, Math.round(adventureLevel / 2)));
    const dots = Array.from({ length: 5 }, (_, i) =>
      `<span class="journey-card__adventure-dot ${i < filled ? 'journey-card__adventure-dot--filled' : ''}"></span>`
    ).join('');

    return `
      <article class="journey-card" data-slug="${this._escapeHtml(j.slug)}" role="link" tabindex="0">
        <div class="journey-card__image-wrap" style="position:relative;${aspectStyle}">
          <img class="journey-card__image"
               src="${this._escapeHtml(imageUrl)}"
               alt="${this._escapeHtml(j.title)}"
               loading="lazy"
               style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"
               onerror="this.src='/static/assets/images/placeholder.jpg'">
        </div>
        <div class="journey-card__body">
          <div class="journey-card__meta">
            <span class="journey-card__tag">${this._escapeHtml(j.tag_name || j.tag || '旅行')}</span>
            ${j.mbti ? `<span class="journey-card__mbti">${this._escapeHtml(j.mbti)}</span>` : ''}
          </div>
          <h3 class="journey-card__title">${this._escapeHtml(j.title)}</h3>
          ${j.hook || j.story_hook ? `<p class="journey-card__hook">${this._escapeHtml(j.hook || j.story_hook)}</p>` : ''}
          <div class="journey-card__footer">
            <div class="journey-card__adventure" aria-label="冒险等级 ${adventureLevel}">
              ${dots}
            </div>
            <span class="journey-card__action">探索→</span>
          </div>
        </div>
      </article>
    `;
  },

  /* ================================================================
     Hash sync
     ================================================================ */
  _parseHashFilters() {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash.split('?')[1] || '');

    const keys = ['tag', 'visual_style', 'fantasy_type', 'mbti', 'q'];
    keys.forEach(k => {
      const v = params.get(k);
      if (v) this._currentFilter[k] = v;
    });

    const advMin = params.get('adventure_min');
    const advMax = params.get('adventure_max');
    if (advMin !== null) this._currentFilter.adventure_min = parseInt(advMin, 10);
    if (advMax !== null) this._currentFilter.adventure_max = parseInt(advMax, 10);

    const page = params.get('page');
    if (page) this._currentPage = parseInt(page, 10);
  },

  _updateHash() {
    const f = this._currentFilter;
    const params = new URLSearchParams();
    if (f.tag) params.set('tag', f.tag);
    if (f.visual_style) params.set('visual_style', f.visual_style);
    if (f.fantasy_type) params.set('fantasy_type', f.fantasy_type);
    if (f.mbti) params.set('mbti', f.mbti);
    if (f.q) params.set('q', f.q);
    if (f.adventure_min !== undefined && f.adventure_min !== 0) params.set('adventure_min', String(f.adventure_min));
    if (f.adventure_max !== undefined && f.adventure_max !== 10) params.set('adventure_max', String(f.adventure_max));
    if (this._currentPage !== 1) params.set('page', String(this._currentPage));

    const qs = params.toString();
    const newHash = '#/explore' + (qs ? '?' + qs : '');
    if (window.location.hash !== newHash) {
      window.location.hash = newHash;
    }
  },

  _escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },
};
