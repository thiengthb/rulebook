/**
 * The plugin ships COMPILED, COMMITTED copies of the checker (`npm run build:plugin`). That is a
 * silent-staleness trap: edit a rule, forget the build, and every consumer keeps enforcing the old
 * rulebook while this repo says otherwise — with no error anywhere.
 *
 * These tests are the trap's alarm. They exercise the artifact through the real hook, as a
 * subprocess, exactly as Claude Code would run it.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const PLUGIN = join(ROOT, 'plugins', 'rulebook-frontend');
const HOOK = join(PLUGIN, 'hooks', 'check-file.mjs');

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'plugin-artifact-'));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/**
 * Every fire() redirects the usage log into the temp dir. Without this the suite would append to
 * the real `~/.claude/rulebook-usage.jsonl` on every run — and that file is the evidence the
 * 2026-08-12 check-in reads, so test traffic in it would corrupt the only measurement of whether
 * a human is actually using this hook.
 */
function fire(filename: string, contents?: string, env: Record<string, string> = {}) {
  const path = join(dir, filename);
  if (contents !== undefined) writeFileSync(path, contents);
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: path } }),
    encoding: 'utf8',
    env: { ...process.env, RULEBOOK_USAGE_LOG: join(dir, 'usage.jsonl'), ...env },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function usageLines(file = 'usage.jsonl') {
  try {
    return readFileSync(join(dir, file), 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

const DIRTY = `'use client';
import { FaTrash } from 'react-icons/fa';
export function Card({ label }: { label: string }) {
  return <button className="text-[#ef4444]"><FaTrash />🔥{label}</button>;
}
`;

const CLEAN = `import { Trash2 } from 'lucide-react';
export function Card({ label }: { label: string }) {
  return (
    <button className="text-destructive">
      <Trash2 aria-hidden="true" />
      {label}
    </button>
  );
}
`;

describe('the shipped plugin artifact', () => {
  it('declares every rule the source declares — a stale build fails here', () => {
    const sourceIds = [
      ...readFileSync(join(ROOT, 'rules', 'frontend.rules.ts'), 'utf8').matchAll(
        /id: '([a-z-]+)'/g,
      ),
    ].map((m) => m[1]!);
    const shipped = readFileSync(join(PLUGIN, 'rules', 'frontend.rules.js'), 'utf8');
    expect(sourceIds.length).toBeGreaterThan(0);
    for (const id of sourceIds) {
      expect(
        shipped,
        `rule "${id}" is not in the shipped plugin — run \`npm run build:plugin\``,
      ).toContain(`'${id}'`);
    }
  });

  it('runs, and exits 2 on an error-severity violation so the model has to deal with it', () => {
    const r = fire('Card.tsx', DIRTY);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('icon-set');
    expect(r.stderr).toContain('hardcoded-color');
    // The 2026-07-29 regression: an emoji next to `{label}` was invisible to the line-scoped scan.
    expect(r.stderr).toContain('emoji-as-icon');
  });

  it('is silent on a compliant file — a hook that always shouts gets turned off', () => {
    const r = fire('Clean.tsx', CLEAN);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('');
    expect(r.stderr.trim()).toBe('');
  });

  it('ignores files that are not UI files', () => {
    const r = fire('notes.md', '# 🔥 hello');
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('says a file it cannot read is UNKNOWN, never clean', () => {
    const r = fire('vanished.tsx');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/NOT checked/);
    expect(r.stdout).toMatch(/unknown, not clean/i);
  });
});

/**
 * The usage log answers the build plan's only remaining question — *is this hook actually used* —
 * which a hook that exits 0 on a clean file cannot answer by itself. What matters most in these
 * tests is the second one: a CLEAN check must still be counted, because a gate that only records
 * its complaints looks unused precisely when it is working.
 */
describe('the usage log', () => {
  it('counts a clean check — silence on stdout is not absence of use', () => {
    fire('Counted.tsx', CLEAN, { RULEBOOK_USAGE_LOG: join(dir, 'clean.jsonl') });
    const [entry, ...rest] = usageLines('clean.jsonl');
    expect(rest).toHaveLength(0);
    expect(entry.outcome).toBe('clean');
    expect(entry.ext).toBe('tsx');
    expect(entry.n).toBe(0);
    expect(entry.e).toBe(0);
    expect(entry.rules).toEqual([]);
    expect(entry.v).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Date.parse(entry.ts)).toBeGreaterThan(0);
  });

  it('records which rules fired, and that the write was blocked', () => {
    fire('Blocked.tsx', DIRTY, { RULEBOOK_USAGE_LOG: join(dir, 'blocked.jsonl') });
    const [entry] = usageLines('blocked.jsonl');
    expect(entry.outcome).toBe('blocked');
    expect(entry.e).toBeGreaterThan(0);
    expect(entry.rules).toContain('emoji-as-icon');
    expect(entry.rules).toContain('hardcoded-color');
  });

  it('never writes the file path or a line of source — metadata only', () => {
    fire('Secretive.tsx', DIRTY, { RULEBOOK_USAGE_LOG: join(dir, 'privacy.jsonl') });
    const raw = readFileSync(join(dir, 'privacy.jsonl'), 'utf8');
    expect(raw).not.toContain('Secretive');
    expect(raw).not.toContain('react-icons');
    expect(raw).not.toContain('#ef4444');
    expect(raw).not.toContain(dir);
  });

  it('writes nothing at all when switched off', () => {
    fire('Off.tsx', DIRTY, { RULEBOOK_USAGE_LOG: 'off' });
    // Nothing may be created anywhere in the temp dir under an `off` switch.
    expect(usageLines('off')).toHaveLength(0);
    expect(existsSync(join(dir, 'off'))).toBe(false);
  });

  it('does not count a non-UI file — the log measures UI checks, not every write', () => {
    fire('notes.md', '# hello', { RULEBOOK_USAGE_LOG: join(dir, 'md.jsonl') });
    expect(existsSync(join(dir, 'md.jsonl'))).toBe(false);
  });

  it('still exits 2 on a violation when logging is impossible — the gate outranks the counter', () => {
    // A path under a FILE (not a directory) cannot be created: ENOTDIR. The check must survive it.
    const blocker = join(dir, 'not-a-dir');
    writeFileSync(blocker, 'x');
    const r = fire('Robust.tsx', DIRTY, { RULEBOOK_USAGE_LOG: join(blocker, 'usage.jsonl') });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('emoji-as-icon');
  });
});
