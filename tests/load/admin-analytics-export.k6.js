import http from 'k6/http';
import { check, fail, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:8080';
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || '';
const VUS = Number(__ENV.VUS || 5);
const DURATION = __ENV.DURATION || '1m';

export const options = {
  scenarios: {
    admin_analytics_export: {
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
  if (!ADMIN_TOKEN) fail('ADMIN_TOKEN is required for admin load test');

  const slug = __ITER % 2 === 0 ? 'bolivia-salt-flat-trek' : 'iceland-lava-tunnel-cycling';
  check(http.post(`${BASE_URL}/api/analytics/events`, JSON.stringify({
    type: 'journey_click',
    journey_slug: slug,
    mbti_type: __ITER % 2 === 0 ? 'INFP' : 'INTJ',
  }), jsonHeaders()), { 'analytics accepted': (r) => r.status === 202 });

  const auth = { Authorization: `Bearer ${ADMIN_TOKEN}` };
  const stats = http.get(`${BASE_URL}/api/admin/stats`, { headers: auth });
  check(stats, {
    'admin stats ok': (r) => r.status === 200,
    'admin stats include top clicks': (r) => Array.isArray(r.json('data.top_clicked_journeys')),
  });

  const exported = http.get(`${BASE_URL}/api/admin/export?format=csv`, { headers: auth });
  check(exported, {
    'admin export csv ok': (r) => r.status === 200,
    'admin export has metrics': (r) => r.body.includes('total_users'),
  });

  sleep(1);
}

function jsonHeaders(extra = {}) {
  return { headers: { 'Content-Type': 'application/json', ...extra } };
}
