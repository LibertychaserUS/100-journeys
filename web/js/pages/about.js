var Pages = window.Pages || {};

Pages.About = {
  render() {
    const main = document.getElementById('main-content');
    if (!main) return;
    main.innerHTML = `
      <section class="about-page">
        <div class="container">
          <p class="about-kicker">About</p>
          <h1>桃源百旅是一张通往非日常世界的邀请函。</h1>
          <p class="about-lead">
            它不是目的地清单，而是用心情、人格、幻想类型和临时身份组织旅行灵感的内容展示 MVP。
          </p>
          <div class="about-grid">
            <article>
              <h2>用户画像</h2>
              <p>面向 95 后/00 后、反向生活方式探索者、沉浸式内容爱好者，帮助他们从“去哪儿”转向“想进入什么世界”。</p>
            </article>
            <article>
              <h2>内容逻辑</h2>
              <p>每张卡片围绕情绪、MBTI、任务、线索和风险提示展开，避免只做普通攻略或打卡列表。</p>
            </article>
            <article>
              <h2>演示边界</h2>
              <p>订单、积分和虚拟币仅用于课程/实习作业演示，不连接真实支付、预订或商业服务。</p>
            </article>
          </div>
        </div>
      </section>
    `;
  },
};
