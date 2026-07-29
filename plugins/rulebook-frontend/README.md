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

## For maintainers

`lib/` and `rules/` here are **build output that is committed** — the plugin is consumed by `git clone`, not by
`npm install`. After editing a rule or the checker:

```
npm run build:plugin
```

`lib/plugin-artifact.test.ts` fails if you forget: it fires the real hook as a subprocess and checks that every rule
declared in source is present in what ships.
