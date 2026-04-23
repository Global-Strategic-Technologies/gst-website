#!/usr/bin/env node
/**
 * Reads .lighthouseci/lhr-*.json files and outputs a metrics snapshot to stdout.
 * Used by the perf-dashboard workflow to collect weekly Lighthouse data.
 */
import fs from 'fs';
import path from 'path';

const lhciDir = path.resolve('.lighthouseci');
if (!fs.existsSync(lhciDir)) {
  console.error('No .lighthouseci directory found');
  process.exit(1);
}

const jsonFiles = fs
  .readdirSync(lhciDir)
  .filter((f) => f.startsWith('lhr-') && f.endsWith('.json'))
  .sort();

if (jsonFiles.length === 0) {
  console.error('No lhr-*.json files found in .lighthouseci/');
  process.exit(1);
}

const pages = {};
for (const file of jsonFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(lhciDir, file), 'utf8'));
  const pagePath = new URL(data.requestedUrl).pathname || '/';
  pages[pagePath] = {
    performance: Math.round((data.categories.performance?.score || 0) * 100),
    fcp: Math.round(data.audits['first-contentful-paint'].numericValue),
    lcp: Math.round(data.audits['largest-contentful-paint'].numericValue),
    tbt: Math.round(data.audits['total-blocking-time'].numericValue),
    cls: parseFloat(data.audits['cumulative-layout-shift'].numericValue.toFixed(3)),
  };
}

const snapshot = {
  timestamp: new Date().toISOString(),
  commit: process.env.GITHUB_SHA || 'local',
  pages,
};

process.stdout.write(JSON.stringify(snapshot, null, 2) + '\n');
