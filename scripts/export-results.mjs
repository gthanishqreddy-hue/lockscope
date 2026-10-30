#!/usr/bin/env node
// Publishes engine result files to the dashboard as bundled datasets.
//
//   node scripts/export-results.mjs benchmark-results/sample/*.json
//
// Each file is checked for a LockScope schema, its origin is set to "bundled-sample" (the
// measurements themselves are untouched), it is copied to frontend/public/data/, and
// frontend/public/data/index.json is regenerated from everything in that folder.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'frontend', 'public', 'data');
const SCHEMAS = ['lockscope.benchmark/v1', 'lockscope.correctness/v1'];

const files = process.argv.slice(2).filter((f) => f.endsWith('.json'));
if (files.length === 0) {
  console.error('usage: node scripts/export-results.mjs <result.json>...');
  process.exit(2);
}

mkdirSync(dataDir, { recursive: true });
for (const file of files) {
  const report = JSON.parse(readFileSync(file, 'utf8'));
  if (!SCHEMAS.includes(report.schema)) {
    console.error(`skip ${file}: not a LockScope result file (schema ${report.schema})`);
    process.exitCode = 1;
    continue;
  }
  report.origin = 'bundled-sample';
  writeFileSync(join(dataDir, basename(file)), JSON.stringify(report, null, 2) + '\n');
  console.log(`published ${basename(file)}`);
}

function describe(report) {
  const env = report.environment;
  const where = `${env.osName} ${env.osArch}, ${env.availableProcessors} CPUs, Java ${env.javaVersion}`;
  if (report.schema === 'lockscope.benchmark/v1') {
    const m = report.methodology;
    return `${report.title}: JMH ${m.mode}, ${m.forks} fork(s) x ${m.measurementIterations} x ${m.measurementMillis} ms, on ${where}.`;
  }
  const s = report.summary;
  return `Correctness suite (${report.config.target.toLowerCase()}): ${s.passed} passed, ${s.failed} failed, ${s.controlsDetected} controls caught, on ${where}.`;
}

const datasets = readdirSync(dataDir)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .sort()
  .map((f) => ({ file: f, description: describe(JSON.parse(readFileSync(join(dataDir, f), 'utf8'))) }));
writeFileSync(join(dataDir, 'index.json'), JSON.stringify({ datasets }, null, 2) + '\n');
console.log(`index.json lists ${datasets.length} dataset(s)`);
