/**
 * AI Pet — 8-bit pixel art floating companion
 * Gender-neutral, cute pixel style. User chooses dog/cat after registration.
 * Personality saved to localStorage. Rule-based mock AI engine.
 */

const AIPet = (() => {
  const STORAGE_KEY = 'ai_pet_profile';

  // Default profile
  const defaultProfile = {
    name: '小旅',
    type: 'dog',        // 'dog' | 'cat'
    color: '#e8d5a3',
    mbti: null,
    firstVisit: true,
  };

  function getProfile() {
    try {
      return { ...defaultProfile, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
    } catch { return { ...defaultProfile }; }
  }

  function saveProfile(p) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  }

  // Rule-based mock AI responses
  function generateReply(message, profile) {
    const m = message.toLowerCase();
    const name = profile.name || '小旅';

    if (/你好|hi|hello|在吗/.test(m)) {
      return {
        text: `嗨！我是${name}，你的旅行向导宠物 ✨ 我可以帮你推荐不可思议的旅行体验，或者聊聊你是什么性格类型~`,
        actions: [
          { type: 'button', label: '推荐旅行', action: 'recommend' },
          { type: 'button', label: '测测性格', action: 'mbti_quiz' },
        ]
      };
    }

    if (/推荐|想去|建议|旅行|哪里/.test(m)) {
      return {
        text: '根据你的浏览记录，我觉得这几种体验可能适合你！要不要看看？',
        actions: [
          { type: 'recommend', label: '查看推荐', data: { reason: '基于兴趣匹配' } }
        ]
      };
    }

    if (/性格|mbti|我是|测测|类型/.test(m)) {
      return {
        text: '好呀！让我来猜猜你的旅行人格~ 回答3个小问题就好！',
        actions: [
          { type: 'mbti_quiz', label: '开始测试', data: { step: 1, question: '你更喜欢独自旅行还是和朋友一起？' } }
        ]
      };
    }

    if (/难|危险|风险|安全/.test(m)) {
      return {
        text: '每个体验都有风险等级哦！从●○○○○（休闲）到●●●●●（极限）。我会根据你的承受能力推荐合适的~',
        actions: [
          { type: 'filter', label: '只看低风险', data: { risk_max: 2 } }
        ]
      };
    }

    if (/谢谢|感谢|拜拜|再见/.test(m)) {
      return {
        text: '不客气！随时叫我哦~ 我会在角落里默默关注你的旅行灵感 ✨',
        actions: []
      };
    }

    return {
      text: '我不太理解呢... 你可以试试说"推荐旅行"、"测测性格"或者"你好"~',
      actions: [
        { type: 'button', label: '推荐旅行', action: 'recommend' },
        { type: 'button', label: '测性格', action: 'mbti_quiz' },
      ]
    };
  }

  // Simple 3-question MBTI quiz
  const quizQuestions = [
    { q: '你更喜欢独自旅行还是和朋友一起？', a: { A: '独自', B: '和朋友' }, key: 'I/E' },
    { q: '旅行时你更关注风景还是人文故事？', a: { A: '风景', B: '人文' }, key: 'S/N' },
    { q: '行程没有按计划进行，你会？', a: { A: '焦虑调整', B: '随遇而安' }, key: 'J/P' },
  ];

  function getQuizStep(step) {
    if (step <= quizQuestions.length) {
      return quizQuestions[step - 1];
    }
    return null;
  }

  function inferMBTI(answers) {
    // Simple inference from 3 answers
    const map = { 'I/E': { A: 'I', B: 'E' }, 'S/N': { A: 'S', B: 'N' }, 'J/P': { A: 'J', B: 'P' } };
    let code = '';
    answers.forEach((a, i) => {
      const key = quizQuestions[i].key;
      code += map[key][a] || 'X';
    });
    return code;
  }

  // Trigger conditions for auto-popup
  function shouldAutoPopup(profile) {
    if (profile.firstVisit) return true;
    // After 20s of browsing on explore page
    return false; // Handled by page-specific logic
  }

  return {
    getProfile,
    saveProfile,
    generateReply,
    getQuizStep,
    inferMBTI,
    shouldAutoPopup,
    quizQuestions,
  };
})();
