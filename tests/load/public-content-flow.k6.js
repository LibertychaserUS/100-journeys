import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = (__ENV.BASE_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '');
const VUS = Number(__ENV.VUS || 50);
const DURATION = __ENV.DURATION || '1m';

export const options = {
  scenarios: {
    public_content_flow: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<250'],
  },
};

export default function () {
  check(http.get(`${BASE_URL}/api/health`), { 'health 200': (r) => r.status === 200 });
  check(http.get(`${BASE_URL}/api/tags`), { 'tags 200': (r) => r.status === 200 });
  check(http.get(`${BASE_URL}/api/mbti`), { 'mbti 200': (r) => r.status === 200 });

  const list = http.get(`${BASE_URL}/api/journeys?limit=12&page=1`);
  check(list, {
    'journeys 200': (r) => r.status === 200,
    'journeys non-empty': (r) => (r.json('data') || []).length >= 5,
  });

  const journeys = list.json('data') || [];
  const slug = journeys[__ITER % journeys.length]?.slug || 'bolivia-salt-flat-trek';
  check(http.get(`${BASE_URL}/api/journeys/${slug}`), { 'detail 200': (r) => r.status === 200 });
  check(http.get(`${BASE_URL}/api/journeys?q=%E9%93%B6%E6%B2%B3&limit=12`), { 'search 200': (r) => r.status === 200 });
  check(http.get(`${BASE_URL}/api/journeys?mbti=INFP&limit=12`), { 'mbti filter 200': (r) => r.status === 200 });

  sleep(1);
}
