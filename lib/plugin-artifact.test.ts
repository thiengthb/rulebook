/**
 * The plugin ships COMPILED, COMMITTED copies of the checker (`npm run build:plugin`). That is a
 * silent-staleness trap: edit a rule, forget the build, and every consumer keeps enforcing the old
 * rulebook while this repo says otherwise — with no error anywhere.
 *
 * These tests are the trap's alarm. They exercise the artifact through the real hook, as a
 * subprocess, exactly as Claude Code would run it.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

function fire(filename: string, contents?: string) {
  const path = join(dir, filename);
  if (contents !== undefined) writeFileSync(path, contents);
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: path } }),
    encoding: 'utf8',
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
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
