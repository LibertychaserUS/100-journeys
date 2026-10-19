/**
 * AI Pet — rule-based travel guide ("小旅" / "Lumi"), in Chinese and English. The walk that
 * finds a traveller's type lives on its own page (pages/guide.js). Profile lives in localStorage.
 */
const AIPet = (() => {
  const STORAGE_KEY = 'ai_pet_profile';
  const defaultProfile = { mbti: null, firstVisit: false };

  function getProfile() {
    try { return { ...defaultProfile, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; } catch { return { ...defaultProfile }; }
  }
  function saveProfile(p) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {}
  }
  const name = () => (I18n.lang === 'zh' ? '小旅' : 'Lumi');

  const R = {
    zh: {
      hello: () => `我是${name()}，提灯的人。可以帮你挑几段旅程，也可以陪你走六个路口，认出你的入口。`,
      recommend: '好呀，我按你的旅行人格挑几段旅程给你。',
      quiz: '跟我走六个路口，我就知道该把哪扇门指给你。',
      risk: '每段旅程都标了冒险指数。想先从轻松的开始，还是来点硬核的？',
      thanks: '能帮到你我很开心，随时叫我。',
      bye: '祝下一段旅程充满惊喜，需要时随时找我。',
      fallback: '我还在学习听懂更多话。可以试试说「推荐旅行」或「此刻开着哪扇门」。',
      btnRecommend: '推荐旅程', btnQuiz: '和小旅走一段', btnEasy: '只看轻松的', btnHard: '来点硬核的',
      finding: '我找找看…', found: '这几段可能适合你：', none: '暂时没找到合适的，换个条件试试？', offline: '网络好像有点问题，等下再试试。',
      keywords: { hello: /你好|嗨|在吗|hi|hello/, recommend: /推荐|想去|建议|去哪|好玩|旅行/, quiz: /性格|mbti|人格|测试|类型/, risk: /难|危险|风险|安全|怕|冒险/, thanks: /谢谢|感谢|棒|厉害/, bye: /再见|拜拜|bye|晚安/ },
    },
    en: {
      hello: () => `I'm ${name()}; I carry the lantern. I can pick a few journeys for you, or walk six turns with you to find your entrance.`,
      recommend: 'Sure. Here are a few journeys picked for your travel personality.',
      quiz: 'Walk six turns with me and I’ll know which doors to show you.',
      risk: 'Every journey has an adventure level. Start with something easy, or go hardcore?',
      thanks: 'Happy to help. Call me any time.',
      bye: 'Have a wonderful next journey. I’m here whenever you need me.',
      fallback: 'I’m still learning. Try “recommend” or “which doors are open now”.',
      btnRecommend: 'Recommend journeys', btnQuiz: 'Walk with Lumi', btnEasy: 'Only easy ones', btnHard: 'Go hardcore',
      finding: 'Let me look…', found: 'These might suit you:', none: 'Nothing matched. Try something else?', offline: 'The network seems to be down. Try again in a moment.',
      keywords: { hello: /\b(hi|hello|hey)\b|你好/, recommend: /recommend|suggest|where|trip|journey|推荐/, quiz: /personality|mbti|quiz|test|type|性格/, risk: /risk|danger|safe|scary|hard|easy|adventure/, thanks: /thank|great|awesome|nice/, bye: /bye|goodnight|see you/ },
    },
  };

  function reply(message) {
    const r = R[I18n.lang];
    const m = String(message || '').toLowerCase();
    const k = r.keywords;
    if (k.quiz.test(m)) return { text: r.quiz, actions: [{ type: 'quiz', label: r.btnQuiz }] };
    if (k.recommend.test(m)) return { text: r.recommend, actions: [{ type: 'recommend', label: r.btnRecommend }] };
    if (k.risk.test(m)) return { text: r.risk, actions: [{ type: 'filter', label: r.btnEasy, value: 'easy' }, { type: 'filter', label: r.btnHard, value: 'hard' }] };
    if (k.hello.test(m)) return { text: r.hello(), actions: [{ type: 'recommend', label: r.btnRecommend }, { type: 'quiz', label: r.btnQuiz }] };
    if (k.thanks.test(m)) return { text: r.thanks, actions: [] };
    if (k.bye.test(m)) return { text: r.bye, actions: [] };
    return { text: r.fallback, actions: [{ type: 'recommend', label: r.btnRecommend }, { type: 'quiz', label: r.btnQuiz }] };
  }

  return {
    getProfile, saveProfile, name, reply,
    copy: () => R[I18n.lang],
    generateReply: reply, // kept for older callers
  };
})();
