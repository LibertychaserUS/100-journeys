/**
 * AI Pet DOM Controller
 * Renders floating widget, setup modal, chat panel, MBTI quiz
 * Handles triggers: idle 10s, 3 page views
 */

(function() {
  const container = document.getElementById('ai-pet');
  if (!container) return;

  let profile = AIPet.getProfile();
  if (profile.firstVisit) {
    profile = { ...profile, name: profile.name || '小旅', type: profile.type || 'light', firstVisit: false };
    AIPet.saveProfile(profile);
  }
  let chatOpen = false;
  let pageViewCount = 0;
  let idleTimer = null;
  let quizAnswers = [];
  let quizStep = 0;

  // ── Render ──
  function render() {
    container.innerHTML = `
      ${renderChat()}
      ${renderAvatar()}
    `;
    bindEvents();
  }

  function renderSetup() {
    return '';
  }

  function renderAvatar() {
    return `
      <div class="ai-pet__avatar ${chatOpen ? '' : 'ai-pet__avatar--bounce'}" id="ai-pet-avatar">
        <img class="ai-pet__light" src="/static/assets/images/generated/guide-light.png" alt="旅行向导">
      </div>
    `;
  }

  function renderChat() {
    return `
      <div class="ai-pet__chat ${chatOpen ? 'ai-pet__chat--open' : ''}" id="ai-pet-chat">
        <div class="ai-pet__header">
          <div class="ai-pet__header-avatar">
            <img class="ai-pet__light" src="/static/assets/images/generated/guide-light.png" alt="">
          </div>
          <div>
            <div class="ai-pet__header-name">${profile.name || '小旅'}</div>
            <div class="ai-pet__header-status">在线</div>
          </div>
          <div class="ai-pet__close" id="ai-pet-close">✕</div>
        </div>
        <div class="ai-pet__messages" id="ai-pet-messages"></div>
        <div class="ai-pet__input-area">
          <input type="text" class="ai-pet__input" id="ai-pet-input" placeholder="和${profile.name || '小旅'}聊聊...">
          <button class="ai-pet__send" id="ai-pet-send">发送</button>
        </div>
      </div>
    `;
  }

  // ── Event Binding ──
  function bindEvents() {
    const avatar = document.getElementById('ai-pet-avatar');
    const close = document.getElementById('ai-pet-close');
    const send = document.getElementById('ai-pet-send');
    const input = document.getElementById('ai-pet-input');

    if (avatar) avatar.addEventListener('click', toggleChat);
    if (close) close.addEventListener('click', closeChat);
    if (send) send.addEventListener('click', sendMessage);
    if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });
  }

  // ── Setup ──
  function openSetup() {
    const modal = document.getElementById('ai-pet-setup');
    if (modal) modal.classList.add('ai-pet__setup--open');
  }

  function closeSetup() {
    const modal = document.getElementById('ai-pet-setup');
    if (modal) modal.classList.remove('ai-pet__setup--open');
  }

  function completeSetup() {
    const nameInput = document.getElementById('ai-pet-name');
    const selectedType = document.querySelector('.ai-pet__type-option--selected');
    const type = selectedType ? selectedType.dataset.type : 'dog';
    const name = nameInput ? nameInput.value.trim() : '小旅';

    profile = { ...profile, name: name || '小旅', type, firstVisit: false };
    AIPet.saveProfile(profile);
    closeSetup();
    render();
    openChat();
    addPetMessage(`嗨~ 我是${profile.name}！🎉 以后我会陪你发现不可思议的旅行~ 你想先做个性格测试，还是让我直接推荐？`);
  }

  // ── Chat ──
  function toggleChat() {
    chatOpen = !chatOpen;
    const chat = document.getElementById('ai-pet-chat');
    const avatar = document.getElementById('ai-pet-avatar');
    if (chat) chat.classList.toggle('ai-pet__chat--open', chatOpen);
    if (avatar) avatar.classList.toggle('ai-pet__avatar--bounce', !chatOpen);
  }

  function openChat() {
    chatOpen = true;
    const chat = document.getElementById('ai-pet-chat');
    const avatar = document.getElementById('ai-pet-avatar');
    if (chat) chat.classList.add('ai-pet__chat--open');
    if (avatar) avatar.classList.remove('ai-pet__avatar--bounce');
  }

  function closeChat() {
    chatOpen = false;
    const chat = document.getElementById('ai-pet-chat');
    const avatar = document.getElementById('ai-pet-avatar');
    if (chat) chat.classList.remove('ai-pet__chat--open');
    if (avatar) avatar.classList.add('ai-pet__avatar--bounce');
  }

  function addUserMessage(text) {
    const msgs = document.getElementById('ai-pet-messages');
    if (!msgs) return;
    const div = document.createElement('div');
    div.className = 'ai-pet__msg ai-pet__msg--user';
    div.textContent = text;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function addPetMessage(text, actions = []) {
    const msgs = document.getElementById('ai-pet-messages');
    if (!msgs) return;
    const div = document.createElement('div');
    div.className = 'ai-pet__msg ai-pet__msg--pet';
    div.innerHTML = escapeHtml(text);
    if (actions && actions.length > 0) {
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'ai-pet__actions';
      actions.forEach(a => {
        const btn = document.createElement('button');
        btn.className = 'ai-pet__action-btn';
        btn.textContent = a.label;
        btn.addEventListener('click', () => handleAction(a));
        actionsDiv.appendChild(btn);
      });
      div.appendChild(actionsDiv);
    }
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function sendMessage() {
    const input = document.getElementById('ai-pet-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addUserMessage(text);

    const result = AIPet.generateReply(text, profile);
    setTimeout(() => {
      addPetMessage(result.text, result.actions);
    }, 400 + Math.random() * 300);
  }

  function handleAction(action) {
    if (action.action === 'recommend' || action.type === 'recommend') {
      addPetMessage('让我为你找找... 🔍', []);
      // Trigger recommendation API
      API.getJourneys({ limit: 3 }).then(data => {
        const journeys = data.data || [];
        if (journeys.length > 0) {
          const msgs = document.getElementById('ai-pet-messages');
          if (msgs) {
            const div = document.createElement('div');
            div.className = 'ai-pet__msg ai-pet__msg--pet';
            let html = '为你找到了这些不可思议的旅行：✨<br>';
            journeys.forEach(j => {
              html += `<a href="#/journey/${encodeURIComponent(j.slug)}" class="ai-pet__journey-link" data-slug="${escapeHtml(j.slug)}">「${escapeHtml(j.title)}」</a><br>`;
            });
            html += '<br>点击名称查看详情哦！';
            div.innerHTML = html;
            msgs.appendChild(div);
            msgs.scrollTop = msgs.scrollHeight;

            // Bind router navigation
            div.querySelectorAll('.ai-pet__journey-link').forEach(link => {
              link.addEventListener('click', (e) => {
                e.preventDefault();
                const slug = link.dataset.slug;
                if (slug) Router.navigate(`#/journey/${encodeURIComponent(slug)}`);
              });
            });
          }
        } else {
          addPetMessage('抱歉，暂时没有符合条件的旅行推荐... 换个条件试试？');
        }
      }).catch(() => {
        addPetMessage('哎呀，网络有点问题... 等下再试试好吗？');
      });
    } else if (action.action === 'mbti_quiz' || action.type === 'mbti_quiz') {
      startQuiz();
    } else if (action.type === 'filter') {
      const params = new URLSearchParams();
      if (action.data?.risk_max != null) params.set('adventure_max', String(action.data.risk_max * 2));
      if (action.data?.risk_min != null) params.set('adventure_min', String(action.data.risk_min * 2));
      Router.navigate(`/explore${params.toString() ? '?' + params.toString() : ''}`);
      closeChat();
    }
  }

  // ── MBTI Quiz ──
  function startQuiz() {
    quizAnswers = [];
    quizStep = 1;
    showQuizQuestion();
  }

  function showQuizQuestion() {
    const q = AIPet.getQuizQuestion(quizStep);
    if (!q) {
      finishQuiz();
      return;
    }
    const msgs = document.getElementById('ai-pet-messages');
    if (!msgs) return;

    const div = document.createElement('div');
    div.className = 'ai-pet__msg ai-pet__msg--pet';
    div.innerHTML = `
      <div>问题 ${quizStep}/${AIPet.quizLength}：</div>
      <div style="margin: 8px 0; font-weight: 600;">${escapeHtml(q.q)}</div>
      <div class="ai-pet__quiz-options"></div>
    `;
    const optionsDiv = div.querySelector('.ai-pet__quiz-options');
    q.options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = 'ai-pet__quiz-option';
      btn.textContent = opt.text;
      btn.addEventListener('click', () => answerQuiz(idx));
      optionsDiv.appendChild(btn);
    });
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function answerQuiz(answerIdx) {
    quizAnswers.push(answerIdx);
    quizStep++;
    showQuizQuestion();
  }

  function finishQuiz() {
    const result = AIPet.scoreMBTI(quizAnswers);
    profile.mbti = result.code;
    AIPet.saveProfile(profile);

    addPetMessage(
      `🎉 测试完成！你的旅行人格是 ${result.code}！\n\n` +
      `让我为你推荐最适合 ${result.code} 型旅行者的不可思议体验~ ✨`,
      [{ type: 'recommend', label: '查看推荐' }]
    );
  }

  // ── Triggers ──
  function onPageView() {
    pageViewCount++;
  }

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
  }

  // ── Utilities ──
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, '<br>');
  }

  // ── Init ──
  document.addEventListener('mousemove', resetIdleTimer);
  document.addEventListener('keydown', resetIdleTimer);
  document.addEventListener('touchstart', resetIdleTimer);

  window.addEventListener('hashchange', () => {
    onPageView();
    resetIdleTimer();
  });

  // Count initial page load
  onPageView();
  resetIdleTimer();

  render();
})();
