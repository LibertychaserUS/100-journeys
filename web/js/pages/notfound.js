var Pages = window.Pages || {};

Pages.NotFound = {
  render() {
    const main = document.getElementById('main-content');
    if (!main) return;

    main.innerHTML = `
      <section class="notfound-page">
        <div class="notfound-code">404</div>
        <h1 class="notfound-title">页面走失了</h1>
        <p class="notfound-desc">你寻找的旅程似乎不在地图上。也许它正在某个未知的角落等待被发现。</p>
        <div class="notfound-actions">
          <a href="#/" class="notfound-btn notfound-btn--primary">返回首页</a>
          <a href="#/explore" class="notfound-btn notfound-btn--ghost">探索旅程</a>
        </div>
      </section>
    `;
  },
};
