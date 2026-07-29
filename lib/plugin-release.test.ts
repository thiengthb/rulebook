/**
 * The release gate, as a test — so it fails in `npm test` and in CI, not only for whoever happens
 * to run `npm run build:plugin`.
 *
 * The failure it exists for is measured, not imagined. On 2026-07-29 the checker was fixed six
 * commits in a row and every installed copy kept running the FIRST build: `claude plugin update`
 * resolves by the version in `plugin.json`, and the version had not moved. The stale build
 * reported 15 error-severity violations across 7 files in this platform's own repos that the
 * current checker passes — so "committed and pushed" was, for two hours, indistinguishable from
 * "delivered" while being nothing like it.
 *
 * `.release.json` is the pin: a version plus a hash of the bytes that shipped under it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — a plain .mjs helper shared with the build script; no types, on purpose.
import { artifactSha, PLUGIN_DIR } from '../scripts/artifact-sha.mjs';

const ROOT = join(import.meta.dirname, '..');
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

const plugin = read(join(PLUGIN_DIR, '.claude-plugin', 'plugin.json'));
const marketplace = read(join(ROOT, '.claude-plugin', 'marketplace.json'));
const release = read(join(PLUGIN_DIR, '.release.json'));
const entry = marketplace.plugins.find((p: { name: string }) => p.name === 'rulebook-frontend');

describe('the plugin release pin', () => {
  it('declares the same version in plugin.json and marketplace.json', () => {
    // A consumer resolves the version from the marketplace entry; a disagreement means an install
    // can receive an artifact that does not match the version it thinks it has.
    expect(entry?.version).toBe(plugin.version);
  });

  it('records that version in .release.json', () => {
    expect(release.version).toBe(plugin.version);
  });

  it('pins the exact bytes that shipped — a changed checker with an unchanged version fails HERE', () => {
    expect(
      artifactSha(),
      `The shipped checker no longer matches .release.json.\n` +
        `If you changed a rule: bump the version in plugins/rulebook-frontend/.claude-plugin/plugin.json\n` +
        `AND .claude-plugin/marketplace.json, then run \`npm run build:plugin\`.\n` +
        `Without a bump, \`claude plugin update\` reports "already at the latest version" and no\n` +
        `consumer ever receives the fix (measured 2026-07-29: 6 commits undelivered).`,
    ).toBe(release.artifactSha256);
  });

  it('uses a version a consumer can compare — plain semver, no range or tag', () => {
    // `claude plugin update` compares these as versions; anything clever here breaks silently.
    expect(plugin.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
