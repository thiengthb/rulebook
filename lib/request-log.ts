/**
 * One JSON line per tool call, so the plan's check-in gate can be ANSWERED rather than estimated.
 *
 * Plan: platform/plans/2026-07-29-idea-0023-mcp-platform-server-build.md §Check-in runbook — "count
 * real calls … Read the number. Pass = ≥1 call from a project that is not a test fixture". That
 * step was written against a log file nobody had built; a gate whose evidence does not exist rolls
 * forward forever, which is the exact failure mode ("built and then never used") it exists to catch.
 *
 * WHAT IS DELIBERATELY NOT LOGGED: the submitted source, and the text of a reported lesson. The
 * first is someone else's code, the second is untrusted prose — writing either into a file a future
 * session might read would re-open, through the log, what the fence and the quarantine close.
 * Metadata only.
 *
 * Opt-in: silent unless RULEBOOK_LOG_DIR is set (the HTTP entrypoint sets it; unit tests do not, so
 * the suite never writes a log). Best-effort: logging must never fail a call.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export type CallRecord = {
  tool: 'review_component' | 'report_lesson';
  /** For review: the filename submitted. For a lesson: the claimed source project. Both untrusted, so both truncated. */
  subject?: string;
  /** Violations found, or undefined for a lesson. */
  found?: number;
  ok: boolean;
  degraded: boolean;
};

export function logCall(rec: CallRecord): void {
  const dir = process.env.RULEBOOK_LOG_DIR;
  if (!dir) return;
  try {
    mkdirSync(dir, { recursive: true });
    appendFileSync(
      join(dir, 'requests.jsonl'),
      JSON.stringify({
        at: new Date().toISOString(),
        ...rec,
        subject: rec.subject?.slice(0, 120),
      }) + '\n',
      'utf8',
    );
  } catch {
    /* a call must not fail because its log could not be written */
  }
}
