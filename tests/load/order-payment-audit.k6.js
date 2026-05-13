import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:8080';
const VUS = Number(__ENV.VUS || 20);
const DURATION = __ENV.DURATION || '1m';

export const options = {
  scenarios: {
    order_payment_audit: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<700'],
  },
};

export default function () {
  const token = registerUser();
  const auth = { Authorization: `Bearer ${token}` };

  const journeys = http.get(`${BASE_URL}/api/journeys?limit=1`).json('data') || [];
  const slug = journeys[0]?.slug || 'bolivia-salt-flat-trek';

  check(http.post(`${BASE_URL}/api/payments/recharge`, JSON.stringify({ amount: 50000 }), jsonHeaders(auth)), {
    'recharge persisted': (r) => r.status === 200,
  });

  const orderRes = http.post(`${BASE_URL}/api/orders`, JSON.stringify({
    items: [{ journey_slug: slug, quantity: 1 }],
  }), jsonHeaders(auth));
  check(orderRes, {
    'order created': (r) => r.status === 201,
    'order has unique no': (r) => !!r.json('data.order_no'),
  });
  const order = orderRes.json('data');

  const payRes = http.post(`${BASE_URL}/api/orders/${order.id}/pay`, null, { headers: auth });
  check(payRes, { 'order paid': (r) => r.status === 200 });

  const orders = http.get(`${BASE_URL}/api/orders`, { headers: auth });
  const txns = http.get(`${BASE_URL}/api/payments/transactions`, { headers: auth });
  check(orders, { 'paid order auditable': (r) => JSON.stringify(r.json('data')).includes(order.order_no) });
  check(txns, { 'transaction ledger auditable': (r) => (r.json('data') || []).some((t) => t.txn_type === 'purchase') });

  sleep(1);
}

function registerUser() {
  const stamp = `${__VU}-${__ITER}-${Date.now()}`;
  const captcha = getCaptcha();
  const res = http.post(`${BASE_URL}/api/auth/register`, JSON.stringify({
    username: '订单旅人',
    email: `order-${stamp}@example.com`,
    password: 'Ordertest123',
    gender: 'prefer_not_to_say',
    captcha_id: captcha.id,
    captcha_answer: captcha.answer,
  }), jsonHeaders());
  check(res, { 'order-flow register': (r) => r.status === 201 });
  return res.json('data.token');
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
