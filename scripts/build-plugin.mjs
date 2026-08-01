#!/usr/bin/env node
/**
 * Copy the compiled checker into the plugin, so the plugin ships a runnable artifact.
 *
 * The plugin is consumed by `git clone`, not by `npm install`, so its JS must be committed —
 * unlike `dist/`, which is gitignored. This script is the only thing that writes into
 * `plugins/**\/{lib,rules}`; those files are build output that happens to be tracked.
 *
 * Run: npm run build:plugin   (build → copy → the plugin is current)
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *  THE RELEASE GATE — why this script can refuse
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *  Measured 2026-07-29, on this machine, with the plugin installed at user scope: the checker was
 *  fixed six commits in a row, every fix was committed and pushed, and the INSTALLED plugin kept
 *  running the first build. `claude plugin update` reported *"already at the latest version
 *  (0.1.0)"* — because a consumer updates by the **version in `plugin.json`**, not by commit. The
 *  cost was not theoretical: the stale build reported **15 error-severity violations across 7
 *  files** in this platform's own repos that the current checker correctly passes.
 *
 *  A comment saying "remember to bump the version" would have been the same kind of control that
 *  failed here. So the bump is enforced: `.release.json` pins the version to a hash of the shipped
 *  artifact, and this script exits non-zero if the artifact changed while the version did not.
 *  `lib/plugin-release.test.ts` checks the same thing from `npm test`, so it also fails in CI.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactSha, COPIED_FILES, PLUGIN_DIR } from './artifact-sha.mjs';

/**
 * `fileURLToPath`, never `.pathname`. On Windows a file URL's `pathname` is `/C:/project/...` — with a leading
 * slash — so `join(ROOT, x)` produced `C:\C:\project\...` and the build died with ENOENT on mkdir. Measured
 * 2026-08-01: this script had **never been runnable on the Windows box**, which is why the committed bundle
 * there was whatever the other machine last produced.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PLUGIN = PLUGIN_DIR;
const RELEASE = join(PLUGIN, '.release.json');

for (const rel of COPIED_FILES) {
  const from = join('dist', rel);
  const target = join(PLUGIN, rel);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(ROOT, from), target);
  console.log(`  ${from} → plugins/rulebook-frontend/${rel}`);
}

const pluginVersion = JSON.parse(
  readFileSync(join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'),
).version;
const marketplace = JSON.parse(
  readFileSync(join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'),
);
const entry = marketplace.plugins.find((p) => p.name === 'rulebook-frontend');

if (entry?.version !== pluginVersion) {
  console.error(
    `\nplugin.json says ${pluginVersion} but marketplace.json says ${entry?.version} — a consumer` +
      `\nresolves the version from the marketplace, so these disagreeing means an install can get` +
      `\nan artifact that does not match its declared version. Make them equal.`,
  );
  process.exit(1);
}

const sha = artifactSha();
let recorded = null;
try {
  recorded = JSON.parse(readFileSync(RELEASE, 'utf8'));
} catch {
  // First run: nothing recorded yet, so whatever is here becomes the baseline.
}

if (recorded && recorded.artifactSha256 === sha && recorded.version === pluginVersion) {
  console.log(`plugin artifact refreshed — unchanged, still ${pluginVersion}`);
  process.exit(0);
}

if (recorded && recorded.artifactSha256 !== sha && recorded.version === pluginVersion) {
  console.error(
    `\nREFUSING to record this build.` +
      `\n\nWhat ships CHANGED (checker, rules, or hook) but plugin.json still says ${pluginVersion}.` +
      `\nConsumers update by version, not by commit: \`claude plugin update\` would answer` +
      `\n"already at the latest version (${pluginVersion})" and every installed copy would keep` +
      `\nrunning the old checker — committed, pushed, and never delivered. That happened on` +
      `\n2026-07-29 and cost 15 false error reports across 7 files.` +
      `\n\nBump the version in BOTH:` +
      `\n  plugins/rulebook-frontend/.claude-plugin/plugin.json` +
      `\n  .claude-plugin/marketplace.json` +
      `\nthen re-run \`npm run build:plugin\`. Consumers then need \`claude plugin update\` +` +
      `\na restart, so say so in the commit body.`,
  );
  process.exit(1);
}

writeFileSync(
  RELEASE,
  JSON.stringify({ version: pluginVersion, artifactSha256: sha }, null, 2) + '\n',
);
console.log(`plugin artifact refreshed — released ${pluginVersion} (${sha.slice(0, 12)}…)`);
console.log('consumers need: claude plugin update rulebook-frontend@rulebook  +  restart');
