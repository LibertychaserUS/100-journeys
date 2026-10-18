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
          <span class="ai-pet__face" data-lumi-slot="36">${Lumi.svg(Guest.mbti(), { size: 36 })}</span>
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
        <span data-lumi-slot="44">${Lumi.svg(Guest.mbti(), { size: 44 })}</span>
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

  // Free text goes to the model first; without a model reply in time, the local rules answer.
  const MODEL_WAIT = 10000;
  let asking = false;
  container.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = container.querySelector('#ai-pet-input');
    const text = input.value.trim();
    if (!text || asking) return;
    input.value = '';
    addMessage('user', esc(text));
    asking = true;
    addMessage('pet', `<p class="ai-pet__typing" aria-label="${esc(AIPet.copy().finding)}"><i></i><i></i><i></i></p>`);
    let answer = null;
    try {
      const res = await Promise.race([
        API.aiChat({ message: text, lang: I18n.lang, mbti_type: Guest.mbti(), session_id: Guest.vid() }),
        new Promise((resolve) => setTimeout(() => resolve(null), MODEL_WAIT)),
      ]);
      const d = res && res.data;
      if (d && d.source === 'deepseek' && d.reply) answer = d;
    } catch {}
    replaceLast(answer ? modelHtml(answer) : null);
    if (!answer) {
      const r = AIPet.reply(text);
      petSay(r.text, r.actions);
    }
    asking = false;
  });

  function modelHtml(d) {
    const rec = (d.actions || []).find((a) => a.type === 'recommend' && a.data && Array.isArray(a.data.journeys));
    const links = rec ? `<ul class="ai-pet__links">${rec.data.journeys.map((j) => `<li><a href="#/journey/${encodeURIComponent(j.slug)}">${esc(j.title)}</a></li>`).join('')}</ul>` : '';
    return `<p>${esc(d.reply)}</p>${links}`;
  }

  // Swaps the typing dots for the answer, or removes them when the rules will answer instead.
  function replaceLast(html) {
    const msgs = container.querySelector('#ai-pet-messages');
    const last = msgs && msgs.lastElementChild;
    if (html == null) {
      history.pop();
      if (last) last.remove();
      return;
    }
    history[history.length - 1].html = html;
    if (last) last.innerHTML = html;
  }

  container.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
  });

  // Close on navigation on small screens, where the panel covers the page.
  window.addEventListener('route:changed', () => {
    if (open && window.matchMedia('(max-width: 760px)').matches) setOpen(false, { focus: false });
  });
  I18n.onChange(() => { history.length = 0; render(); });

  render();
  // Lumi takes the traveller's form as soon as their type is known (or changes).
  let shownCode = Guest.mbti();
  function refreshLumi() {
    const code = Guest.mbti();
    if (code === shownCode) return;
    shownCode = code;
    container.querySelectorAll('[data-lumi-slot]').forEach((slot) => { slot.innerHTML = Lumi.svg(code, { size: Number(slot.dataset.lumiSlot) }); });
  }
  window.addEventListener('guest:updated', refreshLumi);
  window.addEventListener('session:updated', refreshLumi);

  window.Pet = { open: () => setOpen(true), close: () => setOpen(false), startQuiz };
})();
