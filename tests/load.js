import { config, summaryTrendStats } from '../config/environment.js';
import { userJourney } from '../lib/api.js';
import { buildThresholds } from '../lib/thresholds.js';
import { buildSummary } from '../lib/summary.js';

// Ramp-up evita medir o "cold start" de conexões; o platô mantém
// LOAD_VUS usuários simultâneos durante LOAD_DURATION.
export const options = {
  scenarios: {
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: config.load.rampUp, target: config.load.vus },
        { duration: config.load.duration, target: config.load.vus },
        { duration: config.load.rampDown, target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: buildThresholds({ avg: 800, p95: 1000, p99: 2000 }),
  summaryTrendStats,
};

export default userJourney;

export function handleSummary(data) {
  return buildSummary('load', data);
}
