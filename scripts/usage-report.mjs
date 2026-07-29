#!/usr/bin/env node
/**
 * Read the hook's usage log and answer one question: **is this thing actually being used?**
 *
 * The build plan for the plugin (`platform/plans/2026-07-29-idea-0023-mcp-platform-server-build.md`,
 * §Check-in runbook Q1) has a check-in on 2026-08-12 whose only purpose is to catch this platform's
 * named failure mode — built, verified, never used. Until this script existed that question had no
 * evidence behind it, because a hook that exits 0 on a clean file leaves no trace. Read the log,
 * don't guess.
 *
 * Run: node scripts/usage-report.mjs [--log <path>] [--days N]
 *
 * Reads metadata only — the log never contains a file path or a line of source (see the header of
 * `plugins/rulebook-frontend/hooks/check-file.mjs`).
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const LOG =
  flag('--log', null) ??
  process.env.RULEBOOK_USAGE_LOG ??
  join(homedir(), '.claude', 'rulebook-usage.jsonl');
const DAYS = Number(flag('--days', '21'));

let raw;
try {
  raw = readFileSync(LOG, 'utf8');
} catch (err) {
  // An absent log is genuinely ambiguous, and saying which is the whole value of this branch.
  console.log(`No usage log at ${LOG} (${err.code}).`);
  console.log(
    'That means ONE of: the hook has never fired, it is not installed, or logging is off',
  );
  console.log('(RULEBOOK_USAGE_LOG=off). It does NOT mean the checker found nothing — check');
  console.log('`claude plugin list` before concluding anything about usage.');
  process.exit(0);
}

const entries = [];
let malformed = 0;
for (const line of raw.split('\n')) {
  if (!line.trim()) continue;
  try {
    entries.push(JSON.parse(line));
  } catch {
    malformed++;
  }
}

if (entries.length === 0) {
  console.log(`${LOG} exists but holds no readable entry (${malformed} malformed line(s)).`);
  process.exit(0);
}

const cutoff = Date.now() - DAYS * 86_400_000;
const recent = entries.filter((e) => Date.parse(e.ts) >= cutoff);

const tally = (list, key) =>
  list.reduce((acc, e) => {
    const k = typeof key === 'function' ? key(e) : e[key];
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

const sorted = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);
const first = entries[0].ts.slice(0, 16).replace('T', ' ');
const last = entries.at(-1).ts.slice(0, 16).replace('T', ' ');

console.log(`rulebook usage — ${LOG}`);
console.log(`${entries.length} file check(s) from ${first} to ${last} (UTC)`);
if (malformed) console.log(`  (${malformed} malformed line(s) skipped)`);
console.log();

console.log(`Last ${DAYS} days: ${recent.length} check(s)`);
for (const [day, n] of sorted(tally(recent, (e) => e.ts.slice(0, 10))).sort()) {
  console.log(`  ${day}  ${'#'.repeat(Math.min(n, 40))} ${n}`);
}
console.log();

// `blocked` is the only outcome that changed what the model did. `clean` proves the gate ran and
// had nothing to say — which is a pass, not an absence. The error outcomes mean it verified
// NOTHING, and a run of those is the real alarm: a broken checker that looks like a quiet one.
const outcomes = tally(entries, 'outcome');
console.log('Outcomes:');
for (const [k, n] of sorted(outcomes)) console.log(`  ${k.padEnd(14)} ${n}`);
const dead = (outcomes['load-error'] ?? 0) + (outcomes['checker-error'] ?? 0);
if (dead > 0) {
  console.log(`  ⚠ ${dead} check(s) verified NOTHING — investigate before trusting any "clean".`);
}
console.log();

const rules = {};
for (const e of entries) for (const r of e.rules ?? []) rules[r] = (rules[r] ?? 0) + 1;
if (Object.keys(rules).length) {
  console.log('Rules that fired:');
  for (const [r, n] of sorted(rules)) console.log(`  ${r.padEnd(20)} ${n}`);
} else {
  console.log('No rule has ever fired — every checked file was clean.');
}
console.log();

console.log(
  `By extension: ${sorted(tally(entries, 'ext'))
    .map(([k, n]) => `${k}=${n}`)
    .join('  ')}`,
);
console.log(
  `Plugin versions seen: ${sorted(tally(entries, 'v'))
    .map(([k, n]) => `${k}=${n}`)
    .join('  ')}`,
);
