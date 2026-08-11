# UAT-08 — Radar

> **Prerequisite**: [`SETUP.md`](SETUP.md) complete. **Environment**: production.
> **Input authority**: [`radar/CONTRACT.md`](../../tools/radar/CONTRACT.md)

Live market-intelligence feed, drawn from Inoreader through a 6-hour cache. This is the **only tool family with a live external dependency**, which makes it the only one where a non-Pass is often correct rather than a defect. A full pass proves the feed returns, that the tier structure holds, and that degradation is reported rather than hidden.

> **Read this before recording a verdict.** Three legitimate non-Pass outcomes exist here and none is a bug: a credential without radar scope (**Blocked**), an exhausted upstream budget with the circuit breaker open (**Blocked**), and a local stdio server with no Inoreader credentials bound (**Blocked**). Recording any of them as Fail misattributes a scope decision or an upstream condition to the server.

> **Not covered here**: `search_radar_offline` and `search_radar_cache` are registered on the local stdio transport only and cannot be reached over `https://mcp.globalstrategic.tech/mcp`. They are deliberately outside this suite's scope.

## Scope

| Capability            | Kind | Cases              | Contract                                     |
| --------------------- | ---- | ------------------ | -------------------------------------------- |
| `search_radar`        | tool | UAT-08.1, UAT-08.3 | [CONTRACT.md](../../tools/radar/CONTRACT.md) |
| `get_latest_insights` | tool | UAT-08.2           | [CONTRACT.md](../../tools/radar/CONTRACT.md) |

**Budget**: radar tools allow **5 requests/minute and 50/day** — an order of magnitude tighter than the general 60/1000, because they draw on a shared upstream quota. This whole document is three calls. Do not loop.

---

## UAT-08.1 — Unfiltered feed

**Goal**: Proves the live feed returns both tiers and reports its own freshness, so a reader can tell current intelligence from a cached snapshot.

**Input**

| Field      | Required | Value for this case | Constraint a tester must respect                                             |
| ---------- | -------- | ------------------- | ---------------------------------------------------------------------------- |
| `category` | no       | _omitted_           | One of `pe-ma`, `enterprise-tech`, `ai-automation`, `security`; omit for all |

**Steps**

1. Open a fresh thread.
2. Paste: _What is on the GST radar today?_
   Mode B: call `search_radar` with `{}`.

**Expected result**

- Items span two tiers: **FYI** (GST-annotated, carrying a highlight and a GST Take) and **Wire** (unannotated).
- Sorted by `publishedAt`, newest first.
- The Wire tier is capped at **30** items, with up to 3 slots reserved per category so no category is crowded out. FYI passes through uncapped but is already limited upstream to the 15 freshest annotated items.
- `returned` is the count after the cap and `totalMatched` before it. When they differ the feed was truncated, and `deeplink` opens the full view.
- `liveInfo` carries `degraded` plus **per-tier** freshness keys — `wireFetchedAt`, `wireCacheHit`, `fyiFetchedAt`, `fyiCacheHit`. The two tiers cache independently, so one flat `fetchedAt` would be ambiguous about which it described. (`get_latest_insights` returns the flat `fetchedAt` / `cacheHit`, because it serves a single tier.)
- Item `summary` is plain text — source HTML is stripped.

**Mode differences**

Mode A only meaningfully. A model summarising the feed is the actual use case; Mode B returns the raw item list and is for confirming the feed is alive.

**Failure modes**

| Symptom                                      | Means                                                      | Verdict                                                                 |
| -------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| `degraded: true` with items returned         | Budget circuit open; results come from cache, up to 6h old | **Pass**, noting `fetchedAt` — stale-but-real is the designed behaviour |
| `403` naming a radar scope                   | Credential provisioned without `--allow-radar`             | **Blocked**                                                             |
| `429`                                        | 5/min or 50/day exceeded                                   | **Blocked** — wait out `Retry-After`                                    |
| `error: "config-missing"`                    | Inoreader credentials not bound. Expected on local stdio   | **Blocked** on stdio; **Fail** on production                            |
| `error: "token-stale"`                       | The Inoreader OAuth token in Upstash expired               | **Blocked** — recovery is in [`DEPLOY.md`](../../operations/DEPLOY.md)  |
| `error: "service-unavailable"` with no items | Circuit open **and** nothing cached                        | **Blocked**                                                             |

The distinct `error` codes are the point: they let a tester separate "upstream is rate-limiting us" from "our token expired" from "transient network error" without guessing.

**Run log**

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                                                                                                 |
| ---------- | ------ | ----------- | ------- | ---- | ------- | ----------------------------------------------------------------------------------------------------- |
| 2026-08-11 | BL-119 | local stdio | 0.48.1  | B    | Blocked | `config-missing` — Inoreader credentials are not bound on a local stdio build; expected, not a defect |

---

## UAT-08.2 — The annotated tier only

**Goal**: Proves the FYI tier is separable and that its annotations are populated — the GST-authored layer is what distinguishes this from any news feed.

**Input**

| Field      | Required | Value for this case | Constraint a tester must respect |
| ---------- | -------- | ------------------- | -------------------------------- |
| `limit`    | no       | `3`                 | Integer 1–30, default 10         |
| `category` | no       | _omitted_           | Same four-value enum             |

**Steps**

1. Paste: _Give me the three most recent GST radar insights._
   Mode B: call `get_latest_insights` with `{ "limit": 3 }`.

**Expected result**

- **At most** 3 items, all FYI tier. `limit` is a ceiling, not a quota: the annotated tier is small and frequently holds fewer items than requested. Returning 2 for `limit: 3` is correct — cross-check the total against UAT-08.1's unfiltered feed.
- Each carries populated annotations — highlight text and a GST Take. An item without them is a Wire item that leaked into the FYI response.
- Equivalent to `search_radar` filtered to FYI; the two must not disagree about which items are annotated.

**Failure modes**

| Symptom                    | Means                              | Verdict                                 |
| -------------------------- | ---------------------------------- | --------------------------------------- |
| More than `limit` items    | Cap not applied                    | Fail                                    |
| Fewer than `limit` items   | Corpus holds fewer annotated items | **Not a defect** — `limit` is a ceiling |
| Un-annotated items present | Tier filter is leaking             | Fail — the annotation is the product    |
| Any error code             | Same table as UAT-08.1             | Per that table                          |

**Run log**

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                                                      |
| ---------- | ------ | ----------- | ------- | ---- | ------- | ---------------------------------------------------------- |
| 2026-08-11 | BL-119 | local stdio | 0.48.1  | B    | Blocked | `config-missing` — same local-stdio limitation as UAT-08.1 |

---

## UAT-08.3 — Category filter and the human-review caveat

**Goal**: Proves category filtering narrows the feed, and confirms the framing this content must carry when it reaches anyone outside GST.

**Input**

| Field      | Required | Value for this case | Constraint a tester must respect           |
| ---------- | -------- | ------------------- | ------------------------------------------ |
| `category` | no       | `"pe-ma"`           | Exactly one of the four; not a free string |

**Steps**

1. Paste: _What is the GST radar showing on PE and M&A?_
   Mode B: call `search_radar` with `{ "category": "pe-ma" }`.

**Expected result**

- Every returned item belongs to `pe-ma`; the set is a subset of UAT-08.1's.
- `deeplink` opens `/hub/radar` with the same category selected.
- An invalid category is a validation error, not an empty result — the enum is closed.

**The caveat this case exists to confirm**: radar output is aggregated third-party content with GST annotation. It is **not** verified reporting and **should not be auto-actioned**. Any surface that republishes it — a briefing, a memo, a client email — carries that framing. A tester who sees radar content presented as verified fact downstream should raise it, even though the tool itself behaved correctly.

**Failure modes**

| Symptom                              | Means                                     | Verdict                                             |
| ------------------------------------ | ----------------------------------------- | --------------------------------------------------- |
| Items outside the requested category | Filter not applied                        | Fail                                                |
| An invalid category returns `[]`     | Enum silently widened                     | Fail — a typo would look like "no news"             |
| Empty result for a valid category    | Genuinely nothing recent in that category | Not a defect — check `totalMatched` and `fetchedAt` |

**Run log**

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                                                     |
| ---------- | ------ | ----------- | ------- | ---- | ------- | --------------------------------------------------------- |
| 2026-08-11 | BL-119 | local stdio | 0.48.1  | B    | Blocked | `config-missing` — not reachable from a local stdio build |

---

_Last updated: 2026-08-11 (BL-119 — initial authoring. All three cases are **Blocked** pending a run with radar-scoped credentials against production; the local stdio path cannot exercise them by design.)_
