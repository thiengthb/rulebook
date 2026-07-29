# rulebook — AI-primer (00-map)

> Read this first. It is the cheap read that replaces opening the codebase.
> Standard: `platform/standards/documentation.md §4`. Build roadmap:
> `platform/plans/2026-07-29-idea-0023-mcp-platform-server-build.md` (`status: active`).

## 1. Essence

Delivers this platform's frontend rules to other projects **without shipping the rulebook**.

Two mechanisms were built and measured. The MCP server sends back **verdicts, never rule text**. The plugin ships the
**compiled checker** and runs it locally as a hook. **Phase 3 chose the plugin** (2026-07-29, supervisor): the server's
tool shape reaches only ~21–34% of the rulebook, its confidentiality edge over shipping the compiled rules is 4.4 KB,
and an MCP tool only runs when the consuming model chooses to call it — a hook always does.

> ### ⚠ Which path is LIVE — read this before setting anything up
>
> **The plugin is the live path.** `plugins/rulebook-frontend` is installed and in use; a consumer needs two lines
> (`/plugin marketplace add thiengthb/rulebook`, `/plugin install rulebook-frontend@rulebook`) and nothing in their repo.
>
> **The MCP server (`server/**`, `lib/report-lesson.ts`, `lib/request-log.ts` — 998 lines) is kept DELIBERATELY, and has
> zero consumers.** Do not set it up expecting it to be the supported route. It is retained because it is finished,
> pinned by 36 fast tests, costs ~0 per week, and is the only mechanism that could reach a machine that cannot install a
> plugin (a teammate session, a CI job). Decided 2026-07-29 — `platform/proposals/2026-07-29-mcp-path-keep-or-retire.md`
> Option A, **with a falsifiable retire-trigger** recorded in the build plan's check-in runbook. It is a kept option, not
> a live product; if any trigger fires, it goes.
>
> **Never expose the MCP server off-machine** — it has no auth of any kind.

On the MCP path, a consuming project holds a ~6-line `.mcp.json` and nothing else. It submits a source file; it gets back
the violations in that file — line, what is wrong, what to do instead. The rules that produced the verdict stay here.

The design rests on one falsifiable line, measured before any code was written (`rule-classify.mjs`, 58.9% of 515 rule
statements, CI ≈ 46–72%):

> **A rule that shapes generation must be transmitted. A rule that only verifies output need not be.**

The transmitted half has a name — the _process spine_ (research before designing, propose don't execute, thin-slice
first). Those leave no trace in the artifact, which is exactly why they cannot be reviewed into existence.

## 2. Kind & target

`kind: node-service` · `target: local` — and it stays there. Phase 3's verdict (2026-07-29) cancelled the move to `cloud`; delivery is a plugin, not a hosted service. No UI, no database, no user accounts.

## 3. Module map

| Path                         | Role                                                                                                                                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rules/frontend.rules.ts`    | The 9 tier-2 rules **as data** — id, applicable file kinds, severity. Plus the foreign-package lists and the compositor-safe animated-property allowlist.                                                                                                        |
| `lib/check-component.ts`     | `checkComponent(source, {filename}) → Violation[]`. **Pure**: no I/O, no network, no model, no deps. Blanks comments (preserving line numbers) before matching.                                                                                                  |
| `server/mcp-server.ts`       | **KEPT, 0 consumers.** The MCP surface: `createRulebookServer()`, the `review_component` tool, and the server-supplied `INSTRUCTIONS` block. Also `reviewComponent()` / `renderResult()`, which own the degraded-vs-clean contract.                              |
| `server/http.ts`             | **KEPT, 0 consumers.** Streamable HTTP entrypoint, **stateless** — a fresh server+transport per request. `/health` + `/mcp`.                                                                                                                                     |
| `lib/report-lesson.ts`       | **KEPT, 0 consumers.** Backflow (Phase 2): `reportLesson()` files a submitted lesson into `platform/inbox/quarantine/` — the one channel where this platform is the CONSUMER of untrusted input. Sanitises, fences, mints its own id.                            |
| `lib/request-log.ts`         | **KEPT, 0 consumers.** One metadata-only JSON line per tool call (`logs/requests.jsonl`, gitignored, opt-in via `RULEBOOK_LOG_DIR`). Never the submitted source, never a lesson's text. Exists so the plan's check-in gate can be answered with a number.        |
| `plugins/rulebook-frontend/` | **Option B′ (the accepted delivery path):** the same checker shipped as a Claude Code plugin hook — `hooks/check-file.mjs` runs on every UI write, offline, exit 2 on an error. `lib/` + `rules/` there are **committed build output** (`npm run build:plugin`). |
| `scripts/build-plugin.mjs`   | Copies the compiled checker into the plugin. The only writer of `plugins/**/{lib,rules}`. **Also the release gate:** exits 1 if what ships changed while `plugin.json`'s version did not.                                                                        |
| `scripts/artifact-sha.mjs`   | Hash of everything a consumer RUNS (`lib` + `rules` + `hooks`). Shared by the release gate and `lib/plugin-release.test.ts` so both enforce one definition of "the shipped artifact".                                                                            |
| `scripts/usage-report.mjs`   | Reads `~/.claude/rulebook-usage.jsonl` and answers the check-in's only question — _is the hook used?_ Distinguishes "no log", "empty log" and "it ran and verified nothing".                                                                                     |
| `scripts/leak-check.mjs`     | AC-1's falsification gate. Shingles the rule sources and intersects against a consumer's disk **and** its `~/.claude/projects` transcripts. Exit 1 on any hit.                                                                                                   |

## 4. Main flows

**Review** — consumer calls `review_component(code, filename)` → `reviewComponent()` → `checkComponent()` → violations
→ rendered text + `structuredContent`. On any internal throw: `degraded: true`, `isError: true`, **never** an empty
violation list.

**Backflow** — consumer calls `report_lesson(lesson, project?, tags?)` → `reportLesson()` → one fenced `*.quarantine.md`
under `platform/inbox/quarantine/`, which **nothing auto-loads**. The response is a receipt, not an answer: it says the
note is unread and changes nothing. Promotion out of quarantine is a human commit (that directory's `README.md`), and in
an unattended run the promotion path is gate-blocked.

**Leak audit** — `node scripts/leak-check.mjs <consumer-dir>` → 6-word shingles of the rule sources, minus shingles
that also occur in ordinary technical prose, intersected with the consumer's files and transcripts.

**Release** — edit a rule → `npm run build:plugin` → it **refuses** unless `plugin.json` + `marketplace.json` carry a
new version → commit, push → consumer runs `claude plugin update rulebook-frontend@rulebook` and restarts. A consumer
updates by VERSION, never by commit: without the bump, `claude plugin update` reports "already at the latest version"
and the fix is never delivered (measured 2026-07-29 — 6 commits undelivered; `decisions.md`).

**Usage** — every check appends one metadata-only line to `~/.claude/rulebook-usage.jsonl` (`RULEBOOK_USAGE_LOG=off` to
disable). Clean checks are counted too, because a gate that records only its complaints looks unused precisely when it
is working. Read with `node scripts/usage-report.mjs`.

## 5. Run it

```bash
npm install && npm run build && npm start   # → http://127.0.0.1:3901/mcp  (PORT / HOST override)
npm test                                    # 105 tests
node scripts/leak-check.mjs ~/projects/scratch-consumer
```

Consumer side, **B′ (the accepted path)** — nothing lands in the consuming repo at all:

```
/plugin marketplace add thiengthb/rulebook
/plugin install rulebook-frontend@rulebook
```

Consumer side, the MCP path (built, kept, not the accepted one):

```json
{ "mcpServers": { "rulebook": { "type": "http", "url": "http://127.0.0.1:3901/mcp" } } }
```

## 6. Invariants

1. **A verdict is never a rule sentence.** `message` and `fix` are written fresh. A verbatim rulebook sentence in a
   verdict transmits the rule through the one channel the leak gate greps. Unit-tested.
2. **`INSTRUCTIONS` carries process, never rule content.** It IS transmitted (that is correct — it is the
   generation-shaping half), and it lands in the consumer's transcript, so rule content there would be a self-inflicted
   leak. Unit-tested against a forbidden-term list.
3. **Degraded is never clean.** A review that could not run returns `degraded: true` + `isError: true`. An empty
   violation list means the checks ran and found nothing — those two must not render alike. Unit-tested.
4. **Every declared rule has a firing test.** A meta-test fails if a rule in `FRONTEND_RULES` has no mutation case, so
   the rule list and the suite cannot drift apart.
5. **An exception is written, never configured away.** `rulebook-allow: <rule-id> — <reason>` in a comment suppresses
   one rule on one line; `rulebook-allow-file:` in the first 10 lines covers the whole file. Both need a reason of
   ≥20 characters (the floor the platform's `/ui-pattern-lock` rule sets), and file scope needs a different token so it
   is never reached by accident. Weakening or widening a rule to get green is the thing this exists to prevent.
6. **The shipped plugin must not drift from source.** `lib/` and `rules/` under `plugins/**` are committed build
   output; a rule edited without `npm run build:plugin` would leave every consumer enforcing the old rulebook silently.
   `lib/plugin-artifact.test.ts` fires the real hook as a subprocess and fails on any missing rule id.
7. **Nothing filed by `report_lesson` is ever trusted.** The caller supplies no path (the id is minted here, so
   traversal is unreachable rather than filtered); bodies are stored fenced under an untrusted header; oversized
   submissions are refused, not truncated. The inbox is inert — promotion is a human move.
8. **The checker stays pure.** Reading files, calling a model, or hitting the network from `check-component.ts` breaks
   both its testability and the confidentiality story (a model call ships the rules to a third party).

## 7. Secrets

**None today.** No `.env`, no keys, no auth — Phases 1–2 are `localhost` only. `RULEBOOK_QUARANTINE_DIR` overrides
where lessons are filed (tests point it at a temp dir; Phase 4 will need it once the fleet checkout is not on disk). Auth arrives at Phase 4 with `idea-0013`
(`@thiengthb/mcp-auth`), and the server must not be exposed off-machine before it.

## 8. Further reading

- `docs/decisions.md` — the why-log (append-only).
- `platform/plans/2026-07-29-idea-0023-mcp-platform-server-build.md` — active plan; Phases 1–3 + 5.1–5.4 done, `checkin: 2026-08-12`.
- `platform/plans/2026-07-28-idea-0023-mcp-platform-server-proposal.md` — the accepted RFC (sources, options,
  pre-mortem, and the counter-case that is still live).

## 9. What this does NOT claim

The leak gate shows the rule **text** did not travel. It does **not** show the rules are unguessable from enough
verdicts — and they partly are, because a fix that names no remedy is not a fix. The honest claim is **metered,
revocable, logged access — not secrecy.** Phase 3 judges the project against that claim, not a stronger one.
