/**
 * AI Pet — 8-bit pixel art floating companion
 * Gender-neutral, cute pixel style. User chooses dog/cat after registration.
 * Personality saved to localStorage. Rule-based mock AI engine.
 * MBTI: 5-question weighted scoring (no dimension空缺)
 */

const AIPet = (() => {
  const STORAGE_KEY = 'ai_pet_profile';

  const defaultProfile = {
    name: '小旅',
    type: 'dog',
    color: '#e8d5a3',
    mbti: null,
    firstVisit: true,
    chatHistory: [],
  };

  function getProfile() {
    try {
      return { ...defaultProfile, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
    } catch { return { ...defaultProfile }; }
  }

  function saveProfile(p) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  }

  // ── MBTI 5-question weighted quiz ──
  // Each question contributes to ALL 4 dimensions via weighted scores
  const quizQuestions = [
    {
      q: '在一个陌生的城市，你更倾向于：',
      options: [
        { text: '走进热闹的市集，和当地人聊天', weights: { E: +2, I: 0, S: 0, N: 0, F: 0, T: 0, J: 0, P: 0 } },
        { text: '独自探索安静的小巷和咖啡馆', weights: { E: 0, I: +2, S: 0, N: 0, F: 0, T: 0, J: 0, P: 0 } },
      ]
    },
    {
      q: '面对旅行中的突发状况，你通常：',
      options: [
        { text: '立即寻找实际可行的解决方案', weights: { E: 0, I: 0, S: +2, N: 0, F: 0, T: 0, J: 0, P: 0 } },
        { text: '把这看作一次意想不到的冒险', weights: { E: 0, I: 0, S: 0, N: +2, F: 0, T: 0, J: 0, P: 0 } },
      ]
    },
    {
      q: '选择旅行目的地时，什么最吸引你？',
      options: [
        { text: '能触动内心、产生共鸣的地方', weights: { E: 0, I: 0, S: 0, N: 0, F: +2, T: 0, J: 0, P: 0 } },
        { text: '有独特地理或历史价值的地方', weights: { E: 0, I: 0, S: 0, N: 0, F: 0, T: +2, J: 0, P: 0 } },
      ]
    },
    {
      q: '旅行前，你通常会：',
      options: [
        { text: '做详细攻略，预订好每一天', weights: { E: 0, I: 0, S: 0, N: 0, F: 0, T: 0, J: +2, P: 0 } },
        { text: '只定大方向，随机应变', weights: { E: 0, I: 0, S: 0, N: 0, F: 0, T: 0, J: 0, P: +2 } },
      ]
    },
    {
      q: '旅途中遇到美景，你的第一反应是：',
      options: [
        { text: '仔细观察细节，记住此刻的感受', weights: { E: 0, I: +1, S: +1, N: 0, F: +1, T: 0, J: 0, P: 0 } },
        { text: '想象这里背后的故事和可能性', weights: { E: +1, I: 0, S: 0, N: +1, F: 0, T: +1, J: 0, P: 0 } },
      ]
    },
  ];

  function scoreMBTI(answers) {
    // answers: array of indices (0 or 1) for each question
    const scores = { E: 0, I: 0, S: 0, N: 0, F: 0, T: 0, J: 0, P: 0 };
    answers.forEach((ansIdx, qIdx) => {
      const weights = quizQuestions[qIdx].options[ansIdx].weights;
      Object.entries(weights).forEach(([dim, val]) => {
        scores[dim] += val;
      });
    });

    // Tie-breaker: if equal, default to the more "introverted/intuitive/feeling/perceiving" side
    // (travel personality bias toward explorers)
    const code = [
      scores.E > scores.I ? 'E' : (scores.E < scores.I ? 'I' : 'I'),
      scores.S > scores.N ? 'S' : (scores.S < scores.N ? 'N' : 'N'),
      scores.F > scores.T ? 'F' : (scores.F < scores.T ? 'T' : 'F'),
      scores.J > scores.P ? 'J' : (scores.J < scores.P ? 'P' : 'P'),
    ].join('');

    return { code, scores };
  }

  function getQuizQuestion(step) {
    if (step >= 1 && step <= quizQuestions.length) {
      return quizQuestions[step - 1];
    }
    return null;
  }

  // ── Rule-based AI responses ──
  function generateReply(message, profile) {
    const m = message.toLowerCase();
    const name = profile.name || '小旅';

    if (/你好|hi|hello|在吗|嗨/.test(m)) {
      return {
        text: `嗨~！我是${name} ✨ 你的专属旅行向导宠物！我可以帮你找不可思议的旅行，或者做个性格测试，给你推荐最适合你的体验~`,
        actions: [
          { type: 'button', label: '✨ 推荐旅行', action: 'recommend' },
          { type: 'button', label: '🌟 性格测试', action: 'mbti_quiz' },
        ]
      };
    }

    if (/推荐|想去|建议|旅行|哪里|好玩/.test(m)) {
      return {
        text: '好呀！让我为你找找那些不可思议的旅行体验 ✨ 根据你的浏览记录，我觉得这些可能会让你心动！',
        actions: [
          { type: 'recommend', label: '查看推荐', data: { reason: '基于兴趣匹配' } }
        ]
      };
    }

    if (/性格|mbti|人格|测试|我是|类型/.test(m)) {
      return {
        text: '来做个小测试吧！回答5个简单的问题，我就能知道你的旅行人格类型，然后给你推荐最适合的旅行~ 🌈',
        actions: [
          { type: 'mbti_quiz', label: '开始测试', data: { step: 1 } }
        ]
      };
    }

    if (/难|危险|风险|安全|怕/.test(m)) {
      return {
        text: '每个旅程都有风险等级哦！从 ●○○○○ 休闲 到 ●●●●● 极限。我会根据你的接受程度推荐合适的体验~',
        actions: [
          { type: 'filter', label: '只看低风险', data: { risk_max: 2 } },
          { type: 'filter', label: '挑战一下', data: { risk_min: 3 } },
        ]
      };
    }

    if (/谢谢|感谢|爱你|棒|厉害/.test(m)) {
      return {
        text: `嘻嘻~ 能帮到你我很开心！🎉 我会一直在这里，随时准备陪你发现新的不可思议 ✨`,
        actions: []
      };
    }

    if (/再见|拜拜|bye|晚安/.test(m)) {
      return {
        text: '再见~！祝你的下一段旅程充满惊喜！🌙 需要我的时候随时叫我哦~',
        actions: []
      };
    }

    return {
      text: `嗯... 我不太确定你在说什么呢 😅 你可以试试跟我说 "推荐旅行"、"性格测试" 或者 "你好"~`,
      actions: [
        { type: 'button', label: '推荐旅行', action: 'recommend' },
        { type: 'button', label: '性格测试', action: 'mbti_quiz' },
      ]
    };
  }

  // ── Trigger logic ──
  function shouldTrigger(profile, pageViews, idleMs) {
    if (profile.firstVisit) return 'welcome';
    if (pageViews >= 3) return 'page_views';
    if (idleMs >= 10000) return 'idle'; // 10 seconds
    return null;
  }

  return {
    getProfile,
    saveProfile,
    generateReply,
    getQuizQuestion,
    scoreMBTI,
    shouldTrigger,
    quizLength: quizQuestions.length,
  };
})();
