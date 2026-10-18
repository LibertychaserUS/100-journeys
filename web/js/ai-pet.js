/**
 * AI Pet — rule-based travel guide ("小旅" / "Lumi"). Keyword rules and a 5-question
 * weighted MBTI quiz, in Chinese and English. Profile (name, last MBTI) lives in localStorage.
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

  // Each answer adds weight to one or more MBTI letters.
  const quiz = [
    { zh: '在一个陌生的城市，你更倾向于：', en: 'In an unfamiliar city, you would rather:',
      options: [
        { zh: '走进热闹的市集，和当地人聊天', en: 'Dive into a busy market and chat with locals', w: { E: 2 } },
        { zh: '独自探索安静的小巷和咖啡馆', en: 'Wander quiet lanes and cafés on your own', w: { I: 2 } }] },
    { zh: '面对旅行中的突发状况，你通常：', en: 'When plans fall apart on the road, you usually:',
      options: [
        { zh: '立即寻找实际可行的解决方案', en: 'Look for a practical fix right away', w: { S: 2 } },
        { zh: '把这看作一次意想不到的冒险', en: 'Treat it as an unexpected adventure', w: { N: 2 } }] },
    { zh: '选择旅行目的地时，什么最吸引你？', en: 'What pulls you towards a destination?',
      options: [
        { zh: '能触动内心、产生共鸣的地方', en: 'A place that moves you', w: { F: 2 } },
        { zh: '有独特地理或历史价值的地方', en: 'A place with remarkable geography or history', w: { T: 2 } }] },
    { zh: '旅行前，你通常会：', en: 'Before a trip, you tend to:',
      options: [
        { zh: '做详细攻略，预订好每一天', en: 'Plan and book every day in advance', w: { J: 2 } },
        { zh: '只定大方向，随机应变', en: 'Pick a direction and improvise', w: { P: 2 } }] },
    { zh: '旅途中遇到美景，你的第一反应是：', en: 'Faced with a stunning view, your first instinct is to:',
      options: [
        { zh: '仔细观察细节，记住此刻的感受', en: 'Take in the details and remember how it feels', w: { I: 1, S: 1, F: 1 } },
        { zh: '想象这里背后的故事和可能性', en: 'Imagine the stories and possibilities behind it', w: { E: 1, N: 1, T: 1 } }] },
  ];

  function question(step) {
    const q = quiz[step - 1];
    if (!q) return null;
    const l = I18n.lang;
    return { q: q[l], options: q.options.map((o) => ({ text: o[l] })) };
  }

  function scoreMBTI(answers) {
    const s = { E: 0, I: 0, S: 0, N: 0, F: 0, T: 0, J: 0, P: 0 };
    answers.forEach((a, i) => Object.entries(quiz[i].options[a].w).forEach(([k, v]) => { s[k] += v; }));
    // Ties lean towards the explorer side (I, N, F, P).
    const code = (s.E > s.I ? 'E' : 'I') + (s.S > s.N ? 'S' : 'N') + (s.T > s.F ? 'T' : 'F') + (s.J > s.P ? 'J' : 'P');
    return { code, scores: s };
  }

  const R = {
    zh: {
      hello: () => `嗨，我是${name()}，你的旅行向导。可以帮你推荐旅程，或者做个 5 题小测试，看看你的旅行人格。`,
      recommend: '好呀，我按你的旅行人格挑几段旅程给你。',
      quiz: '回答 5 个小问题，我就能猜出你的旅行人格，再按它推荐旅程。',
      risk: '每段旅程都标了冒险指数。想先从轻松的开始，还是来点硬核的？',
      thanks: '能帮到你我很开心，随时叫我。',
      bye: '祝下一段旅程充满惊喜，需要时随时找我。',
      fallback: '我还在学习听懂更多话。可以试试说「推荐旅行」或「性格测试」。',
      btnRecommend: '推荐旅程', btnQuiz: '性格测试', btnEasy: '只看轻松的', btnHard: '来点硬核的',
      finding: '我找找看…', found: '这几段可能适合你：', none: '暂时没找到合适的，换个条件试试？', offline: '网络好像有点问题，等下再试试。',
      quizStep: (n, total) => `第 ${n}/${total} 题`,
      quizDone: (code) => `测试完成！你的旅行人格是 ${code}（${MBTI.name(code)}）。`,
      quizSaved: '已经保存到你的账户。',
      quizLogin: '登录后可以把它保存到账户里。',
      keywords: { hello: /你好|嗨|在吗|hi|hello/, recommend: /推荐|想去|建议|去哪|好玩|旅行/, quiz: /性格|mbti|人格|测试|类型/, risk: /难|危险|风险|安全|怕|冒险/, thanks: /谢谢|感谢|棒|厉害/, bye: /再见|拜拜|bye|晚安/ },
    },
    en: {
      hello: () => `Hi, I'm ${name()}, your travel guide. I can recommend journeys, or run a 5-question quiz to find your travel personality.`,
      recommend: 'Sure. Here are a few journeys picked for your travel personality.',
      quiz: 'Answer 5 quick questions and I’ll guess your travel personality, then recommend journeys for it.',
      risk: 'Every journey has an adventure level. Start with something easy, or go hardcore?',
      thanks: 'Happy to help. Call me any time.',
      bye: 'Have a wonderful next journey. I’m here whenever you need me.',
      fallback: 'I’m still learning. Try “recommend” or “personality quiz”.',
      btnRecommend: 'Recommend journeys', btnQuiz: 'Personality quiz', btnEasy: 'Only easy ones', btnHard: 'Go hardcore',
      finding: 'Let me look…', found: 'These might suit you:', none: 'Nothing matched. Try something else?', offline: 'The network seems to be down. Try again in a moment.',
      quizStep: (n, total) => `Question ${n}/${total}`,
      quizDone: (code) => `Done! Your travel personality is ${code} (${MBTI.name(code)}).`,
      quizSaved: 'Saved to your account.',
      quizLogin: 'Log in to save it to your account.',
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
    getProfile, saveProfile, name, reply, question, scoreMBTI,
    copy: () => R[I18n.lang],
    quizLength: quiz.length,
    generateReply: reply, // kept for older callers
  };
})();
