import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = (__ENV.BASE_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '');
const VUS = Number(__ENV.VUS || 50);
const DURATION = __ENV.DURATION || '1m';

export const options = {
  scenarios: {
    pet_chat_analytics: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<650'],
  },
};

export default function () {
  const chat = http.post(`${BASE_URL}/api/ai/chat`, JSON.stringify({
    session_id: `pet-${__VU}`,
    message: __ITER % 2 === 0 ? '推荐旅行' : '性格测试',
  }), jsonHeaders());

  check(chat, {
    'pet reply ok': (r) => r.status === 200,
    'pet reply has text': (r) => !!r.json('data.reply'),
  });

  const event = http.post(`${BASE_URL}/api/analytics/events`, JSON.stringify({
    type: 'pet_reply',
    mbti_type: __VU % 2 === 0 ? 'ENFP' : 'INFP',
  }), jsonHeaders());
  check(event, { 'pet analytics accepted': (r) => r.status === 202 });

  sleep(1);
}

function jsonHeaders(extra = {}) {
  return { headers: { 'Content-Type': 'application/json', ...extra } };
}
