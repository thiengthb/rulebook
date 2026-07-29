/**
 * Tier-2 frontend rules — the artifact-decidable half.
 *
 * Plan: platform/plans/2026-07-29-idea-0023-mcp-platform-server-build.md (Step 1.1)
 * Sources (READ to build this; deliberately NOT quoted into it): .claude/rules/frontend.md,
 * platform/standards/ui-layout.md, .claude/skills/coding-convention/references/typescript-style.md.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *  THE ONE CONSTRAINT THAT MAKES THIS TIER 2 AND NOT TIER 1
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *  `message` and `fix` are DERIVED verdicts, written fresh. They must never be a verbatim
 *  sentence from the rulebook. If they were, the rule text would travel to the client inside
 *  the violation — the exact leak AC-1's transcript grep is designed to catch, arriving through
 *  the one channel that grep would find. Say what is wrong with THIS line; do not recite the law.
 *
 *  Selection criterion (not the list) comes from Step 0's classification, `class: "V"` —
 *  a rule that only VERIFIES output, decidable from the artifact alone. A rule that shapes
 *  generation (the process spine: research first, propose don't execute) is NOT in here and
 *  cannot be: it leaves no trace in the output to check.
 */
export const FRONTEND_RULES = [
  {
    id: 'icon-set',
    applies: ['tsx', 'jsx'],
    severity: 'error',
    label: 'icon source',
  },
  {
    id: 'emoji-as-icon',
    applies: ['tsx', 'jsx'],
    severity: 'error',
    label: 'icon source',
  },
  {
    id: 'hardcoded-color',
    applies: ['tsx', 'jsx', 'css'],
    severity: 'error',
    label: 'theming',
  },
  {
    id: 'forward-ref',
    applies: ['tsx', 'jsx', 'ts'],
    severity: 'error',
    label: 'react-19',
  },
  {
    id: 'dangerous-html',
    applies: ['tsx', 'jsx'],
    severity: 'error',
    label: 'security',
  },
  {
    id: 'toast-library',
    applies: ['tsx', 'jsx', 'ts'],
    severity: 'error',
    label: 'mandatory-ui',
  },
  {
    id: 'client-secret',
    applies: ['tsx', 'jsx', 'ts'],
    severity: 'error',
    label: 'security',
  },
  {
    id: 'animated-property',
    applies: ['tsx', 'jsx'],
    severity: 'warn',
    label: 'performance',
  },
  {
    id: 'debug-logging',
    applies: ['tsx', 'jsx', 'ts'],
    severity: 'warn',
    label: 'hygiene',
  },
];
export const RULE_BY_ID = new Map(FRONTEND_RULES.map((r) => [r.id, r]));
/** Icon packages that are not the sanctioned one. Value = what the client is told instead. */
export const FOREIGN_ICON_PACKAGES = [
  'react-icons',
  '@heroicons/react',
  '@tabler/icons-react',
  'phosphor-react',
  '@phosphor-icons/react',
  '@radix-ui/react-icons',
  'react-feather',
  '@fortawesome/react-fontawesome',
];
/** Toast libraries that are not the sanctioned one. */
export const FOREIGN_TOAST_PACKAGES = [
  'react-hot-toast',
  'react-toastify',
  '@/components/ui/use-toast',
  '@/hooks/use-toast',
];
/**
 * Motion/CSS properties that are cheap to animate (compositor-only). Anything animated that is
 * NOT in here triggers `animated-property` — the check is an allowlist on purpose: a denylist
 * silently passes every property nobody thought of, which is the failure mode that matters.
 */
export const COMPOSITOR_SAFE_ANIMATED_PROPS = new Set([
  'opacity',
  'x',
  'y',
  'z',
  'scale',
  'scaleX',
  'scaleY',
  'rotate',
  'rotateX',
  'rotateY',
  'rotateZ',
  'skew',
  'skewX',
  'skewY',
  'transform',
  'translateX',
  'translateY',
  'filter',
  'transition',
]);
//# sourceMappingURL=frontend.rules.js.map
