/**
 * AI pet widget — floating guide button + chat panel (non-modal dialog).
 * Exposes window.Pet = { open, close, startQuiz } for other pages (e.g. the profile quiz link).
 */
(function () {
  const container = document.getElementById('ai-pet');
  if (!container) return;
  const esc = UI.esc;
  let open = false;
  const history = []; // { who: 'pet'|'user', html }

  function render() {
    container.innerHTML = `
      <section class="ai-pet__chat" id="ai-pet-chat" role="dialog" aria-modal="false" aria-labelledby="ai-pet-title" ${open ? '' : 'hidden'}>
        <header class="ai-pet__header">
          <img class="ai-pet__face" src="${API.mediaUrl('generated/guide-light-128.png')}" alt="" width="36" height="36">
          <div><h2 class="ai-pet__name" id="ai-pet-title">${esc(AIPet.name())}</h2><p class="ai-pet__status">${esc(t('pet.status'))}</p></div>
          <button class="icon-btn ai-pet__close" id="ai-pet-close" type="button" aria-label="${esc(t('pet.close'))}">${UI.icon('close')}</button>
        </header>
        <div class="ai-pet__messages" id="ai-pet-messages" aria-live="polite"></div>
        <form class="ai-pet__input-area" id="ai-pet-form">
          <label class="sr-only" for="ai-pet-input">${esc(t('pet.inputLabel'))}</label>
          <input class="ai-pet__input" id="ai-pet-input" autocomplete="off" placeholder="${esc(t('pet.inputPh'))}">
          <button class="btn btn--primary btn--sm ai-pet__send" id="ai-pet-send" type="submit">${esc(t('pet.send'))}</button>
        </form>
      </section>
      <button class="ai-pet__avatar ${open ? '' : 'ai-pet__avatar--hint'}" id="ai-pet-avatar" type="button" aria-expanded="${open}" aria-controls="ai-pet-chat" aria-label="${esc(t('pet.open'))}">
        <img src="${API.mediaUrl('generated/guide-light-128.png')}" alt="" width="40" height="40">
      </button>`;
    const msgs = container.querySelector('#ai-pet-messages');
    msgs.innerHTML = history.map((m) => `<div class="ai-pet__msg ai-pet__msg--${m.who}">${m.html}</div>`).join('');
    msgs.scrollTop = msgs.scrollHeight;
  }

  function addMessage(who, html) {
    history.push({ who, html });
    const msgs = container.querySelector('#ai-pet-messages');
    if (!msgs) return;
    const div = document.createElement('div');
    div.className = `ai-pet__msg ai-pet__msg--${who}`;
    div.innerHTML = html;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function petSay(text, actions = []) {
    const buttons = actions.length
      ? `<div class="ai-pet__actions">${actions.map((a) => `<button class="chip chip--sm ai-pet__action-btn" type="button" data-pet-action="${esc(a.type)}" data-value="${esc(a.value || '')}">${esc(a.label)}</button>`).join('')}</div>`
      : '';
    addMessage('pet', `<p>${esc(text)}</p>${buttons}`);
  }

  function setOpen(next, { focus = true } = {}) {
    open = next;
    const chat = container.querySelector('#ai-pet-chat');
    const avatar = container.querySelector('#ai-pet-avatar');
    chat.hidden = !open;
    avatar.setAttribute('aria-expanded', String(open));
    avatar.classList.remove('ai-pet__avatar--hint');
    if (open && !history.length) petSay(AIPet.copy().hello(), [{ type: 'recommend', label: AIPet.copy().btnRecommend }, { type: 'quiz', label: AIPet.copy().btnQuiz }]);
    if (open && focus) container.querySelector('#ai-pet-input').focus();
    if (!open && focus) avatar.focus();
  }

  async function recommend() {
    const c = AIPet.copy();
    const mbti = Guest.mbti();
    petSay(c.finding);
    try {
      const res = await API.getJourneys(mbti ? { mbti, limit: 3 } : { limit: 3 });
      const list = res.data || [];
      if (!list.length) { petSay(c.none); return; }
      addMessage('pet', `<p>${esc(c.found)}</p><ul class="ai-pet__links">${list.map((j) => `<li><a href="#/journey/${encodeURIComponent(j.slug)}">${esc(j.title)}</a></li>`).join('')}</ul>`);
    } catch {
      petSay(c.offline);
    }
  }

  // The guide's walk lives on its own page (#/guide) so it can be resumed and measured.
  function startQuiz() {
    if (open) setOpen(false, { focus: false });
    API.track('path_pick', '', { path: 'pet', from: 'widget' });
    Router.navigate('/guide');
  }

  container.addEventListener('click', (e) => {
    if (e.target.closest('#ai-pet-avatar')) { setOpen(!open); return; }
    if (e.target.closest('#ai-pet-close')) { setOpen(false); return; }
    const action = e.target.closest('[data-pet-action]');
    if (action) {
      const type = action.dataset.petAction;
      if (type === 'recommend') recommend();
      else if (type === 'quiz') startQuiz();
      else if (type === 'filter') {
        const range = action.dataset.value === 'hard' ? 'adventure_min=8&adventure_max=10' : 'adventure_min=1&adventure_max=4';
        Router.navigate(`/explore?${range}`);
      }
      return;
    }
    if (e.target.closest('.ai-pet__links a') && window.matchMedia('(max-width: 760px)').matches) setOpen(false, { focus: false });
  });

  container.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = container.querySelector('#ai-pet-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addMessage('user', esc(text));
    const r = AIPet.reply(text);
    setTimeout(() => petSay(r.text, r.actions), 300);
  });

  container.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
  });

  // Close on navigation on small screens, where the panel covers the page.
  window.addEventListener('route:changed', () => {
    if (open && window.matchMedia('(max-width: 760px)').matches) setOpen(false, { focus: false });
  });
  I18n.onChange(() => { history.length = 0; render(); });

  render();
  window.Pet = { open: () => setOpen(true), close: () => setOpen(false), startQuiz };
})();
