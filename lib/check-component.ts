/**
 * The tier-2 checker: source in, violations out. NO I/O, NO network, NO model.
 *
 * Plan: platform/plans/2026-07-29-idea-0023-mcp-platform-server-build.md (Step 1.2)
 *
 * Why a pure function rather than "the MCP tool does the checking": the same reason
 * sakubun's generation-scorer shipped as one (2026-07-28) — a verdict computed by a model
 * drifts with the model's mood and cannot be unit-tested. This can be, and it is the only
 * part of the design that has to be RIGHT rather than merely plausible.
 *
 * Deliberate limitation, recorded rather than hidden: this scans text, it does not parse a
 * TypeScript AST. It strips comments before matching (so a commented-out violation is not
 * reported) but it can still be fooled by sufficiently strange formatting. That trade buys a
 * dependency-free checker for the thin slice; whether the false-positive rate is acceptable is
 * a Phase-3 measurement, not an assumption. Every rule therefore carries near-miss tests.
 */

import {
  COMPOSITOR_SAFE_ANIMATED_PROPS,
  FOREIGN_ICON_PACKAGES,
  FOREIGN_TOAST_PACKAGES,
  RULE_BY_ID,
  type RuleId,
} from '../rules/frontend.rules.js';

export type Violation = {
  ruleId: RuleId;
  line: number;
  severity: 'error' | 'warn';
  /** What is wrong with THIS line. Derived, never a rulebook sentence. */
  message: string;
  /** What to do instead. Derived. */
  fix: string;
  /** The offending source line, trimmed — echoed back so the client can locate it. */
  excerpt: string;
};

export type CheckOptions = {
  /** Used only to pick the applicable rule set. Defaults to a .tsx component. */
  filename?: string;
};

type Kind = 'tsx' | 'jsx' | 'ts' | 'css';

function kindOf(filename?: string): Kind {
  if (!filename) return 'tsx';
  if (filename.endsWith('.css')) return 'css';
  if (filename.endsWith('.jsx')) return 'jsx';
  if (filename.endsWith('.tsx')) return 'tsx';
  return 'ts';
}

/**
 * Blank out comments, preserving line numbering and length so every subsequent match keeps its
 * real coordinates. Handles `//`, block comments, and JSX `{/* … *\/}`. String contents are left
 * intact on purpose — import specifiers live in strings and several rules key off them.
 */
function stripComments(source: string): string {
  const out = source.split('');
  let i = 0;
  let inLine = false;
  let inBlock = false;
  let inStr: string | null = null;

  while (i < source.length) {
    const c = source[i]!;
    const next = source[i + 1];

    if (inLine) {
      if (c === '\n') inLine = false;
      else out[i] = ' ';
      i++;
      continue;
    }
    if (inBlock) {
      if (c === '*' && next === '/') {
        out[i] = ' ';
        out[i + 1] = ' ';
        i += 2;
        inBlock = false;
        continue;
      }
      if (c !== '\n') out[i] = ' ';
      i++;
      continue;
    }
    if (inStr) {
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === inStr) inStr = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inStr = c;
      i++;
      continue;
    }
    if (c === '/' && next === '/') {
      out[i] = ' ';
      out[i + 1] = ' ';
      i += 2;
      inLine = true;
      continue;
    }
    if (c === '/' && next === '*') {
      out[i] = ' ';
      out[i + 1] = ' ';
      i += 2;
      inBlock = true;
      continue;
    }
    i++;
  }
  return out.join('');
}

/** Unicode emoji, excluding plain digits/`#`/`*` which carry Emoji_Presentation only with VS16. */
const EMOJI = /\p{Extended_Pictographic}/u;

/** JSX text content: what sits between `>` and the next `<` on a line. */
const JSX_TEXT = />([^<>{}]+)</g;

const HEX_COLOR = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
const FN_COLOR = /\b(?:rgba?|hsla?|oklch|oklab)\s*\(/;

const MOTION_PROP_BLOCK =
  /\b(?:animate|initial|exit|whileHover|whileTap|whileInView)\s*=\s*\{\{([^}]*)\}\}/g;

export function checkComponent(source: string, opts: CheckOptions = {}): Violation[] {
  const kind = kindOf(opts.filename);
  const code = stripComments(source);
  const rawLines = source.split('\n');
  const lines = code.split('\n');
  const violations: Violation[] = [];

  const applies = (id: RuleId) => RULE_BY_ID.get(id)!.applies.includes(kind);

  const push = (ruleId: RuleId, lineIdx: number, message: string, fix: string) => {
    violations.push({
      ruleId,
      line: lineIdx + 1,
      severity: RULE_BY_ID.get(ruleId)!.severity,
      message,
      fix,
      excerpt: rawLines[lineIdx]!.trim().slice(0, 160),
    });
  };

  const isClientFile = /^\s*['"]use client['"]/m.test(code);
  const inThemeBlock: boolean[] = [];
  if (kind === 'css') {
    // A CSS custom-property definition inside @theme IS where colors are supposed to be literal.
    let depth = 0;
    let armed = false;
    lines.forEach((l, idx) => {
      if (/@theme\b/.test(l)) armed = true;
      const opens = (l.match(/\{/g) || []).length;
      const closes = (l.match(/\}/g) || []).length;
      inThemeBlock[idx] = armed && depth + opens > 0;
      depth += opens - closes;
      if (armed && depth <= 0) armed = false;
    });
  }

  lines.forEach((line, idx) => {
    /* ── icon-set: an icon coming from anywhere but the sanctioned pack ─────────────── */
    if (applies('icon-set')) {
      for (const pkg of FOREIGN_ICON_PACKAGES) {
        if (new RegExp(`from\\s*['"]${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(line)) {
          push(
            'icon-set',
            idx,
            `Icons are imported from \`${pkg}\`, which is not this platform's icon set.`,
            'Import the equivalent icon from `lucide-react` instead, and drop this dependency.',
          );
        }
      }
      if (
        /<svg[\s>]/.test(line) &&
        !/aria-hidden|role\s*=\s*['"]img|viewBox="0 0 (?:100|200)/.test(line)
      ) {
        push(
          'icon-set',
          idx,
          'A hand-written `<svg>` is used where an icon component belongs.',
          'Use a `lucide-react` icon. Inline SVG is only for rendering DATA (a gauge, a sparkline, a score ring).',
        );
      }
    }

    /* ── emoji-as-icon: emoji in JSX TEXT, not emoji inside a string (that may be data) ─ */
    if (applies('emoji-as-icon')) {
      JSX_TEXT.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = JSX_TEXT.exec(line))) {
        if (EMOJI.test(m[1]!)) {
          push(
            'emoji-as-icon',
            idx,
            'An emoji is rendered as a UI marker in this element.',
            'Replace it with a `lucide-react` icon component. Emoji is allowed only inside text a model emits verbatim.',
          );
          break;
        }
      }
    }

    /* ── hardcoded-color: a literal color instead of a theme token ──────────────────── */
    if (applies('hardcoded-color') && !inThemeBlock[idx]) {
      const hasHex = HEX_COLOR.test(line);
      const hasFn = FN_COLOR.test(line);
      const looksLikeUrlFragment = /(?:href|src|url\()\s*[=(]?\s*['"][^'"]*#/.test(line);
      const isCssVarDefinition = /^\s*--[\w-]+\s*:/.test(line);
      if ((hasHex || hasFn) && !looksLikeUrlFragment && !isCssVarDefinition) {
        push(
          'hardcoded-color',
          idx,
          'A literal color value is written into this line, so it cannot follow the light/dark theme.',
          'Use a theme token (a CSS variable / a Tailwind semantic class). Literal colors belong only in the `@theme` block.',
        );
      }
    }

    /* ── forward-ref: React 19 passes ref as a normal prop ──────────────────────────── */
    if (applies('forward-ref') && /\bforwardRef\s*[<(]/.test(line)) {
      push(
        'forward-ref',
        idx,
        '`forwardRef` is used, which this stack no longer needs.',
        'Take `ref` as an ordinary prop on the component and delete the wrapper.',
      );
    }

    /* ── dangerous-html ─────────────────────────────────────────────────────────────── */
    if (applies('dangerous-html') && /dangerouslySetInnerHTML/.test(line)) {
      const sanitized = /\b(?:DOMPurify|sanitize|sanitizeHtml|purify)\b/i.test(line);
      if (!sanitized) {
        push(
          'dangerous-html',
          idx,
          'Raw HTML is injected here with no visible sanitizer on the same expression.',
          'Render as text, or pass the value through a sanitizer before it reaches this prop.',
        );
      }
    }

    /* ── toast-library ──────────────────────────────────────────────────────────────── */
    if (applies('toast-library')) {
      for (const pkg of FOREIGN_TOAST_PACKAGES) {
        if (
          new RegExp(`from\\s*['"]${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`).test(line)
        ) {
          push(
            'toast-library',
            idx,
            `Toasts come from \`${pkg}\`, which is not the one this platform standardised on.`,
            'Import `toast` from `sonner` and render `<Toaster />` once in the app shell.',
          );
        }
      }
    }

    /* ── client-secret: a non-public env var read in a client component ─────────────── */
    if (applies('client-secret') && isClientFile) {
      const m = line.match(/process\.env\.([A-Z0-9_]+)/);
      if (m && !/^(?:NEXT_PUBLIC_|VITE_|NODE_ENV$)/.test(m[1]!)) {
        push(
          'client-secret',
          idx,
          `\`${m[1]}\` is read in a client component, so its value ships in the browser bundle.`,
          'Read it in a server component / route handler and pass down only the derived value — or prefix it `NEXT_PUBLIC_` if it is genuinely public.',
        );
      }
    }

    /* ── debug-logging ──────────────────────────────────────────────────────────────── */
    if (applies('debug-logging') && /\bconsole\.log\s*\(/.test(line)) {
      push(
        'debug-logging',
        idx,
        'A `console.log` is left in this line.',
        'Delete it. Deliberate server-side logging should use a real logger, not `console.log`.',
      );
    }
  });

  /* ── animated-property: allowlist over the animated keys (multi-line aware) ──────── */
  if (applies('animated-property')) {
    MOTION_PROP_BLOCK.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MOTION_PROP_BLOCK.exec(code))) {
      const lineIdx = code.slice(0, m.index).split('\n').length - 1;
      const keys = [...m[1]!.matchAll(/([A-Za-z_$][\w$]*)\s*:/g)].map((k) => k[1]!);
      const bad = keys.filter((k) => !COMPOSITOR_SAFE_ANIMATED_PROPS.has(k));
      if (bad.length) {
        push(
          'animated-property',
          lineIdx,
          `This animation drives ${bad.map((b) => `\`${b}\``).join(', ')}, which forces layout or paint on every frame.`,
          'Animate `transform` (x/y/scale/rotate) and `opacity` only; achieve the rest by animating a transform on a wrapper.',
        );
      }
    }
  }

  return violations.sort((a, b) => a.line - b.line || a.ruleId.localeCompare(b.ruleId));
}
