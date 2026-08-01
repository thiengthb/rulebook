/**
 * The identity of the SHIPPED plugin artifact — the two committed, compiled files a consumer
 * actually runs. Lives in its own module because both the build gate (`build-plugin.mjs`) and the
 * test that enforces the same rule (`lib/plugin-release.test.ts`) need it, and importing the build
 * script would run the build.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Everything a consumer RUNS, in hash order — not just the compiled checker.
 *
 * `hooks/` is in here deliberately: the first cut of this gate hashed only `lib/` and `rules/`,
 * which meant a change to the hook itself — its exit contract, its logging, its filter — shipped
 * under an unchanged version and was never delivered. That is the exact failure this whole gate
 * exists to stop, reintroduced one level down. Anything that ships and can change behaviour
 * belongs here.
 */
export const SHIPPED_FILES = [
  'lib/check-component.js',
  'rules/frontend.rules.js',
  'hooks/check-file.mjs',
  'hooks/hooks.json',
];

/** The subset the build COPIES out of `dist/`. The rest is hand-written and only hashed. */
export const COPIED_FILES = ['lib/check-component.js', 'rules/frontend.rules.js'];

// `fileURLToPath`, never `.pathname` — on Windows the latter is `/C:/…` and every join built from it lands at
// `C:\C:\…`. Fixed 2026-08-01 alongside the same bug in `build-plugin.mjs` and `leak-check.mjs`; until then
// none of the three could run on the Windows machine.
export const PLUGIN_DIR = join(
  fileURLToPath(new URL('..', import.meta.url)),
  'plugins',
  'rulebook-frontend',
);

/**
 * Hashed over the relative path plus the content, so renaming a shipped file also counts as a change.
 *
 * Whitespace is still NOT normalised — a reformat that reaches a consumer really is a new artifact, and
 * pretending otherwise is how "the same version" ends up meaning two different builds. **LINE ENDINGS are the
 * one exception, and they are not whitespace in the same sense:** git rewrites them per checkout
 * (`core.autocrlf`), so the same commit is CRLF on the Windows box and LF on the Linux one. Hashing raw bytes
 * therefore made the digest a property of the MACHINE rather than of the artifact.
 *
 * Measured 2026-08-01: `npm run build:plugin` on Windows reproduced `lib/check-component.js` and
 * `rules/frontend.rules.js` **byte-for-byte** (delta 0 after normalising, and 0 raw as well), and the release
 * gate still declared the artifact changed and demanded a version bump. The bump was made and then reverted,
 * because there was nothing to release — a gate that cries wolf on one machine teaches people to bump the
 * version to silence it, which is exactly how a real change would slip out unversioned. Same defect class as
 * `fleet`'s `tool-catalog --check`, which called a byte-correct page stale on any fresh Windows checkout.
 */
export function artifactSha(pluginDir = PLUGIN_DIR) {
  const h = createHash('sha256');
  for (const rel of SHIPPED_FILES) {
    h.update(rel);
    h.update(readFileSync(join(pluginDir, rel), 'utf8').replace(/\r\n/g, '\n'));
  }
  return h.digest('hex');
}
