# rulebook — decisions & pitfalls (append-only, newest on top)

> The durable **why**. Standard: `platform/standards/documentation.md §5`. Cross-project lessons live in
> `platform/registries/knowledge-ledger.md`; the dated raw record lives in `platform/log/`.

---

## 2026-07-29 — The confidentiality claim came back weaker than it went in, and that is written down here rather than at the point where it would settle an argument

**Context.** The whole project exists because "don't expose the core rulebook" was a stated requirement. Phase 1's
Step 1.5 was written as a kill-switch: grep the consumer's disk and transcript for rule text, and a non-zero count means
the design is false as built.

**Finding.** The gate passed — 0 of 1391 distinctive 6-word shingles, and the gate was proven able to fail (a planted
rulebook sentence produced 11 hits and exit 1). But *what it tests* is narrower than *what was claimed*. It shows the
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
affordable — the verification-shaped half is precisely the *artifact-decidable* half (icon set, hardcoded colors,
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
headless run was refused at the permission prompt, and the session declined to report a result: *"unknown, not clean …
per the server's own guidance, a review that doesn't run must not be read as passing."* Behaviour under failure, in a
consumer with no other context, is stronger evidence for the block than any unit test of it.

**Related.** `server/mcp-server.ts` header · `server/mcp-server.test.ts` "AC-3" · `docs/00-map.md §6`.

---

## 2026-07-29 — Co-location, not co-versioning — and the build is what noticed

**Context.** The build plan stated as a settled design call, with ruled-out alternatives, that this service would live
*inside* the control-plane repo so it could read the rulebook off disk.

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
