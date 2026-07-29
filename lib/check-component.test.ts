/**
 * AC-2 — "clean code passes, and the checker is not a rubber stamp".
 *
 * The structure is the point. For every rule there are THREE cases:
 *   1. the compliant fixture      → no violation of that rule
 *   2. the MUTATION of it         → exactly that violation appears
 *   3. a NEAR-MISS                → something that superficially looks like the violation, and is not
 *
 * (1) alone is passed by a checker that always returns []. (2) alone is passed by a checker that
 * always fires. Only the pair constrains it — and (3) is what keeps it usable, because a linter
 * that cries wolf gets switched off, which is a slower way of not having one.
 */

import { describe, expect, it } from 'vitest';
import { checkComponent } from './check-component.js';
import { FRONTEND_RULES } from '../rules/frontend.rules.js';

const ids = (src: string, filename = 'Comp.tsx') =>
  checkComponent(src, { filename }).map((v) => v.ruleId);

/** A component that violates nothing. Every mutation below is a single edit away from this. */
const CLEAN = `'use client';

import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';

export function DeleteButton({ label, ref }: { label: string; ref?: React.Ref<HTMLButtonElement> }) {
  const endpoint = process.env.NEXT_PUBLIC_API_URL;
  return (
    <motion.button
      ref={ref}
      animate={{ opacity: 1, scale: 1 }}
      className="text-destructive bg-muted"
      onClick={() => toast.success('Đã xoá')}
    >
      <Trash2 aria-hidden="true" />
      {label} {endpoint}
    </motion.button>
  );
}
`;

describe('the compliant fixture', () => {
  it('produces no violations at all', () => {
    expect(checkComponent(CLEAN, { filename: 'DeleteButton.tsx' })).toEqual([]);
  });
});

describe('icon-set', () => {
  it('fires when icons come from another pack', () => {
    expect(ids(CLEAN.replace("from 'lucide-react'", "from 'react-icons/fa'"))).toContain(
      'icon-set',
    );
  });

  it('fires on a hand-written svg icon', () => {
    expect(
      ids(
        CLEAN.replace('<Trash2 aria-hidden="true" />', '<svg width="16"><path d="M0 0" /></svg>'),
      ),
    ).toContain('icon-set');
  });

  it('does NOT fire on an svg that renders data (a gauge viewBox)', () => {
    const gauge = CLEAN.replace(
      '<Trash2 aria-hidden="true" />',
      '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" /></svg>',
    );
    expect(ids(gauge)).not.toContain('icon-set');
  });

  it('does NOT fire on a package whose name merely contains the word icon', () => {
    expect(ids(CLEAN.replace("from 'lucide-react'", "from '@/components/icons'"))).not.toContain(
      'icon-set',
    );
  });
});

describe('emoji-as-icon', () => {
  it('fires on an emoji rendered as a marker', () => {
    expect(ids(CLEAN.replace('<Trash2 aria-hidden="true" />', '<span>🗑️</span>'))).toContain(
      'emoji-as-icon',
    );
  });

  it('does NOT fire on an emoji inside a string literal (a text protocol, which is exempt)', () => {
    expect(
      ids(CLEAN.replace("toast.success('Đã xoá')", "toast.success('Đã xoá 🎉')")),
    ).not.toContain('emoji-as-icon');
  });

  it('does NOT fire on ordinary non-ASCII text', () => {
    expect(ids(CLEAN.replace('{label} {endpoint}', 'Xoá vĩnh viễn {endpoint}'))).not.toContain(
      'emoji-as-icon',
    );
  });

  // Regression, 2026-07-29. The text-region regex excluded `{`/`}`, so ANY region holding an
  // expression was skipped whole — the overwhelmingly common shape in real JSX. Found by running
  // the checker from the plugin hook on a hand-written file, not by this suite.
  it('fires on an emoji sitting NEXT TO an expression, not only on one that is alone', () => {
    expect(ids(CLEAN.replace('{label}', '🔥{label}'))).toContain('emoji-as-icon');
  });

  it('fires on an emoji between two expressions', () => {
    expect(ids(CLEAN.replace('{label} {endpoint}', '{label} 🚀 {endpoint}'))).toContain(
      'emoji-as-icon',
    );
  });

  it('still does NOT fire on an emoji INSIDE an expression — that is code, and may be data', () => {
    expect(ids(CLEAN.replace('{label}', "{ok ? '🔥' : ''}"))).not.toContain('emoji-as-icon');
  });

  // A KNOWN, DELIBERATE MISS — pinned so it is a decision rather than a surprise.
  //
  // Between two conditional elements the text region starts with a stray `}` and ends with a
  // stray `{`, which balance out. Accepting it would report this emoji correctly, and would also
  // accept regions that begin in the middle of an attribute (`onClick={() => …}`), where a string
  // is not rendered text at all. The rule's bias is conservative — this checker fires at
  // `severity: error` and exits 2 in the plugin hook, so a false positive costs more than a miss.
  // Removing the `depth < 0` rejection makes this case fire and breaks the exemption above.
  it('does NOT fire between two conditional elements — the price of rejecting code regions', () => {
    const src = `export function A({ a, b }: { a: boolean; b: boolean }) {
  return (
    <div>
      {a && <span>x</span>} 🔥 {b && <span>y</span>}
    </div>
  );
}
`;
    expect(ids(src)).not.toContain('emoji-as-icon');
  });
});

describe('hardcoded-color', () => {
  it('fires on a hex color in a Tailwind arbitrary value', () => {
    expect(ids(CLEAN.replace('text-destructive bg-muted', 'text-[#ef4444] bg-muted'))).toContain(
      'hardcoded-color',
    );
  });

  it('fires on a color function in an inline style', () => {
    expect(
      ids(
        CLEAN.replace('className="text-destructive bg-muted"', 'style={{ color: rgba(0,0,0,.5) }}'),
      ),
    ).toContain('hardcoded-color');
  });

  it('does NOT fire on a URL fragment that merely contains #', () => {
    expect(
      ids(CLEAN.replace('{label} {endpoint}', '<a href="/docs#install">docs</a>')),
    ).not.toContain('hardcoded-color');
  });

  it('does NOT fire inside a CSS @theme block, where literal colors belong', () => {
    const css = `@theme {\n  --color-brand: #7c3aed;\n}\n`;
    expect(ids(css, 'globals.css')).not.toContain('hardcoded-color');
  });

  it('DOES fire on a literal color in CSS outside @theme', () => {
    const css = `@theme {\n  --color-brand: #7c3aed;\n}\n\n.card {\n  border-color: #e5e7eb;\n}\n`;
    expect(ids(css, 'globals.css')).toContain('hardcoded-color');
  });
});

describe('the reasoned exception directive', () => {
  // Added 2026-07-29, after scanning 333 real UI files. Two findings were correct code the rule
  // cannot distinguish: a brand mark whose colors are fixed by someone else's guidelines, and a
  // Next.js opengraph-image, which renders to PNG where CSS variables do not exist.
  it('suppresses the named rule when the reason is long enough', () => {
    const src = `export function Logo() {
  // rulebook-allow: hardcoded-color — Google brand mark, colors fixed by brand guidelines
  return <svg><path fill="#4285F4" d="M0 0" /></svg>;
}
`;
    const found = ids(src);
    expect(found).not.toContain('hardcoded-color');
    // Same line, different rule: a directive is a scalpel, not an off switch. Without this
    // assertion a suppression that silenced every rule on the line would pass unnoticed.
    expect(found).toContain('icon-set');
  });

  it('works as a trailing comment on the offending line too', () => {
    const src = `export function Logo() {
  return <svg><path fill="#4285F4" /></svg>; // rulebook-allow: hardcoded-color — brand mark, fixed externally
}
`;
    expect(ids(src)).not.toContain('hardcoded-color');
  });

  it('does NOTHING without a real reason — silencing must cost a sentence', () => {
    const src = `export function Logo() {
  // rulebook-allow: hardcoded-color — brand
  return <svg><path fill="#4285F4" d="M0 0" /></svg>;
}
`;
    expect(ids(src)).toContain('hardcoded-color');
  });

  it('suppresses only the rule it names, not the whole line', () => {
    const src = `import { FaTrash } from 'react-icons/fa';
export function Logo() {
  // rulebook-allow: hardcoded-color — brand mark, colors fixed by brand guidelines
  return <FaTrash color="#4285F4" />;
}
`;
    const found = ids(src);
    expect(found).not.toContain('hardcoded-color');
    expect(found).toContain('icon-set');
  });
});

describe('CSS var fallbacks are not hardcoded colors', () => {
  it('does NOT fire on var(--token, #hex) — the token is what applies', () => {
    const css = `.flame {\n  filter: drop-shadow(0 0 2px var(--flame2, #f97316));\n}\n`;
    expect(ids(css, 'globals.css')).not.toContain('hardcoded-color');
  });

  it('DOES still fire on a literal sitting beside a var fallback', () => {
    const css = `.flame {\n  color: #e5e7eb;\n  filter: drop-shadow(0 0 2px var(--flame2, #f97316));\n}\n`;
    expect(ids(css, 'globals.css')).toContain('hardcoded-color');
  });
});

describe('forward-ref', () => {
  it('fires when forwardRef is used', () => {
    expect(
      ids(
        CLEAN.replace(
          'export function DeleteButton(',
          'export const DeleteButton = forwardRef<HTMLButtonElement>(',
        ),
      ),
    ).toContain('forward-ref');
  });

  it('does NOT fire on a plain ref prop', () => {
    expect(ids(CLEAN)).not.toContain('forward-ref');
  });
});

describe('dangerous-html', () => {
  it('fires on unsanitized raw HTML', () => {
    expect(
      ids(
        CLEAN.replace('{label} {endpoint}', '<div dangerouslySetInnerHTML={{ __html: label }} />'),
      ),
    ).toContain('dangerous-html');
  });

  it('does NOT fire when the value is visibly sanitized', () => {
    expect(
      ids(
        CLEAN.replace(
          '{label} {endpoint}',
          '<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(label) }} />',
        ),
      ),
    ).not.toContain('dangerous-html');
  });
});

describe('toast-library', () => {
  it('fires on a different toast library', () => {
    expect(ids(CLEAN.replace("from 'sonner'", "from 'react-hot-toast'"))).toContain(
      'toast-library',
    );
  });
});

describe('client-secret', () => {
  it('fires when a client component reads a non-public env var', () => {
    expect(
      ids(CLEAN.replace('process.env.NEXT_PUBLIC_API_URL', 'process.env.DATABASE_URL')),
    ).toContain('client-secret');
  });

  it('does NOT fire for the same read in a SERVER component', () => {
    const server = CLEAN.replace("'use client';\n", '').replace(
      'process.env.NEXT_PUBLIC_API_URL',
      'process.env.DATABASE_URL',
    );
    expect(ids(server)).not.toContain('client-secret');
  });

  it('does NOT fire on NODE_ENV', () => {
    expect(
      ids(CLEAN.replace('process.env.NEXT_PUBLIC_API_URL', 'process.env.NODE_ENV')),
    ).not.toContain('client-secret');
  });
});

describe('animated-property', () => {
  it('fires when a layout-driving property is animated', () => {
    expect(
      ids(
        CLEAN.replace('animate={{ opacity: 1, scale: 1 }}', 'animate={{ width: 240, opacity: 1 }}'),
      ),
    ).toContain('animated-property');
  });

  it('names the offending property, not just the rule', () => {
    const v = checkComponent(
      CLEAN.replace('animate={{ opacity: 1, scale: 1 }}', 'animate={{ height: 40 }}'),
      {
        filename: 'C.tsx',
      },
    ).find((x) => x.ruleId === 'animated-property');
    expect(v?.message).toContain('height');
  });

  it('does NOT fire on transform-only animation', () => {
    expect(
      ids(CLEAN.replace('animate={{ opacity: 1, scale: 1 }}', 'animate={{ x: 10, rotate: 4 }}')),
    ).not.toContain('animated-property');
  });
  // Found 2026-07-29 by scanning a real project (82 UI files): `initial`, `animate` and `exit` are
  // ordinary English words. `<CheckinBox initial={{ energy, mood }} />` in a file that never
  // imports Motion is a data prop, not an animation, and reporting it is pure noise.
  it('does NOT fire in a file that never imports Motion — those are data props', () => {
    const src = `export function P({ checkin }: { checkin: { energy: number } }) {
  return <CheckinBox initial={{ energy: checkin.energy, mood: null }} />;
}
`;
    expect(ids(src)).not.toContain('animated-property');
  });

  it('DOES fire on the same prop once the file imports Motion', () => {
    const src = `import { motion } from 'motion/react';
export function P() {
  return <motion.div initial={{ height: 0, opacity: 1 }} />;
}
`;
    expect(ids(src)).toContain('animated-property');
  });
});

describe('debug-logging', () => {
  it('fires on a leftover console.log', () => {
    expect(ids(CLEAN.replace('const endpoint', 'console.log(label);\n  const endpoint'))).toContain(
      'debug-logging',
    );
  });

  it('does NOT fire on console.error, which is deliberate logging', () => {
    expect(
      ids(CLEAN.replace('const endpoint', 'console.error(label);\n  const endpoint')),
    ).not.toContain('debug-logging');
  });

  it('does NOT fire on a COMMENTED-OUT console.log', () => {
    expect(
      ids(CLEAN.replace('const endpoint', '// console.log(label);\n  const endpoint')),
    ).not.toContain('debug-logging');
  });
});

describe('rules only fire on the file kinds they declare', () => {
  // Added because a mutation caught this uncovered: replacing the whole `applies()` gate with
  // `() => true` left the suite at 29/29 green. Every rule's `applies` list was decoration.
  // A test that survives its own mutant is not testing anything.
  const PALETTE_TS = `export const BRAND = '#7c3aed';\nexport const MUTED = 'rgb(148 163 184)';\n`;

  it('does NOT flag a hex constant in a plain .ts module — that rule is for markup and CSS', () => {
    expect(ids(PALETTE_TS, 'palette.ts')).not.toContain('hardcoded-color');
  });

  it('DOES flag the same literal once it is in a .tsx file', () => {
    expect(ids(`export const C = () => <div className="text-[#7c3aed]" />;\n`, 'C.tsx')).toContain(
      'hardcoded-color',
    );
  });

  it('still flags a console.log in that same .ts module — that rule DOES declare ts', () => {
    expect(ids(`${PALETTE_TS}console.log(BRAND);\n`, 'palette.ts')).toContain('debug-logging');
  });

  it('does NOT flag markup-only rules in a stylesheet', () => {
    const css = `.btn > .icon { color: var(--color-fg); }\n`;
    const found = ids(css, 'app.css');
    expect(found).not.toContain('emoji-as-icon');
    expect(found).not.toContain('forward-ref');
    expect(found).not.toContain('client-secret');
  });
});

describe('the suite constrains every rule, not just the ones that were easy', () => {
  it('has at least one mutation case per declared rule', () => {
    // A rule declared but never mutation-tested is a rule nobody has evidence works. This test is
    // what stops the rule list and the test file drifting apart — adding a rule breaks it until
    // that rule has a firing case.
    const declared = FRONTEND_RULES.map((r) => r.id);
    const proven = new Set<string>();
    const mutate: Array<[string, string]> = [
      ['icon-set', CLEAN.replace("from 'lucide-react'", "from 'react-icons/fa'")],
      ['emoji-as-icon', CLEAN.replace('<Trash2 aria-hidden="true" />', '<span>🗑️</span>')],
      ['hardcoded-color', CLEAN.replace('text-destructive', 'text-[#ef4444]')],
      ['forward-ref', CLEAN.replace('export function DeleteButton(', 'const X = forwardRef<T>(')],
      [
        'dangerous-html',
        CLEAN.replace('{label} {endpoint}', '<i dangerouslySetInnerHTML={{ __html: label }} />'),
      ],
      ['toast-library', CLEAN.replace("from 'sonner'", "from 'react-toastify'")],
      ['client-secret', CLEAN.replace('process.env.NEXT_PUBLIC_API_URL', 'process.env.SECRET_KEY')],
      [
        'animated-property',
        CLEAN.replace('animate={{ opacity: 1, scale: 1 }}', 'animate={{ top: 4 }}'),
      ],
      ['debug-logging', CLEAN.replace('const endpoint', 'console.log(1);\n  const endpoint')],
    ];
    for (const [id, src] of mutate) {
      if ((ids(src) as string[]).includes(id)) proven.add(id);
    }
    expect([...declared].sort()).toEqual([...proven].sort());
  });
});

describe('the verdict never carries the rulebook', () => {
  it('no message or fix is a verbatim sentence from .claude/rules/frontend.md', () => {
    // AC-1's leak test, enforced at the unit level so it cannot regress silently between runs.
    // These are the load-bearing phrasings from the rulebook; a violation that echoes one of them
    // is transmitting the rule, which is exactly what tier 2 exists to avoid.
    const RULEBOOK_PHRASES = [
      'lucide icons ONLY',
      'no emoji as a UI icon-marker',
      'dark/light via CSS vars',
      'shadcn/ui only',
      'build the reusable thing ONCE',
      'Animate only',
      'no secret in the client bundle',
      'NO `forwardRef`',
      'no unsanitized',
    ];
    const dirty = [
      CLEAN.replace("from 'lucide-react'", "from 'react-icons/fa'").replace(
        'text-destructive',
        'text-[#ef4444]',
      ),
      CLEAN.replace('<Trash2 aria-hidden="true" />', '<span>🗑️</span>'),
      CLEAN.replace('animate={{ opacity: 1, scale: 1 }}', 'animate={{ width: 4 }}'),
      CLEAN.replace('process.env.NEXT_PUBLIC_API_URL', 'process.env.SECRET_KEY'),
    ];
    const text = dirty
      .flatMap((s) => checkComponent(s, { filename: 'C.tsx' }))
      .flatMap((v) => [v.message, v.fix])
      .join('\n');
    for (const phrase of RULEBOOK_PHRASES) {
      expect(text.toLowerCase()).not.toContain(phrase.toLowerCase());
    }
  });
});
