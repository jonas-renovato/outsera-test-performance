import { config, summaryTrendStats } from '../config/environment.js';
import { userJourney } from '../lib/api.js';
import { buildThresholds } from '../lib/thresholds.js';
import { buildSummary } from '../lib/summary.js';

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: config.smoke.vus,
      duration: config.smoke.duration,
    },
  },
  thresholds: buildThresholds({ avg: 500, p95: 800, p99: 1500 }),
  summaryTrendStats,
};

export default userJourney;

export function handleSummary(data) {
  return buildSummary('smoke', data);
}
