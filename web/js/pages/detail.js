/**
 * Detail page controller — Journey story view
 */
var Pages = window.Pages || {};

Pages.Detail = {
  _observer: null,
  _imageMap: {
    'bolivia-salt-flat-trek': '/static/assets/images/generated/card-salt-mirror.jpg',
    'iceland-lava-tunnel-cycling': '/static/assets/images/generated/card-lava-tunnel.jpg',
    'japan-onsen-temple-meditation': '/static/assets/images/generated/card-temple-onsen.jpg',
    'morocco-sahara-camel-camp': '/static/assets/images/generated/card-sahara-stars.jpg',
    'greenland-dog-sled-solo': '/static/assets/images/generated/card-greenland-sled.jpg',
    'turkey-cappadocia-balloon': '/static/assets/images/generated/card-city-rules.jpg',
  },

  render(slug) {
    const main = document.getElementById('main-content');
    main.innerHTML = '<div class="detail-loading"></div>';

    API.getJourney(slug)
      .then((res) => this._renderPage(res.data || res))
      .catch((err) => {
        if (err.message && err.message.includes('404')) {
          this._renderNotFound(main);
        } else {
          this._renderNotFound(main);
        }
      });
  },

  _renderPage(data) {
    const main = document.getElementById('main-content');

    // Apply visual style class to body for CSS overrides
    if (data.visual_style) {
      document.body.classList.add(`style-${data.visual_style}`);
    }

    // Fantasy type color map
    const typeColors = {
      surreal:  '#8b5cf6',
      dramatic: '#e86b5f',
      raw:      '#6b7280',
      minimal:  '#a0a09a',
      epic:     '#e8d5a3',
      mystical: '#60a5fa',
    };
    const badgeColor = typeColors[data.fantasy_type] || typeColors.epic;

    // Build meta items
    const metaItems = [];
    if (data.region) {
      metaItems.push(this._metaIcon('region', data.region));
    }
    if (data.duration) {
      metaItems.push(this._metaIcon('duration', data.duration));
    }
    if (data.cost) {
      metaItems.push(this._metaIcon('cost', data.cost));
    }
    if (data.price > 0) {
      metaItems.push(this._metaIcon('price', data.price.toLocaleString() + ' 不思议币'));
    }

    // Build tags
    const tagsHtml = (data.tags || [])
      .map((t) => `<span class="detail-chip">${this._escape(t.name)}</span>`)
      .join('');

    // Build MBTI chips
    const mbtiHtml = (data.mbti_types || [])
      .map((m) => {
        const color = m.mbti_type?.color || '#a0a09a';
        return `<span class="detail-chip detail-chip--mbti" style="color:${color}">
          ${this._escape(m.mbti_type?.code || '')}
          <span class="detail-chip__score">${m.compatibility_score || 0}%</span>
        </span>`;
      })
      .join('');

    // Build mood keywords
    const moodsHtml = (data.mood_keywords || [])
      .map((k) => `<span class="detail-mood">#${this._escape(k)}</span>`)
      .join('');

    // Story paragraphs
    const storyHtml = data.story
      ? data.story
          .split('\n')
          .filter((p) => p.trim())
          .map((p) => `<p>${this._escape(p)}</p>`)
          .join('')
      : '<p>暂无故事内容</p>';

    // Clue tips (synthesized from available data)
    const clues = [
      {
        icon: this._icons.localGuide,
        label: '当地向导建议',
        text: data.region ? `在${this._escape(data.region)}旅行，建议提前联系当地向导了解隐藏路线。` : '建议提前联系当地向导了解隐藏路线。',
      },
      {
        icon: this._icons.season,
        label: '最佳季节',
        text: this._bestSeason(data.region),
      },
      {
        icon: this._icons.gear,
        label: '装备建议',
        text: this._gearAdvice(data.adventure_index, data.risk_level),
      },
      {
        icon: this._icons.infp,
        label: 'INFP 推荐',
        text: data.obscurity_level > 7
          ? '这条路线足够冷门，适合喜欢独处的灵魂。'
          : '这条路线有独特的氛围，值得INFP静静感受。',
      },
    ];

    const cluesHtml = clues
      .map(
        (c) => `<div class="detail-clue__item">
          <span class="detail-clue__item-icon">${c.icon}</span>
          <div>
            <span class="detail-clue__item-label">${this._escape(c.label)}</span>
            ${this._escape(c.text)}
          </div>
        </div>`
      )
      .join('');

    // Image URL
    const rawImage = this._imageMap[data.slug] || data.image_url || '';
    const imageUrl = rawImage
      ? (rawImage.startsWith('http') || rawImage.startsWith('/') ? rawImage : API.mediaUrl(rawImage))
      : '';

    const storyParts = data.story
      ? data.story.split('。').map((p) => p.trim()).filter(Boolean)
      : [];
    const roleText = this._roleFor(data);
    const missionText = this._missionFor(data);
    const sceneText = [
      data.story_hook || data.subtitle || '先把目的地当成一个可以进入的世界。',
      storyParts[0] ? storyParts[0] + '。' : '你从熟悉的生活边界出发，进入一段带有规则、身份与线索的旅程。',
      storyParts[1] ? storyParts[1] + '。' : '不要急着打卡，先观察光、声音、风向和陌生人的节奏。',
    ];

    main.innerHTML = `
      <article class="detail-page">
        <header class="detail-hero">
          ${imageUrl ? `<img class="detail-hero__image" src="${imageUrl}" alt="${this._escape(data.title)}" />` : ''}
          <div class="detail-hero__overlay"></div>
          <div class="detail-hero__topbar">
            <button class="detail-hero__btn detail-hero__btn--back" aria-label="返回">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
            </button>
            <button class="detail-hero__btn detail-hero__btn--share" aria-label="分享">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98"/><path d="M15.41 6.51l-6.82 3.98"/></svg>
            </button>
          </div>
          <div class="detail-hero__content">
            <span class="detail-hero__badge" style="background:${badgeColor}22; color:${badgeColor}; border:1px solid ${badgeColor}44;">
              ${this._escape(data.fantasy_type || '旅行')}
            </span>
            <h1 class="detail-hero__title">${this._escape(data.title)}</h1>
          </div>
        </header>

        ${data.story_hook ? `<section class="detail-hook"><p class="detail-hook__quote">${this._escape(data.story_hook)}</p></section>` : ''}

        ${metaItems.length ? `<div class="detail-meta">${metaItems.join('')}</div>` : ''}

        ${tagsHtml || mbtiHtml ? `<div class="detail-chips">${tagsHtml}${mbtiHtml}</div>` : ''}

        ${moodsHtml ? `<div class="detail-moods">${moodsHtml}</div>` : ''}

        <section class="detail-cinematic" aria-label="沉浸式旅程简介">
          <section class="detail-scene detail-reveal">
            <span class="detail-scene__eyebrow">临时身份</span>
            <h2>${this._escape(roleText)}</h2>
            <p>${this._escape(sceneText[0])}</p>
          </section>
          <section class="detail-scene detail-scene--image detail-reveal">
            ${imageUrl ? `<img src="${imageUrl}" alt="${this._escape(data.title)}" loading="lazy" decoding="async">` : ''}
            <div>
              <span class="detail-scene__eyebrow">任务</span>
              <h2>${this._escape(missionText)}</h2>
              <p>${this._escape(sceneText[1])}</p>
            </div>
          </section>
          <section class="detail-scene detail-scene--split detail-reveal">
            <div class="detail-art-word">${this._escape(this._artWord(data))}</div>
            <p>${this._escape(sceneText[2])}</p>
          </section>
        </section>

        <section class="detail-story">${storyHtml}</section>

        <section class="detail-clue">
          <div class="detail-clue__card is-hidden" id="clue-card">
            <h2 class="detail-clue__title">旅行者秘笈</h2>
            <div class="detail-clue__list">${cluesHtml}</div>
          </div>
        </section>

        <div class="detail-cta">
          <button class="detail-cta__btn detail-cta__btn--primary" id="detail-cta-buy"
            ${data.price > 0 ? '' : 'disabled'}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>
            ${data.price > 0 ? '立即下单 (' + data.price.toLocaleString() + ' 币)' : '即将开放'}
          </button>
          <button class="detail-cta__btn detail-cta__btn--outline" id="detail-cta-save">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            收藏
          </button>
          <div class="detail-auth-notice" id="detail-auth-notice" hidden>
            请先登录后购买旅程。
            <button type="button" id="detail-auth-login">去登录</button>
          </div>
        </div>
      </article>
    `;

    this._bindEvents(data);
    this._setupParallax();
    this._setupScrollReveal();
  },

  _renderNotFound(container) {
    container.innerHTML = `
      <div class="detail-notfound">
        <h2 class="detail-notfound__title">旅程未找到</h2>
        <a href="#/explore" class="detail-notfound__back">返回探索页面</a>
      </div>
    `;
  },

  _bindEvents(data) {
    // Back button
    const backBtn = document.querySelector('.detail-hero__btn--back');
    if (backBtn) {
      backBtn.addEventListener('click', () => history.back());
    }

    // Share button
    const shareBtn = document.querySelector('.detail-hero__btn--share');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        const url = window.location.href;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).catch(() => {});
        }
        // Visual feedback
        shareBtn.dataset.copied = 'true';
        shareBtn.style.transform = 'scale(1.15)';
        setTimeout(() => {
          shareBtn.style.transform = '';
          delete shareBtn.dataset.copied;
        }, 1000);
      });
    }

    // CTA — buy
    const buyBtn = document.getElementById('detail-cta-buy');
    if (buyBtn && !buyBtn.disabled) {
      buyBtn.addEventListener('click', async () => {
        if (!API.isLoggedIn()) {
          this._showLoginNotice();
          return;
        }
        try {
          const res = await API.createOrder([{ journey_slug: data.slug, quantity: 1 }]);
          const order = res.data || res;
          const ok = confirm(`订单创建成功: ${order.order_no}\n金额: ${order.total_amount.toLocaleString()} 不思议币\n是否立即支付?`);
          if (ok) {
            await API.payOrder(order.id);
            alert('支付成功！');
            if (window.App && window.App.updateNav) window.App.updateNav();
          }
        } catch (err) {
          alert('下单失败: ' + (err.message || '请登录后再试'));
        }
      });
    }

    const loginBtn = document.getElementById('detail-auth-login');
    if (loginBtn) {
      loginBtn.addEventListener('click', () => Router.navigate('#/login'));
    }

    // Save button
    const saveBtn = document.getElementById('detail-cta-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        saveBtn.classList.toggle('is-saved');
        const isSaved = saveBtn.classList.contains('is-saved');
        saveBtn.innerHTML = isSaved
          ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>已收藏`
          : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>收藏`;
      });
    }
  },

  _showLoginNotice() {
    const notice = document.getElementById('detail-auth-notice');
    if (!notice) return;
    notice.hidden = false;
    notice.classList.add('is-visible');
    notice.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },

  _setupParallax() {
    const img = document.querySelector('.detail-hero__image');
    if (!img) return;

    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrollY = window.scrollY || window.pageYOffset;
          const rate = scrollY * 0.25;
          img.style.transform = `translateY(${rate}px)`;
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
  },

  _setupScrollReveal() {
    const targets = document.querySelectorAll('.detail-reveal, #clue-card');
    if (!targets.length) return;

    if (this._observer) {
      this._observer.disconnect();
    }

    this._observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.remove('is-hidden');
            entry.target.classList.add('is-revealed');
            this._observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2, rootMargin: '0px 0px -40px 0px' }
    );

    targets.forEach((target) => this._observer.observe(target));
  },

  _roleFor(data) {
    const firstMbti = (data.mbti_types || [])[0]?.mbti_type?.code || '旅人';
    if ((data.fantasy_type || '').includes('night')) return `给 ${firstMbti} 的夜行观测者身份`;
    if ((data.fantasy_type || '').includes('extreme')) return `给 ${firstMbti} 的边界勘探者身份`;
    if ((data.fantasy_type || '').includes('spiritual')) return `给 ${firstMbti} 的静默修行者身份`;
    return `给 ${firstMbti} 的隐秘世界访客身份`;
  },

  _missionFor(data) {
    const title = data.title || '这段旅程';
    if (data.story_hook) return data.story_hook;
    return `用半天到一天，找到「${title}」真正让你停下来的那个瞬间。`;
  },

  _artWord(data) {
    const words = data.mood_keywords || [];
    return words[0] || data.fantasy_type || '桃源';
  },

  _metaIcon(type, value) {
    const icons = {
      region: `<svg class="detail-meta__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
      duration: `<svg class="detail-meta__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
      cost: `<svg class="detail-meta__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
      price: `<svg class="detail-meta__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>`,
    };
    return `<span class="detail-meta__item">${icons[type] || ''}${this._escape(String(value))}</span>`;
  },

  _bestSeason(region) {
    if (!region) return '春秋两季气候最为宜人，是探索的最佳时机。';
    const cold = ['冰岛', '挪威', '芬兰', '阿拉斯加', '西伯利亚', '西藏'];
    const hot = ['泰国', '越南', '印尼', '印度', '埃及', '摩洛哥'];
    if (cold.some((r) => region.includes(r))) return '夏季（6-8月）是最佳探索窗口，日照时间长，气温相对温和。';
    if (hot.some((r) => region.includes(r))) return '旱季（11月-次年3月）天气干爽，最适合户外活动。';
    return '春秋两季气候最为宜人，是探索的最佳时机。';
  },

  _gearAdvice(adventure, risk) {
    const a = adventure || 5;
    const r = risk || 5;
    if (a > 7 && r > 6) return '专业户外装备必备：防水登山靴、多层保暖衣物、急救包、卫星通讯设备。';
    if (a > 6) return '建议携带：舒适徒步鞋、快干衣物、便携雨衣、头灯。';
    if (r > 6) return '建议携带：基础急救包、备用电源、保暖外套、应急食品。';
    return '轻装出行即可：舒适步行鞋、防晒霜、便携水壶、相机。';
  },

  _escape(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  _icons: {
    localGuide: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    season: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>`,
    gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
    infp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  },
};
