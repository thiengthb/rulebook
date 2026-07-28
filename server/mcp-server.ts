/**
 * The MCP surface: one tier-2 tool, plus a server-supplied `instructions` block.
 *
 * Plan: platform/plans/2026-07-29-idea-0023-mcp-platform-server-build.md (Step 1.3)
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *  WHICH HALF TRAVELS, AND WHY THE TWO CHANNELS ARE NOT THE SAME
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *  `instructions` is pushed into the consumer's system prompt, so it IS transmitted — and that
 *  is correct, because it carries the GENERATION-SHAPING half (when to call the tool, what to do
 *  with the answer). Step 0's finding: that half leaves no trace in the artifact, so it cannot be
 *  reviewed into existence and must be sent.
 *
 *  The tool RESULT carries the verification-shaped half, and it travels as a verdict about the
 *  submitted line — never as the rule that produced it.
 *
 *  Consequence for AC-1: `instructions` must contain no frontend rule content, or the leak test
 *  would find the rulebook in the consumer's transcript through a channel we opened on purpose.
 *  Keep it about PROCESS. It is reviewed by `instructions.test.ts` on every run.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { checkComponent, type Violation } from '../lib/check-component.js';

export const SERVER_NAME = 'rulebook';
export const SERVER_VERSION = '0.1.0';

/**
 * Process guidance only. No rule content — see the header. Written to be useful to a model that
 * has never seen this platform, without telling it anything it could reconstruct the rulebook from.
 */
export const INSTRUCTIONS = `This server reviews frontend source against the standards of the project it belongs to.

When to call \`review_component\`:
- after writing or editing a UI file (.tsx / .jsx / .css), BEFORE proposing it as done
- when asked whether some UI code follows this project's conventions

How to read the answer:
- each violation names a line, what is wrong with it, and what to do instead — apply the fix
- \`severity: "error"\` must be fixed before the code is offered as finished; \`"warn"\` is a judgement call
- an empty \`violations\` array means the checks ran and found nothing
- \`degraded: true\` means the review did NOT run — treat it as "unknown", never as "clean", and say so

Do not ask this server for the rules themselves; it reports findings, not policy.`;

export type ReviewResult = {
  ok: boolean;
  /** True when the review could not run. Never accompanied by an implied clean result. */
  degraded: boolean;
  filename: string;
  violations: Violation[];
  /** Present only when degraded — why the review did not run. */
  reason?: string;
};

export function reviewComponent(code: string, filename?: string): ReviewResult {
  const name = filename?.trim() || 'component.tsx';
  try {
    return {
      ok: true,
      degraded: false,
      filename: name,
      violations: checkComponent(code, { filename: name }),
    };
  } catch (err) {
    // AC-6, the half that lives on THIS side: an internal failure must never render as an empty
    // violation list. A green that means "the reviewer crashed" is worse than a red.
    return {
      ok: false,
      degraded: true,
      filename: name,
      violations: [],
      reason: err instanceof Error ? err.message : 'the review failed for an unknown reason',
    };
  }
}

/** Human-readable rendering. The structured payload is the contract; this is for the transcript. */
export function renderResult(r: ReviewResult): string {
  if (r.degraded) {
    return `REVIEW DID NOT RUN for ${r.filename} — ${r.reason ?? 'unknown error'}.\nTreat this as UNKNOWN, not as clean.`;
  }
  if (r.violations.length === 0) {
    return `${r.filename}: checks ran, no violations found.`;
  }
  const lines = r.violations.map(
    (v) =>
      `  line ${v.line} [${v.severity}] ${v.ruleId}\n    ${v.message}\n    → ${v.fix}\n    ${v.excerpt}`,
  );
  const errors = r.violations.filter((v) => v.severity === 'error').length;
  return `${r.filename}: ${r.violations.length} violation(s), ${errors} must be fixed.\n${lines.join('\n')}`;
}

export function createRulebookServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(
    'review_component',
    {
      title: "Review a frontend file against this project's standards",
      description:
        'Submit the source of a .tsx/.jsx/.css file. Returns the violations found in it — the line, what is wrong, and what to do instead. Returns degraded: true if the review could not run.',
      inputSchema: {
        code: z.string().min(1).describe('The full source of the file to review.'),
        filename: z
          .string()
          .optional()
          .describe(
            "The file's name, e.g. `DeleteButton.tsx`. Decides which checks apply. Defaults to a .tsx component.",
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ code, filename }) => {
      const result = reviewComponent(code, filename);
      return {
        content: [{ type: 'text', text: renderResult(result) }],
        structuredContent: result as unknown as Record<string, unknown>,
        isError: result.degraded,
      };
    },
  );

  return server;
}
