# rulebook-frontend

Checks every `.tsx` / `.jsx` / `.css` file you write against this platform's frontend rules, the moment you write it.

**Offline and deterministic.** No server, no network, no model call — a parser and a rule table, running on your machine.
A file with an `error`-severity violation makes the hook exit 2, so the finding lands in front of Claude as something it
has to deal with; warnings are reported without interrupting.

## Install

```
/plugin marketplace add thiengthb/rulebook
/plugin install rulebook-frontend@rulebook
```

Then restart the session. Nothing else goes in the consuming repo — no config file, no dependency, no `.mcp.json`.

## What it checks

Nine rules: icon set · emoji as icon · hardcoded color · `forwardRef` · `dangerouslySetInnerHTML` · toast library ·
secrets in client code · animated properties · debug logging. Each violation names the line, what is wrong, and what to
do instead.

## Why a hook and not an MCP server

Both were built. The MCP server (`server/`) keeps the rule data off your disk and sends back only verdicts — but it runs
only when the model decides to call it, and it needs hosting, auth and uptime. This hook runs whether or not anyone
thinks to ask, works on a plane, and costs nothing to operate. The trade is 4.4 KB of rule data sitting in
`plugins/rulebook-frontend/rules/` on your machine.

**This plugin is the supported route.** The MCP server is still in the repo and still passes its tests, but it has zero
consumers and is kept only as an option for a machine that cannot install a plugin. It has **no authentication of any
kind** and must never be exposed off-machine. If you are setting something up, set up this plugin.

Full reasoning, with the numbers: `platform/plans/2026-07-29-idea-0023-mcp-platform-server-build.md` §Phase 3 verdict.

## When the rule is wrong

Some code is correct and the checker cannot tell. Say so in a comment, with a reason of at least 20 characters — a bare
directive does nothing, because writing the sentence is where a person decides rather than silences:

```tsx
// rulebook-allow: hardcoded-color — Google brand mark, colors fixed by brand guidelines
<path fill="#4285F4" />
```

It covers that line and the next, and only the rule it names. When the WHOLE file is the exception, declare it in the
first 10 lines with a different, deliberate directive:

```tsx
// rulebook-allow-file: hardcoded-color — rendered to PNG by Satori, where CSS variables do not exist
```

Never widen or weaken a rule to get green — that is what these are for.

## The usage log — what it records, and how to turn it off

The hook appends **one line per checked file** to `~/.claude/rulebook-usage.jsonl`:

```json
{
  "ts": "2026-07-29T12:04:31.882Z",
  "v": "0.2.0",
  "ext": "tsx",
  "outcome": "blocked",
  "n": 2,
  "e": 2,
  "rules": ["emoji-as-icon", "icon-set"]
}
```

**Metadata only, and it never leaves your machine.** A timestamp, the extension, the counts, and which rule ids fired —
never the file path, never a line of your source, no network call anywhere in this plugin. A clean file is logged too
(`outcome: "clean"`), because a gate that only records its complaints looks unused exactly when it is working.

- **Off:** `RULEBOOK_USAGE_LOG=off`
- **Elsewhere:** `RULEBOOK_USAGE_LOG=/path/to/log.jsonl`
- **Read it:** `node scripts/usage-report.mjs` (in a clone of this repo)

It exists for one question — _is this thing actually used?_ A hook that exits 0 on a clean file leaves no trace, so
without this the answer could only ever be a feeling. Logging can never change an exit code: if the log cannot be
written, the check still runs and still blocks.

## For maintainers

`lib/` and `rules/` here are **build output that is committed** — the plugin is consumed by `git clone`, not by
`npm install`. After editing a rule or the checker:

```
npm run build:plugin
```

`lib/plugin-artifact.test.ts` fails if you forget: it fires the real hook as a subprocess and checks that every rule
declared in source is present in what ships.

### Releasing: bump the version, or nobody gets your fix

**`claude plugin update` resolves by the `version` in `plugin.json` — not by commit.** A change committed and pushed
under an unchanged version is never delivered: the updater answers _"already at the latest version"_ and every installed
copy keeps running the old build. This is not hypothetical. On 2026-07-29 six consecutive commits — including two
false-positive fixes — sat undelivered while the installed 0.1.0 reported **15 error-severity violations across 7 files**
that the fixed checker passes.

So a release is:

1. bump `version` in **both** `plugins/rulebook-frontend/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`
2. `npm run build:plugin` — it records the new version against a hash of the shipped bytes in `.release.json`
3. commit, push
4. consumers: `claude plugin update rulebook-frontend@rulebook`, then **restart the session**

Steps 1–2 are enforced, not remembered: `build:plugin` **exits 1** if the shipped artifact changed while the version did
not, and `lib/plugin-release.test.ts` fails the same case in `npm test`.
