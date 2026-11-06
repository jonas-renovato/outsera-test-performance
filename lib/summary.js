import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

// Gera stdout legível + artefatos em reports/ (JSON completo e texto).
export function buildSummary(testName, data) {
  const text = textSummary(data, { indent: ' ', enableColors: false });
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    [`reports/${testName}-summary.json`]: JSON.stringify(data, null, 2),
    [`reports/${testName}-summary.txt`]: text,
  };
}
