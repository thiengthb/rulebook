/**
 * The check-in gate (2026-08-12) passes only on "≥1 real call". These tests exist so that number
 * is real: a log that silently stops writing turns the gate into a rubber stamp in the ONE
 * direction that matters — it would read as "never used" and abandon a project that was in use.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { logCall } from './request-log.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rulebook-log-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.RULEBOOK_LOG_DIR;
});

const read = () =>
  readFileSync(join(dir, 'requests.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));

describe('the call log', () => {
  it('writes one JSON line per call, with a timestamp', () => {
    process.env.RULEBOOK_LOG_DIR = dir;
    logCall({ tool: 'review_component', subject: 'Card.tsx', found: 3, ok: true, degraded: false });
    logCall({ tool: 'report_lesson', subject: 'todo', ok: true, degraded: false });
    const lines = read();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ tool: 'review_component', subject: 'Card.tsx', found: 3 });
    expect(lines[1]).toMatchObject({ tool: 'report_lesson', subject: 'todo' });
    expect(Date.parse(lines[0].at)).toBeGreaterThan(0);
  });

  it('is silent unless a log dir is configured — the unit suite must not write one', () => {
    logCall({ tool: 'review_component', ok: true, degraded: false });
    expect(existsSync(join(dir, 'requests.jsonl'))).toBe(false);
  });

  it('never fails a call, even when the log cannot be written', () => {
    // A directory path that is really a FILE — ENOTDIR, instantly and on every platform. An
    // unwritable /proc path was tried first and HUNG mkdirSync on this machine, which would have
    // wedged the whole suite rather than failed it.
    const notADir = join(dir, 'blocker');
    writeFileSync(notADir, 'x');
    process.env.RULEBOOK_LOG_DIR = join(notADir, 'nested');
    expect(() => logCall({ tool: 'review_component', ok: true, degraded: false })).not.toThrow();
  });

  it('truncates the subject — an untrusted filename does not get a free 10 KB in the log', () => {
    process.env.RULEBOOK_LOG_DIR = dir;
    logCall({ tool: 'review_component', subject: 'a'.repeat(5000), ok: true, degraded: false });
    expect(read()[0].subject).toHaveLength(120);
  });
});
