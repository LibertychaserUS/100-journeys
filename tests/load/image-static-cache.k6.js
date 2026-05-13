import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:8080';
const VUS = Number(__ENV.VUS || 100);
const DURATION = __ENV.DURATION || '1m';

const IMAGES = [
  '/static/assets/images/generated/hero-taoyuan.jpg',
  '/static/assets/images/generated/card-salt-mirror.jpg',
  '/static/assets/images/generated/card-lava-tunnel.jpg',
  '/static/assets/images/generated/card-temple-onsen.jpg',
  '/static/assets/images/generated/card-sahara-stars.jpg',
  '/static/assets/images/generated/card-greenland-sled.jpg',
];

export const options = {
  scenarios: {
    image_static_cache: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<80'],
  },
};

export default function () {
  const path = IMAGES[__ITER % IMAGES.length];
  const res = http.get(`${BASE_URL}${path}`);
  check(res, {
    'image 200': (r) => r.status === 200,
    'cache header present': (r) => String(r.headers['Cache-Control'] || '').includes('max-age'),
    'image under 600kb': (r) => Number(r.headers['Content-Length'] || 0) < 600 * 1024,
  });
  sleep(1);
}
