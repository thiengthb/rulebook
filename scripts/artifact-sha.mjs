/**
 * The identity of the SHIPPED plugin artifact — the two committed, compiled files a consumer
 * actually runs. Lives in its own module because both the build gate (`build-plugin.mjs`) and the
 * test that enforces the same rule (`lib/plugin-release.test.ts`) need it, and importing the build
 * script would run the build.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

export const PLUGIN_DIR = join(
  new URL('..', import.meta.url).pathname,
  'plugins',
  'rulebook-frontend',
);

/**
 * Hashed over the relative path plus the bytes, so renaming a shipped file also counts as a change.
 * Whitespace is NOT normalised: a reformat that reaches a consumer is still a new artifact, and
 * pretending otherwise is how "the same version" ends up meaning two different builds.
 */
export function artifactSha(pluginDir = PLUGIN_DIR) {
  const h = createHash('sha256');
  for (const rel of SHIPPED_FILES) {
    h.update(rel);
    h.update(readFileSync(join(pluginDir, rel)));
  }
  return h.digest('hex');
}
