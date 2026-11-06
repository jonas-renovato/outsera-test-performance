import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { config } from '../config/environment.js';

export const errorRate = new Rate('business_error_rate');
export const loginDuration = new Trend('login_duration', true);

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function request(name, method, path, body) {
  const params = { tags: { name }, headers: JSON_HEADERS };
  const url = `${config.baseUrl}${path}`;
  return method === 'POST'
    ? http.post(url, JSON.stringify(body), params)
    : http.get(url, params);
}

function validate(res, checks) {
  const ok = check(res, checks);
  errorRate.add(!ok);
  return ok;
}

const json = (res) => {
  try {
    return res.json();
  } catch (_) {
    return null;
  }
};

export function listUsers() {
  const res = request('GET /users', 'GET', '/users');
  validate(res, {
    'GET /users: status 200': (r) => r.status === 200,
    'GET /users: lista de usuários': (r) => {
      const body = json(r);
      return !!body && Array.isArray(body.users) && body.users.length > 0;
    },
  });
}

export function getUser() {
  const res = request('GET /users/1', 'GET', '/users/1');
  validate(res, {
    'GET /users/1: status 200': (r) => r.status === 200,
    'GET /users/1: id correto': (r) => (json(r) || {}).id === 1,
  });
}

export function login() {
  const res = request('POST /auth/login', 'POST', '/auth/login', config.credentials);
  loginDuration.add(res.timings.duration);
  validate(res, {
    'POST /auth/login: status 200': (r) => r.status === 200,
    'POST /auth/login: token retornado': (r) => !!(json(r) || {}).accessToken,
  });
}

export function userJourney() {
  group('users', () => {
    listUsers();
    getUser();
  });
  group('auth', login);
  sleep(config.thinkTimeSeconds);
}
