// Limites por endpoint: a latência de cada rota é avaliada separadamente
// para que uma rota lenta não seja mascarada pela média global.
const endpoints = ['GET /users', 'GET /users/1', 'POST /auth/login'];

export function buildThresholds({ p95, p99, avg, maxErrorRate = 0.01 }) {
  const thresholds = {
    http_req_failed: [`rate<${maxErrorRate}`],
    business_error_rate: [`rate<${maxErrorRate}`],
    checks: ['rate>0.99'],
    http_req_duration: [`avg<${avg}`, `p(95)<${p95}`, `p(99)<${p99}`],
  };
  for (const name of endpoints) {
    thresholds[`http_req_duration{name:${name}}`] = [`p(95)<${p95}`];
  }
  return thresholds;
}
