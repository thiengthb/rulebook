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
 */

import { readFileSync } from 'node:fs';
import { checkComponent } from '../lib/check-component.js';

const UI_FILE = /\.(tsx|jsx|css)$/i;

function readPayload() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return null;
  }
}

const payload = readPayload();
const filePath = payload?.tool_input?.file_path ?? '';

// Not a UI file → nothing to say. The matcher cannot express an extension, so this is the filter.
if (!filePath || !UI_FILE.test(filePath)) process.exit(0);

let source;
try {
  source = readFileSync(filePath, 'utf8');
} catch (err) {
  // The file may have been moved or deleted between the write and this hook. Say so; do not
  // let an unreadable file render as a clean one.
  console.log(
    JSON.stringify({
      systemMessage: `rulebook: could not read ${filePath} (${err.code ?? 'error'}) — NOT checked. This is unknown, not clean.`,
    }),
  );
  process.exit(0);
}

let violations;
try {
  violations = checkComponent(source, { filename: filePath });
} catch (err) {
  console.log(
    JSON.stringify({
      systemMessage: `rulebook: the checker failed on ${filePath} (${err.message}) — NOT checked. This is unknown, not clean.`,
    }),
  );
  process.exit(0);
}

if (violations.length === 0) process.exit(0);

const errors = violations.filter((v) => v.severity === 'error');
const lines = violations.map(
  (v) => `  line ${v.line} [${v.severity}] ${v.ruleId}\n    ${v.message}\n    → ${v.fix}`,
);
const report = `${filePath}: ${violations.length} rule violation(s)\n${lines.join('\n')}`;

if (errors.length > 0) {
  // Exit 2 puts stderr in front of the model as something it has to deal with. Warnings alone
  // do not earn that — a hook that shouts on every judgement call gets turned off.
  console.error(`${report}\n\n${errors.length} of these must be fixed before this file is done.`);
  process.exit(2);
}

console.log(
  JSON.stringify({
    systemMessage: report,
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: report },
  }),
);
process.exit(0);
