#!/usr/bin/env node
/**
 * PostToolUse hook — run the frontend checker on a file that was just written.
 *
 * Plan: platform/plans/2026-07-29-idea-0023-mcp-platform-server-build.md Phase 5 (option B′).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *  WHY THIS IS A HOOK AND NOT AN MCP TOOL
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *  The same checker was first shipped as `review_component` on an MCP server. That works, and it
 *  keeps the rule data off this machine — but it only runs when the consuming model DECIDES to
 *  call it. This file runs whether anyone thought to ask. The Phase 3 verdict traded 4.4 KB of
 *  rule data on disk for that guarantee, plus no server, no auth, no uptime, and offline use.
 *
 *  Fail-open, loudly — inherited from the server's §C: a checker that cannot run must not stop
 *  someone writing code, but it must never look like a pass. On any internal failure this prints
 *  what went wrong and exits 0; it never stays silent in a way that reads as "clean".
 *
 *  Exit contract:
 *    2  → at least one `error`-severity violation. stderr goes to the model, which must fix it.
 *    0  → clean, warnings only, not a UI file, or the checker itself failed (with a notice).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *  USAGE LOG — why a hook counts itself
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *  This platform's named failure mode is "built, verified, then never used". The plan that ships
 *  this hook has a check-in whose only question is *is it actually being used* — and a hook that
 *  exits 0 on a clean file leaves no trace at all, so that question was unanswerable by
 *  construction. One JSONL line per checked file makes it answerable with data instead of a
 *  feeling. Read it with `node scripts/usage-report.mjs`.
 *
 *  METADATA ONLY, and local only: a timestamp, the extension, counts, and which rule ids fired.
 *  Never the file path, never a line of source, never anything leaves the machine. Same rule as
 *  the MCP half's `request-log.ts`. Off with `RULEBOOK_USAGE_LOG=off`, redirected by setting it
 *  to a path. Logging can never change the exit code — a counter that breaks the gate is worse
 *  than no counter.
 */

import { appendFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, extname, join } from 'node:path';

const UI_FILE = /\.(tsx|jsx|css)$/i;

/** Past this the log has long since answered every question anyone will ask of it. */
const USAGE_CAP_BYTES = 4 * 1024 * 1024;

function usageLogPath() {
  const override = process.env.RULEBOOK_USAGE_LOG;
  if (override !== undefined) return /^(0|off|false|no)$/i.test(override.trim()) ? null : override;
  return join(homedir(), '.claude', 'rulebook-usage.jsonl');
}

let pluginVersion;
function version() {
  if (pluginVersion === undefined) {
    try {
      pluginVersion = JSON.parse(
        readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8'),
      ).version;
    } catch {
      pluginVersion = null;
    }
  }
  return pluginVersion;
}

/**
 * `outcome` is the whole point of the record: `clean` and `blocked` both mean the hook ran, while
 * `unreadable`/`checker-error` mean it fired and verified nothing. Collapsing those into one
 * "it ran" counter would let a permanently broken checker look like a working one.
 */
function record(filePath, outcome, violations = []) {
  try {
    const path = usageLogPath();
    if (!path) return;
    try {
      if (statSync(path).size > USAGE_CAP_BYTES) return;
    } catch {
      mkdirSync(dirname(path), { recursive: true });
    }
    appendFileSync(
      path,
      JSON.stringify({
        ts: new Date().toISOString(),
        v: version(),
        ext: extname(filePath).replace('.', '').toLowerCase(),
        outcome,
        n: violations.length,
        e: violations.filter((v) => v.severity === 'error').length,
        rules: [...new Set(violations.map((v) => v.ruleId))].sort(),
      }) + '\n',
    );
  } catch {
    // Deliberately swallowed. The gate's job is to check code, not to keep books.
  }
}

function readPayload() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return null;
  }
}

const payload = readPayload();
const filePath = payload?.tool_input?.file_path ?? '';

// Not a UI file → nothing to say, and nothing to count. The matcher cannot express an extension,
// so this is the filter; counting every non-UI write would answer a question nobody asked.
if (!filePath || !UI_FILE.test(filePath)) process.exit(0);

/** Says what went wrong, records that nothing was verified, and lets the write through. */
function unchecked(outcome, message) {
  record(filePath, outcome);
  console.log(JSON.stringify({ systemMessage: `rulebook: ${message}` }));
  process.exit(0);
}

// Imported dynamically so a broken install is a recorded "it fired and verified nothing" rather
// than an uncaught throw — the whole point of the log is to tell those two apart.
let checkComponent;
try {
  ({ checkComponent } = await import('../lib/check-component.js'));
} catch (err) {
  unchecked(
    'load-error',
    `the checker could not be loaded (${err.message}) — ${filePath} NOT checked. This is unknown, not clean; the plugin install may be damaged.`,
  );
}

let source;
try {
  source = readFileSync(filePath, 'utf8');
} catch (err) {
  // The file may have been moved or deleted between the write and this hook. Say so; do not
  // let an unreadable file render as a clean one.
  unchecked(
    'unreadable',
    `could not read ${filePath} (${err.code ?? 'error'}) — NOT checked. This is unknown, not clean.`,
  );
}

let violations;
try {
  violations = checkComponent(source, { filename: filePath });
} catch (err) {
  unchecked(
    'checker-error',
    `the checker failed on ${filePath} (${err.message}) — NOT checked. This is unknown, not clean.`,
  );
}

const errorCount = violations.filter((v) => v.severity === 'error').length;
record(
  filePath,
  errorCount > 0 ? 'blocked' : violations.length > 0 ? 'warned' : 'clean',
  violations,
);

if (violations.length === 0) process.exit(0);

const lines = violations.map(
  (v) => `  line ${v.line} [${v.severity}] ${v.ruleId}\n    ${v.message}\n    → ${v.fix}`,
);
const report = `${filePath}: ${violations.length} rule violation(s)\n${lines.join('\n')}`;

if (errorCount > 0) {
  // Exit 2 puts stderr in front of the model as something it has to deal with. Warnings alone
  // do not earn that — a hook that shouts on every judgement call gets turned off.
  console.error(`${report}\n\n${errorCount} of these must be fixed before this file is done.`);
  process.exit(2);
}

console.log(
  JSON.stringify({
    systemMessage: report,
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: report },
  }),
);
process.exit(0);
