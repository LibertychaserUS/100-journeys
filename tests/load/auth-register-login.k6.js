import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = (__ENV.BASE_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '');
const VUS = Number(__ENV.VUS || 20);
const DURATION = __ENV.DURATION || '1m';

export const options = {
  scenarios: {
    auth_register_login: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  const stamp = `${__VU}-${__ITER}-${Date.now()}`;
  const email = `load-${stamp}@example.com`;
  const password = 'Loadtest123';

  const registerCaptcha = getCaptcha();
  const register = http.post(`${BASE_URL}/api/auth/register`, JSON.stringify({
    username: '压力旅人',
    email,
    password,
    gender: __VU % 2 === 0 ? 'female' : 'male',
    captcha_id: registerCaptcha.id,
    captcha_answer: registerCaptcha.answer,
  }), jsonHeaders());

  check(register, {
    'register created': (r) => r.status === 201,
    'register returns token': (r) => !!r.json('data.token'),
  });

  const loginCaptcha = getCaptcha();
  const login = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    email,
    password,
    captcha_id: loginCaptcha.id,
    captcha_answer: loginCaptcha.answer,
  }), jsonHeaders());

  check(login, {
    'login ok': (r) => r.status === 200,
    'login returns token': (r) => !!r.json('data.token'),
  });

  sleep(1);
}

function getCaptcha() {
  const res = http.get(`${BASE_URL}/api/captcha`);
  const data = res.json('data');
  return { id: data.id, answer: solveMath(data.question) };
}

function solveMath(question) {
  const m = question.match(/(\d+)\s*([+-])\s*(\d+)/);
  if (!m) return '';
  const a = Number(m[1]);
  const b = Number(m[3]);
  return String(m[2] === '+' ? a + b : a - b);
}

function jsonHeaders(extra = {}) {
  return { headers: { 'Content-Type': 'application/json', ...extra } };
}
