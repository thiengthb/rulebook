#!/usr/bin/env node
/**
 * Copy the compiled checker into the plugin, so the plugin ships a runnable artifact.
 *
 * The plugin is consumed by `git clone`, not by `npm install`, so its JS must be committed —
 * unlike `dist/`, which is gitignored. This script is the only thing that writes into
 * `plugins/**\/{lib,rules}`; those files are build output that happens to be tracked.
 *
 * Run: npm run build:plugin   (build → copy → the plugin is current)
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PLUGIN = join(ROOT, 'plugins', 'rulebook-frontend');

const FILES = [
  ['dist/lib/check-component.js', 'lib/check-component.js'],
  ['dist/rules/frontend.rules.js', 'rules/frontend.rules.js'],
];

for (const [from, to] of FILES) {
  const target = join(PLUGIN, to);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(ROOT, from), target);
  console.log(`  ${from} → plugins/rulebook-frontend/${to}`);
}
console.log('plugin artifact refreshed');
