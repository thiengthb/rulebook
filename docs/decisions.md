# rulebook — decisions & pitfalls (append-only, newest on top)

> The durable **why**. Standard: `platform/standards/documentation.md §5`. Cross-project lessons live in
> `platform/registries/knowledge-ledger.md`; the dated raw record lives in `platform/log/`.

---

## 2026-07-29 — The confidentiality claim came back weaker than it went in, and that is written down here rather than at the point where it would settle an argument

**Context.** The whole project exists because "don't expose the core rulebook" was a stated requirement. Phase 1's
Step 1.5 was written as a kill-switch: grep the consumer's disk and transcript for rule text, and a non-zero count means
the design is false as built.

**Finding.** The gate passed — 0 of 1391 distinctive 6-word shingles, and the gate was proven able to fail (a planted
rulebook sentence produced 11 hits and exit 1). But _what it tests_ is narrower than _what was claimed_. It shows the
rule **text** did not travel. It does not show the rules are unreconstructible from enough verdicts, and they partly
are: `icon-set`'s fix says "import from `lucide-react`", `toast-library`'s says "import `toast` from `sonner`". Someone
collecting verdicts across enough files recovers much of the mandatory-UI list without ever seeing the rulebook.

**Why it cannot simply be fixed.** A fix that names no remedy is not a fix. The leakage is inherent to the tool being
useful at all, so it is a property of the design, not a bug in it.

**Decision.** State the weaker claim everywhere the stronger one appeared: **metered, revocable, logged access — not
secrecy.** The proposal's own pre-mortem predicted exactly this ("if confidentiality is oversold, the whole premise
weakens"), which is the reason it is being honoured instead of argued around. Consequence carried forward: Phase 3
scores Option A against the weaker claim, and the Option B counter-case (private plugin marketplace — offline, free,
ships hooks) is correspondingly stronger.

**Related.** `platform/plans/2026-07-29-idea-0023-mcp-platform-server-build.md` §"Phase 1 closed" ·
`scripts/leak-check.mjs` · `docs/00-map.md §9`.

---

## 2026-07-29 — The checker is deterministic because of security first, cost second

**Context.** `review_component` could evaluate submitted code either with hand-written checks or by calling a model
with the rules in its system prompt. The model route covers far more of the rulebook.

**Decision.** Deterministic, no model — for the thin slice and until there is evidence it is insufficient.

**Why.** The obvious arguments (free, fast, unit-testable, a verdict that cannot drift with a model's mood) are real
but secondary. The load-bearing one: **an LLM checker would send the rule text to a third-party API on every call.**
That is a materially different security story from "the rules never leave the server", and it would have been
discovered after the architecture was committed rather than before. Step 0's classification made the choice
affordable — the verification-shaped half is precisely the _artifact-decidable_ half (icon set, hardcoded colors,
`forwardRef`, `dangerouslySetInnerHTML`, secrets in the client bundle), which is what a parser can reach.

**Recorded limitation.** It scans text, it does not parse an AST. Comments are blanked first, but odd formatting can
still fool it. Whether the false-positive rate is acceptable is a **Phase-3 measurement, not an assumption**.

**Related.** `lib/check-component.ts` header · `.claude/scripts/rule-classify.mjs` (58.9% PASS).

---

## 2026-07-29 — `instructions` and the tool result are opposite channels, and conflating them would leak the rulebook through a door we opened ourselves

**Context.** The MCP server can push an `instructions` block into the consumer's system prompt. The temptation is to
put the rules there — it is the one place the model reliably reads.

**Decision.** `INSTRUCTIONS` carries **process only** (when to call the tool, how to read the answer, that `degraded`
means unknown). Zero rule content, enforced by a unit test with a forbidden-term list.

**Why.** The two channels are opposite by design. `instructions` **is** transmitted and lands in the consumer's
transcript — correct, because it carries the generation-shaping half that leaves no trace in the artifact and so cannot
be reviewed into existence. The tool **result** carries the verification-shaped half as a verdict about a submitted
line. Putting rules into `instructions` would send the rulebook to exactly the place the leak gate greps, through a
channel we chose to open — the least defensible possible failure.

**Evidence it works, and it came from a denial.** In a scratch project that had never seen this platform, the first
headless run was refused at the permission prompt, and the session declined to report a result: _"unknown, not clean …
per the server's own guidance, a review that doesn't run must not be read as passing."_ Behaviour under failure, in a
consumer with no other context, is stronger evidence for the block than any unit test of it.

**Related.** `server/mcp-server.ts` header · `server/mcp-server.test.ts` "AC-3" · `docs/00-map.md §6`.

---

## 2026-07-29 — Co-location, not co-versioning — and the build is what noticed

**Context.** The build plan stated as a settled design call, with ruled-out alternatives, that this service would live
_inside_ the control-plane repo so it could read the rulebook off disk.

**Pitfall.** Wrong, and `.gitignore` said so at the first commit attempt: `fleet/` is an **allowlist** repo tracking only
the meta layer, because every app in that folder is a deliberately independent git repo (`sakubun`, `todo`, `commons`,
`journal` each have their own remote). `rulebook/` was silently untracked.

**Why the error was easy to make.** Two things sound like one word: **co-location** (same parent folder ⇒ reads the
rulebook via `../` with no sync — the actual requirement) and **co-versioning** (same git repo — what got written).
Co-location delivers the entire benefit.

**Decision.** `rulebook` is its own repo at `fleet/rulebook/`, beside its siblings, with the convention `commit-msg` +
`pre-commit` hooks installed at init. Phase 4 (cloud) bakes the rulebook into the image at CI build time.

**Also settled here, deliberately early.** The name: `rulebook`, not `fleet-mcp` — it names what the thing serves rather
than the transport, so it survives Phase 4 adding a plugin marketplace beside MCP. A project's name is cheap to change
before the directory exists and annoying afterwards.

**Related.** `platform/ledger/2026-07.md` 2026-07-29 "A design document cannot notice that it disagrees with the repo" ·
`platform/plans/2026-07-29-idea-0023-mcp-platform-server-build.md` §A.

---

## 2026-07-29 — Backflow: the tool that reverses the direction of trust

**Context.** Phase 2 adds `report_lesson`, so a project consuming this server can send prose _back_. Every other path
here takes untrusted input (someone's source file) and returns a verdict a parser produced. This one takes prose written
by a model in someone else's project and stores it in the repo this platform's own agent reads.

**Decision.** Three defences, deliberately ranked by how much each actually buys:

1. **Inert storage** — `platform/inbox/quarantine/`, which nothing auto-loads. This is the one that matters.
2. **The caller never picks the path.** There is no `id` or `filename` input; the id is minted server-side. Traversal is
   not filtered, it is unreachable — and a test asserts that adding such a field would fail.
3. **Fenced under an untrusted header**, with a fence computed as one backtick longer than the longest run in the body,
   so a submission cannot break out of its own block. Metadata is reduced to labels, so no submission can forge
   `status: approved` into the frontmatter.

Refusals are refusals: an oversized lesson is rejected, never truncated (a truncated lesson is a misquoted one, and a
human would be judging the misquote), and a failure to locate the inbox reports `degraded` rather than claiming a
storage that did not happen.

**The honest limit.** Points 2–3 are mitigation, not a wall. A session that _reads_ a quarantined file still pulls the
text into its context — the `Read` tool is not on the autonomy gate's matcher at all. The wall is the gate on
**promotion**, because the damage is a lesson becoming law, not a lesson being read. Stated in the quarantine README and
in the gate proposal rather than left for someone to discover.

**Also decided:** the tool's response is a receipt, not an answer — _"filed, unread; nothing changes until a person
reads it"_. A consumer that believes the platform has LEARNED something will act as if the rules changed. The
`INSTRUCTIONS` block says the same thing, and a test pins both.

**Related.** `lib/report-lesson.ts` header · `platform/inbox/quarantine/README.md` ·
`platform/proposals/2026-07-29-quarantine-promotion-gate.md`.

---

## 2026-07-29 — The governance write-block was bypassable by shell, and only a promotion path exposed it

**Context.** Step 2.2 asked for a gate change blocking quarantine→governance promotion. Writing the tests for it meant
first asking what the live gate already blocked.

**Pitfall.** `cp evil.md .claude/hooks/autonomy-gate.mjs` was **ALLOWED** in autonomous mode. The governance block lived
only on the `Write`/`Edit`/`MultiEdit` branch; the `Bash` branch denied ~23 command classes and not one of them was
"write a file". The gate had read as airtight since 2026-06-19 because every test reached it through the file tools —
the suite and the hole shared the same blind spot.

**Decision.** The proposed gate judges a redirect by its **target** (so `grep -r x .claude/skills > /tmp/o` stays
allowed while `cat lesson.md >> CLAUDE.md` does not) and blocks write verbs that name a governance path. Measured rather
than asserted: 26/26 on the proposed gate, **10/26 on the live one** — a new test that passes against the unchanged
system is measuring nothing. The existing 75-case suite goes 75/75 → 74/75, the single flip being
`Write platform/standards/documentation.md`, which this proposal argues should be a BLOCK.

**Not installed.** The agent must never edit its own gate (CVE-2025-53773). Drop-in + rationale sit in
`platform/proposals/`; a human commits.

**Related.** `platform/proposals/2026-07-29-quarantine-promotion-gate.md` ·
`platform/proposals/autonomy-gate.quarantine.test.mjs`.

---

## 2026-07-29 — Phase 3: the kill-switch measured the rulebook, not the tool that would check it

**Context.** Step 0 gated this whole project on one number: 58.9% of the rulebook is verification-shaped, above a
pre-committed 40% floor. Phase 3's job was to ask whether the thin slice earned the expensive half.

**Pitfall.** The number was right and the inference from it was not. 58.9% is a property of the **rules**;
`review_component` is stateless, takes a single file, and calls no model. Re-classifying the same 33 verification-shaped
statements against _that shape_: 12 (36%) decidable from the submitted file, 7 partly, and **14 (42%) needing repo
state, host state, a rendered UI, or judgment** — "the Traefik router name is unique across the NUC", "update
`shared-assets.md` when you extract", "push the `'use client'` boundary deep through the tree". Reachable share:
**~21–34% of the rulebook**, not 58.9%. The plan carried the warning one level shallower ("Step 0 measured the rulebook,
not the checker") and read it as _does the checker catch them well_ — the deeper question was whether the tool's shape
can **see** them at all.

**The generalisable lesson.** A kill-switch measurement must be taken against the **shape of the thing that will be
built**, not against the domain it will operate on. Measuring the domain feels rigorous and pre-commits a threshold,
which is what makes it convincing — and it can still be measuring the wrong noun.

**Second finding.** The confidentiality benefit was compared against zero rather than against the alternative. Shipping
the compiled rule data is **4.4 KB**; the RFC rejected Option B for putting ~760 KB on every disk. Those are not the
same objection. And `check-component.ts` is **pure by invariant**, so it runs anywhere — the server exists only to keep
those 4.4 KB off other machines.

**Decision.** Phase 4 (hosting, OAuth extraction, `cloud` target) is **not authorized**. Proposed re-target **B′**: ship
the checker as a hook through the private plugin marketplace that Step 4.3 already required for hooks — offline, free,
and **deterministically enforced** instead of depending on a consuming model choosing to call a tool (evidence that it
does: n=1). The supervisor accepted Option A and only the supervisor reverses it; this is a proposal.

**Why switching is cheap.** Under B′ the 9 rules, `check-component` + its 33 tests, the leak gate and the quarantine all
survive. What becomes optional is `server/http.ts` (71 lines) and the MCP wrapper. The work was not wasted; it was the
measurement.

**Related.** `platform/plans/2026-07-29-idea-0023-mcp-platform-server-build.md` §Phase 3 verdict ·
`platform/registries/idea-queue.md` idea-0023.

---

## 2026-07-29 — B′: the checker ships as a plugin hook, and the thin slice found a real bug in minutes

**Context.** The supervisor accepted the Phase 3 re-target: deliver the checker through a private plugin marketplace
rather than a hosted MCP server.

**Decision — exit 2, not a message.** The hook returns exit 2 on any `error`-severity violation, which puts stderr in
front of the model as something it must resolve; warnings report through `additionalContext` without interrupting. The
gradient is deliberate: a hook that shouts on every judgement call gets turned off, and then it enforces nothing. Fail
behaviour is inherited from the server's §C — an unreadable file or a checker throw prints _"NOT checked — unknown, not
clean"_, never silence.

**Pitfall — committed build output.** The plugin is consumed by `git clone`, not `npm install`, so its JS must be
committed. That is a silent-staleness trap: edit a rule, forget `npm run build:plugin`, and every consumer keeps
enforcing the old rulebook with no error anywhere. `lib/plugin-artifact.test.ts` fires the real hook as a subprocess and
fails on any source rule id missing from the shipped artifact — and was proven able to fail before being trusted.

**What the slice was really worth.** Within minutes of running the checker from the hook on a hand-written file,
`emoji-as-icon` turned out to be near-useless: the scan was **line-scoped**, so every Prettier-formatted element (`>` on
one line, text on the next, `<` on a third — i.e. almost all real JSX) was invisible; and its text regex excluded braces,
so `>🔥{label}<` matched nothing. **33 tests had been green over this the whole time**, because every fixture put the
emoji alone on one line.

**Two things that fixing it taught, both by failing first.**

1. Blanking `{...}` globally before scanning does not work: in a `.tsx` file the entire component body sits inside `{}`,
   so it blanks the JSX along with the expressions. Blanking must be per text-region.
2. An arrow function's `=>` contains a `>`, so a scan for `>` … `<` opens bogus regions in the middle of attributes —
   which is how a string inside `onClick` got reported as rendered text. Those regions have unbalanced braces, and that
   is the signal used to reject them. The cost is one known miss (`{a && <A/>} 🔥 {b && <B/>}`), **pinned as a test** so
   it is a decision rather than a surprise: this rule fires at `error` and exits 2, so a false positive costs more than
   a miss.

**Mutation-checked, and the first mutant survived** — removing the unbalanced-brace rejection broke nothing, because no
test exercised it. The known-miss test was added until it died.

**Related.** `plugins/rulebook-frontend/README.md` · `platform/plans/2026-07-29-idea-0023-mcp-platform-server-build.md`
§Phase 5.

---

## 2026-07-29 — Step 5.5: contact with 333 real UI files, and what a hook has to survive

**Context.** The plugin was installed at **user scope** from a local marketplace path (`claude plugin marketplace add
/home/thien/projects/fleet/rulebook`) — no repo touched, no push, reversible with one `uninstall`. `claude plugin
details` reports **1 PostToolUse hook, ~0 tokens added to every session**. That number is the quiet argument for B′ over
the MCP path: a server-supplied `instructions` block is paid for in every session's system prompt, whether or not the
tool is ever called.

**The measurement that mattered.** Scanned every `.tsx/.jsx/.css` in `todo`, `sakubun`, `journal`, `yakudoku` —
**333 files, 24 findings in 11 files**. A hook that exits 2 is only viable if that number is small, and it is. But three
of the classes were **wrong**, and each was wrong in an instructive way:

| Finding                                                                        | Verdict                                                                                                                              |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `<CheckinBox initial={{ energy, mood }} />`                                    | **False positive.** `initial`, `animate` and `exit` are ordinary English words. The file never imports Motion — gated on the import. |
| `drop-shadow(… var(--flame2, #f97316))`                                        | **False positive.** The literal is a _fallback_; the token is what applies, so it does follow the theme.                             |
| `fill="#4285F4"` in a Google brand mark; an `opengraph-image` rendering to PNG | **Correct code the rule cannot judge.** Brand colors are fixed by someone else, and CSS variables do not exist outside the browser.  |

**Decision — a reasoned exception, not a severity downgrade.** `rulebook-allow: <rule-id> — <reason>` in a comment, on
the line or the line above, with the **≥20-character reason floor taken from the platform's own `/ui-pattern-lock`
rule**. A bare directive does nothing. Writing the sentence is the mechanism: it is where a person decides rather than
silences. Weakening the rule instead would have hidden the brand-mark case _and_ the real ones.

**Mutation-checked, and one mutant survived again** — "the directive suppresses ANY rule on the line, not the one it
names" broke nothing, because no test had two different violations on one line. The brand-mark fixture now asserts that
`icon-set` still fires while `hardcoded-color` is suppressed, and the mutant dies. Second session running where the
surviving mutant was the _scoping_ of a check rather than the check itself.

**What is left standing:** 20 findings across 333 files. They are in the app repos, and fixing or exempting them is the
app owner's call, not the checker's.

**Related.** `plugins/rulebook-frontend/README.md` · plan §Phase 5.5.

---

## 2026-07-29 — Applied to a real repo: what the exception mechanism had to grow, and what was not an exception at all

**Context.** The 14 `hardcoded-color` findings in `sakubun` were worked through one by one. They split three ways, and
the split is the useful part — a checker's findings are not one kind of thing.

**1. Two files were exceptions in their entirety, not on a line.** A Next.js `opengraph-image` renders to PNG through
Satori, where CSS variables do not exist at all; the Google "G" is a brand mark whose colors are fixed by someone else's
guidelines (the file already said so, in prose, in a doc comment the checker cannot read). Eight of the fourteen
findings were those two files, and annotating them line by line meant six comments repeating one sentence. Hence
`rulebook-allow-file:` — a **different token** from the line directive, valid only in the first 10 lines, with the same
20-character reason floor. Different token on purpose: file scope must be typed deliberately, never drifted into.

**2. Six were not exceptions — they were drift.** The remaining literals sat in `streak-flame.tsx` and
`streak-celebration.tsx`, while `lib/streak-tiers.ts` opens by saying the components "read from here so the ramp stays
in one place". The checker had found the exact places where the file's own stated convention had leaked. Consolidating
them (values unchanged, nothing restyled) is the fix the module asks for.

**Stated plainly, because it would be easy to oversell:** moving a literal from `.tsx` to `.ts` also moves it out of the
rule's scope (`applies: ['tsx','jsx','css']`). Those colours still do not follow light/dark — and they should not. The
flame's colour encodes the streak length, so it is data, not chrome. The honest claim is _centralised_, not _themed_.

**Verified as an end state, not as a green build.** `tsc` clean, `eslint` clean, `next build` clean, the checker at
**0 findings across 166 UI files** — and then the container rebuilt and confirmed `healthy` + HTTP 200, because a
committed edit is not a running one.

**Related.** `plugins/rulebook-frontend/README.md` §"When the rule is wrong" · sakubun `84ad590`.
