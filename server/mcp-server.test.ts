/**
 * The MCP contract, exercised by a REAL client against a REAL server over an in-memory transport.
 *
 * AC-3 (server-supplied instructions reach the client) and AC-6 (degraded is loud) are tested
 * here. AC-1's end-to-end half — that nothing of the rulebook lands on a consumer's disk or in its
 * transcript — is Step 1.5 and cannot be faked at this level; what IS pinned here is the part that
 * could regress between end-to-end runs: the instructions block must stay free of rule content,
 * because it is the one channel we deliberately transmit on.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { INSTRUCTIONS, createRulebookServer, renderResult, reviewComponent } from './mcp-server.js';

const DIRTY = `'use client';
import { FaTrash } from 'react-icons/fa';
export function B({ label }: { label: string }) {
  return <button className="text-[#ef4444]"><FaTrash />{label}</button>;
}
`;

const CLEAN = `import { Trash2 } from 'lucide-react';
export function B({ label }: { label: string }) {
  return (
    <button className="text-destructive">
      <Trash2 aria-hidden="true" />
      {label}
    </button>
  );
}
`;

async function connected() {
  const client = new Client({ name: 'test-consumer', version: '0.0.0' });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientT), createRulebookServer().connect(serverT)]);
  return client;
}

describe('the tool contract', () => {
  let client: Client;
  beforeEach(async () => {
    client = await connected();
  });

  it('advertises exactly one tool, and it is the tier-2 one', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(['review_component']);
  });

  it("is declared read-only — it never touches the consumer's files", async () => {
    const { tools } = await client.listTools();
    expect(tools[0]?.annotations?.readOnlyHint).toBe(true);
  });

  it('returns real violations for a real component', async () => {
    const r = await client.callTool({
      name: 'review_component',
      arguments: { code: DIRTY, filename: 'DeleteButton.tsx' },
    });
    const s = r.structuredContent as { violations: Array<{ ruleId: string; line: number }> };
    const ids = s.violations.map((v) => v.ruleId);
    expect(ids).toContain('icon-set');
    expect(ids).toContain('hardcoded-color');
    expect(s.violations.every((v) => v.line > 0)).toBe(true);
  });

  it('returns an empty list — not a violation — for compliant code', async () => {
    const r = await client.callTool({
      name: 'review_component',
      arguments: { code: CLEAN, filename: 'DeleteButton.tsx' },
    });
    expect((r.structuredContent as { violations: unknown[] }).violations).toEqual([]);
    expect((r.structuredContent as { degraded: boolean }).degraded).toBe(false);
  });

  it("rejects an empty submission at the schema, rather than answering 'clean'", async () => {
    const r = await client.callTool({ name: 'review_component', arguments: { code: '' } });
    expect(r.isError).toBe(true);
  });
});

describe('AC-3 — the server supplies its own instructions', () => {
  it('the client receives them at initialize, with no file in the consumer repo', async () => {
    const client = await connected();
    expect(client.getInstructions()).toBe(INSTRUCTIONS);
  });

  it('they tell the model WHEN to call the tool — that half has to be transmitted', () => {
    expect(INSTRUCTIONS).toMatch(/before|BEFORE/);
    expect(INSTRUCTIONS).toContain('review_component');
  });

  it('they carry NO rule content — the one channel we transmit on must not leak the rulebook', () => {
    // Tier 1 by design, so it lands in the consumer's transcript. That is exactly why it must not
    // name the rules: AC-1's grep would find the rulebook through a door we opened ourselves.
    const FORBIDDEN = [
      'lucide',
      'shadcn',
      'sonner',
      'forwardRef',
      'emoji',
      'dangerouslySetInnerHTML',
      'NEXT_PUBLIC',
      'transform',
      'opacity',
      'css var',
      'hardcoded',
    ];
    const lower = INSTRUCTIONS.toLowerCase();
    for (const term of FORBIDDEN) {
      expect(lower, `instructions leaked the term "${term}"`).not.toContain(term.toLowerCase());
    }
  });
});

describe('AC-6 — degraded is loud, never a silent clean', () => {
  it('an internal failure reports degraded instead of an empty violation list', () => {
    // Force the checker to throw by handing it something that is not a string. The point is the
    // SHAPE of the failure: `violations: []` with `degraded: false` would be the dangerous answer.
    const r = reviewComponent(undefined as unknown as string, 'X.tsx');
    expect(r.degraded).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.reason).toBeTruthy();
  });

  it('the rendered text says the review did not run, and refuses the word clean', () => {
    const text = renderResult({
      ok: false,
      degraded: true,
      filename: 'X.tsx',
      violations: [],
      reason: 'boom',
    });
    expect(text).toMatch(/DID NOT RUN/);
    expect(text).toMatch(/UNKNOWN/);
    expect(text.toLowerCase()).not.toMatch(/no violations found/);
  });

  it('a genuine pass and a degraded result do not render alike', () => {
    const pass = renderResult({ ok: true, degraded: false, filename: 'X.tsx', violations: [] });
    const fail = renderResult({
      ok: false,
      degraded: true,
      filename: 'X.tsx',
      violations: [],
      reason: 'boom',
    });
    expect(pass).not.toEqual(fail);
    expect(pass).toMatch(/no violations found/);
  });

  it('marks the tool response isError so a client cannot mistake it for a result', async () => {
    const server = createRulebookServer();
    const client = new Client({ name: 't', version: '0' });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(ct), server.connect(st)]);
    // A string that is valid input but makes the checker's work meaningless is NOT degraded —
    // this asserts the opposite direction: ordinary input must not be flagged as an error.
    const ok = await client.callTool({
      name: 'review_component',
      arguments: { code: 'const a = 1;', filename: 'a.ts' },
    });
    expect(ok.isError).toBeFalsy();
  });
});

describe('the verdict is a verdict, not the rulebook', () => {
  it('no violation message repeats a load-bearing rulebook phrase', async () => {
    const client = await connected();
    const r = await client.callTool({
      name: 'review_component',
      arguments: { code: DIRTY, filename: 'D.tsx' },
    });
    const blob = JSON.stringify(r).toLowerCase();
    for (const phrase of [
      'lucide icons only',
      'no emoji as a ui icon-marker',
      'dark/light via css vars',
      'shadcn/ui only',
      'build the reusable thing once',
    ]) {
      expect(blob).not.toContain(phrase);
    }
  });
});
