# UAT-10 — Resources

> **Prerequisite**: [`SETUP.md`](SETUP.md) complete. **Environment**: production.
> **Input authority**: [`resources/README.md`](../../resources/README.md)

The read-only `gst://` surface: reference documents, per-framework regulatory records, and radar snapshots, addressed by stable URI. A full pass proves that a URI returned by a tool actually resolves — the property that makes the tool results traceable rather than merely quotable.

> **Recorded runs are `local stdio`, not production.** Library and regulation resources are bundled at build time and should behave identically on the Worker; the radar family will not, because it reads a snapshot that only exists in Upstash on the deployment. A production run is outstanding.

## Scope

| Capability           | Kind     | Cases    | Count |
| -------------------- | -------- | -------- | ----- |
| `gst://library/`     | resource | UAT-10.2 | 4     |
| `gst://regulations/` | resource | UAT-10.3 | 123   |
| `gst://radar/`       | resource | UAT-10.4 | 6     |

---

## UAT-10.1 — Inventory

**Goal**: Proves the whole resource surface is advertised, and establishes the counts the later cases depend on.

**Steps**

1. List the connector's resources — in Claude Desktop, the connector's resource browser.
   Mode B: issue a `resources/list` request.

**Expected result**

- **133** resources total, in three families: **4** library, **123** regulations, **6** radar.
- The regulation count matches `totalFrameworks` from [UAT-02.1](UAT-02-regulatory-map.md). If those two disagree, one of the surfaces is stale.
- Two mime types only: `text/markdown` (library) and `application/json` (regulations, radar).
- Every entry carries a `name`, a `description`, and a `uri`.
- The six radar URIs are exactly: `gst://radar/fyi/latest`, `gst://radar/wire/latest`, and `gst://radar/wire/{pe-ma,enterprise-tech,ai-automation,security}`.

**Failure modes**

| Symptom                              | Means                               | Do                                                        |
| ------------------------------------ | ----------------------------------- | --------------------------------------------------------- |
| Count differs from 133               | Corpus changed                      | Not a defect — update this case and UAT-02.1 together     |
| Regulation count ≠ `totalFrameworks` | Tool and resource surfaces disagree | Fail — one of them is lying about the corpus              |
| No resources listed                  | Client may not support resources    | Blocked, not Fail — confirm the client's capability first |

**Run log**

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                                       |
| ---------- | ------ | ----------- | ------- | ---- | ------- | ------------------------------------------- |
| 2026-08-11 | BL-119 | local stdio | 0.48.1  | B    | Pass    | 133 = 4 library + 123 regulations + 6 radar |

---

## UAT-10.2 — Library documents

**Goal**: Proves the reference documents are readable in full, not just listed.

**Steps**

1. Read `gst://library/vdr-structure`.

**Expected result**

- Returns `text/markdown` with the full article body.
- The four library URIs are `business-architectures`, `vdr-structure`, `information-request-list`, and `irl-tool-input-mapping`.
- `gst://library/information-request-list` is a Library-surface **article**, not the source behind [UAT-07.1](UAT-07-irl-pipeline.md). The tools read `src/data/irl/information-request-list.md` (67 bullets); this article carries 65 and no skip-if directives. They are deliberately decoupled and expected to diverge — **do not cross-check one against the other**, which would produce a false failure.

**Run log**

| Date       | Tester | Env  | Version | Mode | Verdict | Notes                                                     |
| ---------- | ------ | ---- | ------- | ---- | ------- | --------------------------------------------------------- |
| 2026-08-11 | Cowork | prod | 0.48.1  | A    | Pass    | Full 15.9 KB article, 211 lines; folder taxonomy complete |

---

## UAT-10.3 — A regulation record, resolved from a tool result

**Goal**: Proves the traceability loop closes: a `uri` handed back by `search_regulations` resolves to the full record, so a claim in a brief can be checked against its source.

**Steps**

1. Run [UAT-02.2](UAT-02-regulatory-map.md) and take the `uri` from a match.
2. Read `gst://regulations/eu/gdpr`.

**Expected result**

- Returns `application/json` — the full framework record, richer than the search summary.
- For GDPR: `id` `eu-gdpr`, `effectiveDate` `2018-05-25`, `category` `data-privacy`, **7** `keyRequirements`, and a `penalties` string stating "Up to 4% of annual global turnover or EUR 20 million, whichever is greater."
- `regions` lists **27** ISO-3166 alpha-3 codes — the EU member states. This is the field the search summary does not carry, and the reason to resolve the URI rather than stop at the match.
- The URI pattern is `gst://regulations/<jurisdiction>/<framework-id>`, so any jurisdiction code from UAT-02.1 composes predictably.

**Failure modes**

| Symptom                                | Means                                    | Do                                                       |
| -------------------------------------- | ---------------------------------------- | -------------------------------------------------------- |
| A tool-returned `uri` does not resolve | The traceability loop is broken          | **Fail — escalate.** Every citation becomes unverifiable |
| Record thinner than the search summary | Resource and tool read different sources | Fail                                                     |

**Run log**

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                                                                   |
| ---------- | ------ | ----------- | ------- | ---- | ------- | ----------------------------------------------------------------------- |
| 2026-08-11 | BL-119 | local stdio | 0.48.1  | B    | Pass    | GDPR record: 27 regions, 7 keyRequirements, 4%/EUR 20M penalty          |
| 2026-08-11 | Cowork | prod        | 0.48.1  | A    | Pass    | First production run: all asserted fields verified from the served JSON |

---

## UAT-10.4 — Radar snapshots and the unpopulated state

**Goal**: Proves the radar resources either serve a snapshot or explain precisely why they cannot — the difference between a usable failure and a mystery.

**Steps**

1. Read `gst://radar/fyi/latest`.

**Expected result**

- **When populated**: `application/json` carrying the FYI snapshot, consistent with what [UAT-08.2](UAT-08-radar.md) returns. `itemCount` equals `items.length`, and each item carries `id, title, url, source, sourceUrl, category, publishedAt, annotatedAt, summary, annotation`.
- **`category` may be `null` on an annotated item.** It is a legitimate value, not a seeding gap: an FYI item can be annotated before it is categorised. Consumers that group by category are expected to exclude such items and say so rather than bucketing them arbitrarily — which is what `gst_radar_brief_today` does.
- **When unpopulated**: a structured error naming both remedies by path — `npm run radar:seed` for local stdio, and the 6-hourly Cron refresh for the Worker. It also states the non-obvious interaction: while the Inoreader budget circuit breaker is open, **no read refreshes the cache**, deliberately, so the unpopulated state can persist until the breaker closes. A tester who does not know that would keep retrying.
- Resource scope is separate from tool scope: `resource:radar:read` is withheld by default just as the radar tools are, and reads the same upstream-funded snapshot.

**Failure modes**

| Symptom                                 | Means                                          | Verdict                                                                   |
| --------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------- |
| Unpopulated snapshot on **local stdio** | Expected — no seed has been run                | **Blocked**, not Fail                                                     |
| Unpopulated snapshot on **production**  | Cron has not refreshed, or the breaker is open | **Blocked** — check `/health` `radarSnapshotAgeSeconds` before escalating |
| A bare error with no remedy             | The diagnostic text has regressed              | Fail — the message is the recovery procedure                              |
| `403` on the resource but tools work    | Scope granted for tools but not resources      | **Blocked** — a provisioning gap, not a defect                            |

**Run log**

| Date       | Tester | Env         | Version | Mode | Verdict | Notes                                                                                                |
| ---------- | ------ | ----------- | ------- | ---- | ------- | ---------------------------------------------------------------------------------------------------- |
| 2026-08-11 | BL-119 | local stdio | 0.48.1  | B    | Blocked | Unpopulated as expected; error named both remedies and the breaker caveat                            |
| 2026-08-11 | Cowork | prod        | 0.48.1  | A    | Pass    | **First observation of the populated branch** — 2 items, both annotated, `itemCount` self-consistent |

---

_Last updated: 2026-08-11 (BL-119 cycle 2 — 10.2–10.4 executed against production; 10.4 exercised the populated branch for the first time in any environment)_
