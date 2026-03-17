---
name: gst-ma-portfolio-card
description: Extract project metadata from a technical diligence report and insert a new record directly into src/data/ma-portfolio/projects.json.
---

Extract project metadata from the report at $ARGUMENTS and insert a new record into `src/data/ma-portfolio/projects.json`.

## Step 1 — Read the schema

Read `src/data/ma-portfolio/projects.json`. Extract all unique values currently used for:
- `theme`
- `growthStage`
- `engagementType`
- `engagementTypeTag`
- `engagementCategory`

You MUST use only existing values for these enumerated fields. Do not invent new ones. Also note the exact field structure of an existing record — this is your schema contract.

## Step 2 — Read the report

Read the PDF at `$ARGUMENTS`. Extract the following:

| Field | Extraction guidance |
|-------|---------------------|
| `id` | kebab-case slug from the code name (e.g. `"project-eagle"`) |
| `codeName` | Project code name from the report cover (e.g. `"Project Eagle"`) |
| `industry` | Derive from business description if not explicit |
| `theme` | Map to closest existing theme value from Step 1 |
| `summary` | ~30 words describing the technology/product. Do NOT use the real company or product name. |
| `arr` | Extract from the report (e.g. `"$74M"`). Search web for estimates if unavailable. Use `"N/A"` as last resort. |
| `arrNumeric` | Numeric USD value (e.g. `73838000`). Use `0` if N/A. |
| `currency` | `"USD"` unless stated otherwise |
| `growthStage` | Map to closest existing value from Step 1 based on company maturity signals |
| `year` | Year of the engagement / report publication |
| `technologies` | Core platform technologies and key integrations — concise string array |
| `engagementType` | Use existing value from Step 1 |
| `engagementTypeTag` | Matching tag from Step 1 |
| `engagementTypeDescription` | One-line description of the engagement type |
| `challenge` | 1–2 sentences: the core technology assessment challenge |
| `solution` | 1–2 sentences: key findings and conclusions |
| `engagementCategory` | Use existing value from Step 1 |

Company name — use the real name only if it appears on the report cover or is explicitly marked non-confidential. Otherwise omit from JSON (no `companyName` field in schema) and use `"N/A"` in the summary table only.

## Step 3 — Confirm before writing

Output the following and wait for explicit user confirmation before editing any file:

1. Markdown summary table:

   | Code Name | Company Name | Industry | Technology Summary | Year | Key Technologies | Theme | ARR | Growth Stage |

2. The complete JSON record you intend to insert.

Ask: **"Shall I insert this record into projects.json?"**

## Step 4 — Insert the record

On confirmation, read `src/data/ma-portfolio/projects.json`, append the new object to the array, and write the file back. Preserve all existing records exactly. Use 2-space indentation. Do not reformat or sort any existing entries.