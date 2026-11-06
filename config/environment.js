const num = (name, fallback) => {
  const value = Number(__ENV[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const str = (name, fallback) => __ENV[name] || fallback;

export const config = {
  baseUrl: str('BASE_URL', 'https://dummyjson.com').replace(/\/+$/, ''),
  credentials: {
    username: str('AUTH_USERNAME', 'emilys'),
    password: str('AUTH_PASSWORD', 'emilyspass'),
  },
  thinkTimeSeconds: num('THINK_TIME', 1),
  smoke: {
    vus: num('SMOKE_VUS', 10),
    duration: str('SMOKE_DURATION', '30s'),
  },
  load: {
    vus: num('LOAD_VUS', 500),
    duration: str('LOAD_DURATION', '5m'),
    rampUp: str('LOAD_RAMP_UP', '30s'),
    rampDown: str('LOAD_RAMP_DOWN', '30s'),
  },
};

export const summaryTrendStats = ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'];
