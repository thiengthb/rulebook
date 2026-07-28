#!/usr/bin/env node
/**
 * AC-1's falsification gate — Step 1.5 of the idea-0023 build plan.
 *
 * The claim under test: a consumer that holds only a `.mcp.json` receives real verdicts, and the
 * RULE TEXT that produced them never reaches its disk or its transcript. That claim is worth
 * exactly what this check is worth, so this is written to FIND a leak, not to bless a design.
 *
 * Method — deliberately blunt, because a clever test that passes proves less than a crude one:
 *   1. take the rulebook sources the server reads
 *   2. cut them into every contiguous N-word shingle (default 6), normalised for case/whitespace
 *   3. cut the consumer's disk + transcript into the same shingles
 *   4. report the intersection
 *
 * A shingle is used rather than whole sentences because a leak that paraphrases the first three
 * words still leaks. Common English is filtered by requiring the shingle to be distinctive — it
 * must not appear in a baseline of ordinary technical prose (the plan file itself), which keeps
 * "when to call the tool" from counting as a rulebook leak.
 *
 * Usage:
 *   node scripts/leak-check.mjs <consumer-dir> [--shingle 6]
 * Exit code 1 if anything leaked, so it can gate.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

const args = process.argv.slice(2);
const consumerDir = resolve(args[0] ?? '.');
const N = Number(args[args.indexOf('--shingle') + 1]) || 6;
const REPO = resolve(new URL('../..', import.meta.url).pathname);

/** The rule text the server reads. If it leaks, it leaks from here. */
const RULE_SOURCES = [
  join(REPO, '.claude/rules/frontend.md'),
  join(REPO, 'platform/standards/ui-layout.md'),
];

/** Ordinary technical prose — a shingle appearing here is not distinctive enough to count. */
const BASELINE = [join(REPO, 'platform/plans/2026-07-29-idea-0023-mcp-platform-server-build.md')];

const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[`*_>#|\[\]()]/g, ' ')
    .replace(/[^a-z0-9\s/.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function shingles(text, n = N) {
  const words = norm(text).split(' ').filter(Boolean);
  const out = new Set();
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(' '));
  return out;
}

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (st.size < 20_000_000) acc.push(p);
  }
  return acc;
}

/** Claude Code stores a project's transcripts under a path-derived directory name. */
function transcriptDir(projectDir) {
  const encoded = projectDir.replace(/\//g, '-');
  return join(process.env.HOME ?? '', '.claude', 'projects', encoded);
}

const ruleShingles = new Set();
for (const f of RULE_SOURCES) {
  if (!existsSync(f)) {
    console.error(`rule source missing, cannot run the gate: ${f}`);
    process.exit(2);
  }
  for (const s of shingles(readFileSync(f, 'utf8'))) ruleShingles.add(s);
}

const baseline = new Set();
for (const f of BASELINE) {
  if (existsSync(f)) for (const s of shingles(readFileSync(f, 'utf8'))) baseline.add(s);
}
for (const s of baseline) ruleShingles.delete(s);

const diskFiles = walk(consumerDir);
const tDir = transcriptDir(consumerDir);
const transcriptFiles = walk(tDir);

let leaks = 0;
const report = [];

for (const [label, files] of [
  ['DISK', diskFiles],
  ['TRANSCRIPT', transcriptFiles],
]) {
  for (const f of files) {
    let text;
    try {
      text = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    const hits = [];
    for (const s of shingles(text)) if (ruleShingles.has(s)) hits.push(s);
    if (hits.length) {
      leaks += hits.length;
      report.push({ label, file: f, hits: hits.slice(0, 5), total: hits.length });
    }
  }
}

console.log(`AC-1 leak gate — ${N}-word shingles`);
console.log(`  consumer dir : ${consumerDir}  (${diskFiles.length} files)`);
console.log(`  transcripts  : ${tDir}  (${transcriptFiles.length} files)`);
console.log(`  rule shingles: ${ruleShingles.size} distinctive (baseline-filtered)`);
console.log('');

if (leaks === 0) {
  console.log("  PASS — 0 rulebook shingles found on the consumer's disk or in its transcript.");
  console.log('');
  console.log('  Read this narrowly: it says the rule TEXT did not travel. It does not say the');
  console.log(
    '  rules are unguessable from enough verdicts — that is a different claim, untested.',
  );
  process.exit(0);
}

console.log(
  `  FAIL — ${leaks} rulebook shingle hit(s). The confidentiality claim is false as built.`,
);
for (const r of report) {
  console.log(`\n  [${r.label}] ${basename(r.file)} — ${r.total} hit(s)`);
  for (const h of r.hits) console.log(`      "${h}"`);
}
process.exit(1);
