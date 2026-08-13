# ADR-0016: Tool-call counters are run-scoped and durable; every regime that cannot support the audit identity says so

- **Status**: Accepted 2026-08-12 (prompt `0.22.4`, server `0.49.3`)
- **Source initiative**: BL-121 (see the stanza in [`BACKLOG.md`](../development/BACKLOG.md); repairs the remote half of BL-071, whose in-process counter is described in [`ARCHITECTURE.md`](../../../mcp-server/src/docs/ARCHITECTURE.md))

## Context

The `BL-045-VERIFY` block exists because **models are unreliable narrators of their own behaviour**. BL-071's answer was to stop asking: the server counts every wrapped tool call, the model copies the numbers verbatim, and the operator hard-checks

```
precheck.iterations === serverToolCallCounts.validate_irl_provenance.succeeded
```

**On the remote Worker that identity cannot hold.** `createServer` runs **per HTTP request** inside the handler factory ([`handle-authenticated.ts`](../../../mcp-server/src/pipeline/handle-authenticated.ts), [`worker.ts`](../../../mcp-server/src/worker.ts) — "built per-request rather than per-isolate"), constructing a fresh `InMemoryToolCallCounters` each time. The envelope's snapshot can therefore only ever contain the request it is inside.

Observed on the 2026-08-12 Kestrel production run: the envelope reported itself as `{attempted: 1, succeeded: 0}` and `validate_irl_provenance` as all-`null`, while the model honestly reported `precheck.iterations: 2`. The model behaved correctly — it declined to invent numbers the server could not supply. What was left was `precheck.iterations` as a model assertion, which is precisely the thing BL-071 was built to eliminate, on the transport the team actually uses.

Three compounding failures, all one class — **a claim written as universal from a stdio-shaped view of the system**:

1. The prompt asserted the identity holds, giving a reason (`validate_irl_provenance` is registered exactly once, so nothing double-counts) that is true and **irrelevant to why it fails**.
2. It told operators to fail runs on drift against a check that could not pass remotely.
3. `tests/integration/bl-071-precheck-derivation.test.ts` claimed to prove the identity while **sharing one counter map across handlers** — a correct stdio test read as universal. The stand-in reproduced the assumption instead of the topology, which is why nothing caught this until production.

The same file had already learned this lesson once: the IRL body cache moved to Upstash under BL-076 _because_ "isolates rotate between requests". The counters were left behind.

## Decision

**1. Counts accumulate durably, keyed by the run.** Three IRL-pipeline tools (`validate_irl_provenance`, `compose_dossier_envelope`, `prepare_irl_body`) write to an Upstash hash at `mcp:irl-run-counts:<irlBodyHash>`, one field per `<tool>.<counter>`, `HINCRBY` per event, TTL 4h — matched to `IRL_BODY_CACHE_TTL_SECONDS` so a counter never outlives the body it counts against.

A hash rather than a key per counter keeps the read to one `HGETALL` and the TTL to one key, and `HINCRBY` is atomic per field, so concurrent calls cannot lose an increment the way read-modify-write would. That matters in one direction specifically: a lost increment **under**-reports, failing a run that was fine.

The `mcp:` prefix is mandatory, not stylistic — the shared token's ACL is `+@all ~mcp:*`, and BL-076 shipped once with a non-conforming prefix and spent the whole BL-077a/b/c diagnostic chain rediscovering that as `NOPERM`.

**2. The run key is the body hash — of the bytes the call actually operated on — and a split key is a true signal.** Every tool in an IRL run already carries or derives it, so nothing new is minted or threaded, and it is the _correct_ scope. "These bytes" is what the audit cares about; "this TCP session" is not.

The consequence is deliberate: if a model validates body A and composes body B, the keys differ and the count comes up short. That is a **finding**, not a lost count — it verified bytes it did not submit. Forcing both onto one key would manufacture agreement the run never earned.

**Precedence follows from that, and it is the opposite of the obvious choice.** `validate_irl_provenance` accepts an inline `filledIrl` _and_ a bound `irlBodyHash`, gives the body precedence for matching, and never cross-checks the two. So when they disagree, the call verified the **inline body** — and keying it by the bound hash would credit the composed run with a verification that ran on different bytes, closing the identity over work that never touched the submitted body. That is a false green, the one outcome this ADR refuses. `runKeyOf` therefore derives from `filledIrl` when present and falls back to `irlBodyHash`.

This costs nothing in the common case: identical bytes hash identically, so a split occurs **only** on real disagreement — precisely when the two calls belong to two different bodies. Both halves are pinned by tests (`keys a validate call by the bytes it actually verified` and `agreeing body and hash produce ONE key`), the second guarding the first from over-correcting into a scheme where every legacy caller emitting both fields loses its counts.

_First shipped inverted_ (bound hash winning), on the reasoning that preferring the body would split a run across two keys. That reasoning was wrong on the case that matters — the split it prevented was the one worth having — and the test written to pin it could not fail, because it supplied a body and a hash that agreed. Caught in review; recorded here because the failure mode (an assertion that cannot fail, guarding a claim that is false) is the same one this whole ADR exists to close, one layer up.

_Rejected: minting a session id_ to cover all 17 tools. It invents an identifier to make a number bigger, with no consumer asking for the other 14 tools' cross-request counts, and it would have made the split-key case silently disappear — trading a true signal for a comfortable one.

**3. `countersScope` is emitted, and it is threaded, never inferred.**

| scope     | condition                                                  | identities  |
| --------- | ---------------------------------------------------------- | ----------- |
| `session` | stdio (`metricsSink === undefined`) — process-lifetime map | hold        |
| `run`     | Worker, Upstash bound, **snapshot read succeeded**         | hold        |
| `request` | Worker unbound, **or the read failed**                     | do not hold |

The read-failure branch is not optional. Bound-but-unreadable would otherwise report `run` over request-scoped numbers — every earlier row missing under a label promising the identity holds, which is a _total_ false red.

Deriving the scope from the read result instead would produce a constant: `compose_dossier_envelope` writes its own row before reading, so the key is non-empty on every Worker call. The value is set in `server.ts`, where transport and binding are both known.

**4. `snapshot()` distinguishes "no calls" from "unreadable".** `hgetall` returns **`null` for a missing key**, so the naive pass-through collapses both into `null`. `snapshot()` maps a no-throw `null` → `{}` and reserves `null` for the catch path. The fake Redis in the unit tests reproduces `hgetall`→`null`-on-empty for exactly this reason: a stand-in that lies in the direction the ticket exists to correct is worse than no test.

**5. Durable writes happen at wrapper EXIT, and the cost is stated rather than glossed.** Nothing on the entry path, so no round trip in front of the tool call. What that costs: durable `attempted` counts calls that reached the server _and completed the wrapper_ (success, structured rejection, or caught throw). A call whose isolate dies mid-handler is lost. Client-side transport failures were never server-countable at either placement — the wrapper never ran.

So `precheck.attemptsTotal === attempted` can no longer hold as an equality. It is **not** replaced by prose scoping, which would surrender the machine-checkability BL-071 exists for, but by a reconciliation that stays arithmetic:

| identity                                                                        | status                         |
| ------------------------------------------------------------------------------- | ------------------------------ |
| `iterations === succeeded`                                                      | unchanged                      |
| `attemptsTotal − attempted === count(transport-classed errorsEncountered)`      | replaces the equality          |
| `errorsEncountered.length === rejected + errored + (attemptsTotal − attempted)` | replaces `length === rejected` |

The third is not optional: with exit placement `errorsEncountered` holds rejected-class **and** transport entries, so `length === rejected` is false the moment a transport failure occurs. Correcting only the second would leave a set that contradicts itself.

`attempted` is still written durably even though it is derivable from the outcome sum — agreement between the two is a free integrity check on the row, catching a torn write.

**6. The transport-classed subset is pinned closed.** `transport-timeout` and `transport-disconnect`, nothing else. Left as examples ("e.g., `schema-min-200`, `transport-timeout`, …"), an operator counting transport-classed entries would have to decide for themselves whether `connection-reset` qualifies — putting an arithmetic check straight back into judgement. The labels are borrowed from the `toolErrors` `errorClass` enum for cross-block consistency, even though the two blocks are a strict partition with no overlap.

**7. Failure is quiet, and the client is configured for it.** Modelled on [`inoreader-egress.ts`](../../../mcp-server/src/lib/inoreader-egress.ts), whose comment states the trade exactly — _"Counter is a guard rail, not auth — degraded Upstash shouldn't fail user requests."_ This is deliberately the **opposite** of BL-076's body cache, which throws when Upstash is unbound: a missing body corrupts the dossier, a missing counter only weakens a report.

The counter takes its own Redis client with `retry: false`. Read exactly: `attempts` defaults to 5, the loop is `i <= attempts` and the sleep is guarded by `i < attempts`, so the SDK default is **six fetch attempts and five sleeps** — `exp(0..4)*50` = **4,289 ms**. Exit placement moves that off the pre-call path but leaves it on the **response** path of every instrumented call during a brownout, which would mean degraded Upstash degrading the run — exactly what fail-quiet promises it will not. `retry: false` resolves to `{attempts: 1, backoff: () => 0}` → **two fetch attempts, no sleep**. Note that `retries: 1` gives the same two attempts _plus_ a 50 ms sleep, so `false` is the true floor.

**8. The write is awaited, for a narrow reason.** `ctx.waitUntil` _is_ threaded and does not cancel, so "Workers cancel un-awaited promises" is not the justification. The real one: the write must land before a **later request** reads it, and `waitUntil` gives no ordering guarantee against the next request.

**9. The merge rule.** The per-request map accumulates _every_ call in that request, not just the in-flight one, so neither addition nor override is right — the first double-counts a completed same-request call, the second loses the envelope's own in-flight attempt.

> Outcomes come from durable; `attempted` = durable `attempted` + the **in-flight delta** from in-process (`attempted − succeeded − rejected − errored`, per tool). With no durable snapshot — stdio, unbound, or a `null` read — use the in-process map wholesale.

The delta is 1 for the call inside the wrapper and 0 for completed ones. On the supported re-call path, durable `{1,1}` + delta 1 = `{attempted: 2, succeeded: 1}` — the `N / N−1` shape the prompt already documented. A first call in a fresh run is `{1,0}`.

## Consequences

**The identity is checkable on the transport the team uses**, and every regime where it is not says so in the output rather than presenting request-scoped numbers as if they were session-scoped.

**A false red is accepted where a false green never is.** A write lost mid-run in an _earlier_ request is invisible at compose time: the count under-reports while scope reads `run`. The operator investigates and finds a brownout. That is narrow — the read-failure branch handles the total case — and it is the correct direction to fail.

**A repeat ingestion of identical bytes inside the TTL window accumulates onto the same row, and the count comes up LONG.** The key is the body hash and the row lives 4h, so a second `gst_irl_ingestion` over an unchanged IRL sees the first run's calls included: `precheck.iterations` is per-invocation while durable `succeeded` is per-bytes-per-window, and the identity fails on a perfectly good run. Reachable in normal operation — re-running an IRL after an unsatisfactory dossier is ordinary, and UAT-07 instructs testers to re-run.

Making it per-invocation would require an invocation id, and minting one is the speculative half this ADR declines under decision 2 — it would also dissolve the cross-request continuity that is the entire point. So the behaviour stands and is **named** instead: the prompt enumerates it as the one benign cause of a long count, tells the model to report the served numbers unadjusted with a note, and tells the operator it is not grounds to fail a run once a prior ingestion is confirmed. `tests/integration/bl-071-precheck-derivation.test.ts` → _"accumulates a repeat invocation over IDENTICAL bytes onto the same row"_ executes it.

The first draft enumerated three causes of a count **short** of the model's memory and none for a count **long** of it, while instructing the model not to adjust the numbers — asymmetric coverage of a symmetric failure, which is the same over-claiming this ADR exists to correct. Caught in review.

**`prepare_irl_body` is a store-liveness canary with a known hole.** Its row proves the durable store was live for this run, _except_ on the pre-populated path, where the prompt deliberately tells the model to skip it — so the canary is absent exactly where the strongest provenance path runs. The prompt names the hole rather than relying on the canary.

**A short count has three causes and the prompt enumerates all three** — `request` scope, a different-bodied validation, or a lost write — with two discriminators (`{}` vs absent, and the canary) to narrow between them. Promising one cause would have been the same over-claim this ADR exists to correct.

**Testing had to change shape, not just grow.** The Worker-topology cases drive **two `createServer` calls sharing one durable store**, because that is what a real request pair is. Hand-building two `MetricsContext`s would re-encode the topology by assertion — the same stand-in that hid the bug — and could not catch a wiring fault in `server.ts`, which is where it lived. Confirmed by deliberate break: removing the durable write fails four Worker-topology cases while all four stdio cases pass. That asymmetry is the proof the test models the real defect.

**Not in scope**: durable counting for the other 14 tools (no run key; their `toolErrors` identity is scope-qualified instead), and server-authored `errorsEncountered` entries (the _count_ becomes checkable; `errorClass` and `recoveryAction` stay model-narrated, as BL-071 specifies).
