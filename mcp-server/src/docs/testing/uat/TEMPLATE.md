# UAT case template

Copy this skeleton when adding a UAT document. Keep the section order — the point of the template is that a reader who has run one case can run any case without re-learning the layout.

Conventions (case IDs, verdicts, the two execution modes, the fresh-thread rule) are defined once in [`README.md` § Conventions](README.md#conventions) and are not restated per document.

---

## The skeleton

````markdown
# UAT-NN — <Family name>

> **Prerequisite**: [`SETUP.md`](SETUP.md) complete. **Environment**: production.
> **Input authority**: [`<family>/CONTRACT.md`](../../tools/<family>/CONTRACT.md)

<One paragraph: what this family does and what a full pass proves about it.>

## Scope

| Capability | Kind | Cases        | Contract                                        |
| ---------- | ---- | ------------ | ----------------------------------------------- |
| `tool_a`   | tool | UAT-NN.1, .3 | [CONTRACT.md](../../tools/<family>/CONTRACT.md) |
| `tool_b`   | tool | UAT-NN.2     | [CONTRACT.md](../../tools/<family>/CONTRACT.md) |

---

## UAT-NN.1 — <Case title>

**Goal**: <one sentence — what a Pass proves. Not "test tool_a", but what you learn from it.>

**Input**

| Field   | Required | Value for this case | Constraint a tester must respect       |
| ------- | -------- | ------------------- | -------------------------------------- |
| `field` | yes      | `"example"`         | <min length, format, cross-field rule> |

**Steps**

1. Open a fresh thread.
2. Paste: _<the exact prompt, verbatim, in italics>_
   Mode B: call `tool_a` with `{ "field": "example" }`.

**Expected call**

```json
{ "tool": "tool_a", "arguments": { "field": "example" } }
```

**Expected result**

- <A falsifiable observation. A number, a field that must be present, an exact string.>
- <Three to five of them. "Returns sensible results" is not one.>

**Mode differences** _(omit this section entirely when the modes agree)_

- <What Mode A sees that Mode B does not, or vice versa.>

**Failure modes**

| Symptom | Means               | Do                         |
| ------- | ------------------- | -------------------------- |
| <error> | <what it indicates> | <the action, or a verdict> |

**Run log**

| Date | Tester | Env | Version | Mode | Verdict | Notes |
| ---- | ------ | --- | ------- | ---- | ------- | ----- |
|      |        |     |         |      |         |       |
````

---

## Writing the sections

**Goal** — what a Pass _proves_, in one sentence. "Confirms the facet vocabulary is data-derived rather than hard-coded" is a goal; "tests `list_portfolio_facets`" is a restatement of the title.

**Input** — the arguments _this case_ sends, plus only the constraints a tester must respect to avoid a validation error: minimum lengths, string formats, cross-field rules, required-but-may-be-empty arrays. The full enum catalog belongs in the family's `CONTRACT.md`, which the Scope table links. Restating it here creates a second copy that nothing keeps in step.

**Steps** — the exact prompt to paste, verbatim and in italics so a reader can see where it starts and ends. Give the Mode B equivalent as a tool name plus a JSON argument object.

**Expected result** — **write this from an actual run.** Every observation must be falsifiable by looking at the response: an exact count, a field that must be present, a specific string, a computed value you can check by hand. If an expectation cannot fail, it cannot pass either.

**Mode differences** — only when the modes genuinely observe different things. Most cases omit it. When a case needs it, say what each mode sees rather than declaring one of them correct.

**Failure modes** — real errors, quoted from real failures, mapped to what they mean and what to do. Where the right response is "record Blocked and move on", say so; `SETUP.md` § 5 has the general rules, and this table carries the family-specific ones.

**Run log** — ships with an empty row. Fill one in per execution. Never delete rows; a Fail that was later fixed is the most useful history the document has. Fill `Env` honestly: a Pass recorded against `local stdio` is not a Pass in production, and labelling it as one is how a suite starts lying.

---

_Last updated: 2026-08-10 (BL-119 — initial authoring)_
