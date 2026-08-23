/**
 * Every tool's response has a size, and until BL-112 nothing measured one.
 *
 * ## Why this exists
 *
 * Two tools have shipped broken to real users while CI was green, and both were
 * found by a human in Claude Desktop rather than by this suite:
 *
 * - **BL-108** — tools returned counts with no rows. The payload was in
 *   `structuredContent` only; a `content`-reading client saw nothing. Three weeks
 *   under 1,977 passing tests.
 * - **BL-109** — `search_radar` returned **143,027 characters** and exceeded a real
 *   client's tool-result ceiling. The tool became unusable, not merely large.
 *
 * Every other test in this repo calls a handler and inspects the return value. None
 * of them asks the question that has actually broken twice: *can a client consume
 * this?* This file asks it, in the two dimensions that failed — the envelope
 * contract (BL-108) and the envelope size (BL-109).
 *
 * ## What a budget here is, and is not
 *
 * **It is not a client limit.** No client ceiling is documented anywhere in this
 * repo. Every reference to 143,027 is an observation *of a failure*, never a
 * threshold, and the true ceiling is unknown and strictly below it. A budget set at
 * that value would pass a response that still breaks the client.
 *
 * So these budgets are **policy**: today's measured value plus headroom, recorded so
 * that growth is visible and a regression is loud. When one trips, the question is
 * "should this tool be bounded?" — not "what number makes it green?". Raising a
 * budget is a decision, and it should be argued in the PR that raises it.
 *
 * ## Why per-item width for data-scaling tools
 *
 * An absolute byte budget on `search_portfolio` would redden after roughly a dozen
 * routine portfolio additions, on a data-only PR that never touched the server,
 * whose natural fix is "bump the number" — a ratchet that ratifies whatever
 * happened. That is exactly the coupling TEST_BEST_PRACTICES §6 warns about, and
 * why `protocol-era-worker.test.ts` refuses row counts.
 *
 * Per-item width sidesteps it rather than arguing around it: bytes ÷ items is flat
 * as the dataset grows and moves only when the *shape* changes. It is also the right
 * instrument on the evidence — BL-109's defect was **width, not count** (raw HTML
 * summaries), and the count bound alone would not have cleared the ceiling.
 *
 * ## Units
 *
 * Bytes are primary and are computed exactly as production computes the audit log's
 * `outputBytes` (`src/metrics/with-metrics.ts`), so a red test and an audit record
 * are directly comparable. Characters are recorded alongside because the 143,027
 * datum is in characters. The two are **never** compared to each other.
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import type {
  JSONRPCMessage,
  JSONRPCResponse,
  JSONRPCErrorResponse,
} from '@modelcontextprotocol/sdk/types.js';

// A single MockRedis satisfies the token store, the cache store and the circuit
// breaker, all of which instantiate Redis at module scope. Copied from
// `radar-live.test.ts` — the established shape for driving the live radar tools
// without touching Upstash or Inoreader.
const { redisGet, redisSet, redisDel, redisTtl, MockRedis } = vi.hoisted(() => {
  const redisGet = vi.fn();
  const redisSet = vi.fn();
  const redisDel = vi.fn();
  const redisTtl = vi.fn();
  class MockRedis {
    get = redisGet;
    set = redisSet;
    del = redisDel;
    ttl = redisTtl;
  }
  return { redisGet, redisSet, redisDel, redisTtl, MockRedis };
});
vi.mock('@upstash/redis', () => ({ Redis: MockRedis }));

import { createServer } from '../../src/server';
import { registerLocalOnlyTools } from '../../src/tools/_local-only';
import { createPairedTransports, type PairedHalf } from '../helpers/paired-transport';
import {
  parseToolResult,
  measureEnvelope,
  type CallToolResultPayload,
} from '../helpers/tool-envelope';
import * as snapshot from '../../src/content/radar-snapshot';
import { InMemoryIrlBodyCache } from '../../src/cache/irl-body-cache';
import { buildPartnerSuppliedAudit } from '../../src/schemas/diligence-audit';
import { buildPartnerSuppliedTechParAudit } from '../../src/schemas/techpar-audit';
import type { Env } from '../../src/worker';

// Fixtures lifted from each tool's own unit test, so a budget is measured against
// the same input the tool is otherwise proven with. The args table in
// `metrics-emission.test.ts` is deliberately minimal (it only needs the call to
// reach the metrics layer) and does not satisfy these schemas.
const TECHPAR_INPUTS = {
  arr: 25_000_000,
  stage: 'series_bc',
  mode: 'quick' as const,
  capexView: 'cash',
  growthRate: 30,
  exitMultiple: 12,
  infraHostingAnnual: 960_000,
  infraPersonnel: 600_000,
  rdOpEx: 4_000_000,
  rdCapEx: 500_000,
  engFTE: 25,
  engCost: 0,
  prodCost: 0,
  toolingCost: 0,
};

const TECH_DEBT_INPUTS = {
  teamSize: 8,
  salary: 150_000,
  maintenanceBurdenPct: 25,
  deployFrequency: 'Bi-weekly',
  incidents: 3,
  mttrHours: 4,
  remediationBudget: 500_000,
  arr: 10_000_000,
  remediationPct: 70,
  contextSwitchOn: false,
};

const ICG_ANSWERS: Record<string, number> = {
  q1_1: 2,
  q1_2: 1,
  q1_3: 0,
  q2_1: 3,
  q2_2: 2,
  q2_3: -1,
  q2_4: 1,
  q3_1: 2,
  q3_2: 2,
  q3_3: 1,
};

const DILIGENCE_DIMENSIONS = {
  transactionType: 'majority-stake' as const,
  productType: 'b2b-saas' as const,
  techArchetype: 'modern-cloud-native' as const,
  headcount: '51-200' as const,
  revenueRange: '5-25m' as const,
  growthStage: 'scaling' as const,
  companyAge: '5-10yr' as const,
  geographies: ['us', 'eu'] as ('us' | 'eu')[],
  businessModel: 'productized-platform' as const,
  scaleIntensity: 'moderate' as const,
  transformationState: 'actively-modernizing' as const,
  dataSensitivity: 'high' as const,
  operatingModel: 'product-aligned-teams' as const,
};
const VALID_DILIGENCE_PAYLOAD = {
  ...DILIGENCE_DIMENSIONS,
  _audit: buildPartnerSuppliedAudit(DILIGENCE_DIMENSIONS),
};

interface ListToolsResultPayload {
  tools: { name: string }[];
}

/**
 * Radar fixtures at REALISTIC FIELD WIDTHS, which is the whole point.
 *
 * The committed radar fixtures are 20 items with ~38-character summaries — two
 * orders of magnitude below the response that failed, and precisely why BL-109's
 * defect was invisible to every pre-existing test. A budget measured on those would
 * prove nothing.
 *
 * Widths are calibrated from the production-shaped figure recorded in
 * `src/docs/hub/RADAR.md` (78,737 chars over ~45 items post-fix, ~1,750 B/item), not
 * from a live capture: a capture would need a bearer credential and would commit
 * third-party article prose to the repo. Summaries carry raw HTML because that is
 * what Inoreader returns and what `projectItemForModel` strips at the tool boundary.
 */
function makeSnapshotItem(id: number, tier: 'fyi' | 'wire', category: string) {
  const title = `Regulatory and market developments in enterprise technology, item ${String(id).padStart(3, '0')} headline`;
  return {
    id: `item-${id}`,
    title,
    url: `https://example.com/publications/2026/enterprise-technology/regulatory-developments-item-${id}`,
    source: 'Enterprise Technology Review',
    publishedAt: new Date(Date.UTC(2026, 7, 1, 12, 0, 0) - id * 3_600_000).toISOString(),
    category,
    tier,
    summary: rawFeedHtml(id),
  };
}

/** ≥200 chars, the `prepare_irl_body` / `compose_dossier_envelope` floor. */
const SAMPLE_IRL = `# IRL — BL-112-TestCo

## 00 — Basics

- Annual recurring revenue: $45.2M
- Headcount: 187
- Year-over-year growth rate: Revenue 62% YoY; headcount 55% YoY

## 02 — Software Architecture

- Engineering FTE count: 58 total
- Stack: TypeScript Node 22, Python 3.12, Aurora Postgres 15
`;

const baseEnvelopeInput = (): Record<string, unknown> => ({
  promptName: 'gst_irl_ingestion',
  promptVersion: '0.22.0',
  modelVersion: 'claude-opus-4-8',
  mode: 'full',
  // BL-122 - `debug` deliberately: this budget bounds the LARGEST envelope
  // shape, and the recorded byte measurements were taken with all three
  // markdown blocks present. Do NOT lower minEnvelopeBytes to accommodate a
  // smaller `standard` response - hollowing the envelope is precisely the
  // mutation this floor exists to catch.
  auditLevel: 'debug',
  transactionContext: 'value-creation',
  irlSource: 'partner-paste-verbatim',
  fillRatio: { percent: 92, substantiveCells: 46, totalCells: 50, status: 'ok' },
  gatesPassed: ['generate_diligence_agenda', 'compute_techpar'],
  gatesElided: [{ tool: 'search_radar', reason: 'credentials not bound', irlSection: '01' }],
  conditionalTriggersFired: ['EU_AI_ACT'],
  defaultFiredFrameworks: [],
  forceToolsApplied: [],
  claims: [
    { claim: 'ARR ~$45.2M', citation: 'Section 00 — Annual recurring revenue: $45.2M', tier: '1' },
  ],
  gaps: [],
});

/**
 * The same realistic widths in Inoreader's *raw* shape, for the LIVE tool.
 *
 * `search_radar` is the tool that actually failed, so measuring it against an empty
 * feed would be the vacuous-guard problem this whole initiative is about. It reaches
 * Inoreader through `fetch`, so the corpus has to arrive as upstream JSON —
 * `summary.content` carrying raw HTML, which is exactly what BL-109 found was being
 * shipped untouched to models.
 */
const INOREADER_CATEGORIES = [
  'GST-PE-MA',
  'GST-Enterprise-Tech',
  'GST-AI-Automation',
  'GST-Security',
] as const;

/**
 * Feed HTML at realistic **markup density**, not just realistic prose length.
 *
 * The first version of this fixture wrapped clean prose in a single `<p>` and one
 * tracking pixel. Reverting BL-109's `stripHtml` against it changed per-item width
 * by a few percent and the guard stayed green — a fixture too small to see the bug,
 * which is the exact failure BL-109's own test header calls out about the fixtures
 * that preceded it. Being wrong about this in the guard built to stop it is the
 * reason this comment is long.
 *
 * Real syndicated feed bodies carry wrapper divs, inline styles, tracking params,
 * share widgets and multiple anchors — markup that is a large fraction of the bytes
 * and *none* of the meaning. Stripping it is BL-109's larger lever (15.7 of the 41.4
 * points); the fixture has to make that lever visible or the budget measures nothing.
 */
function rawFeedHtml(id: number): string {
  const sentence =
    'Analysts noted a material shift in procurement patterns across the segment during the reporting period, with several vendors revising guidance.';
  const para = (n: number) =>
    `<p class="article-body__paragraph" style="margin:0 0 1.2em 0;line-height:1.6">` +
    `${sentence} <a href="https://example.com/tags/enterprise-technology?utm_source=feed&utm_medium=rss&utm_campaign=syndication&ref=item-${id}-${n}" rel="noopener noreferrer nofollow" target="_blank">Related coverage</a> ` +
    `and <em class="article-body__emphasis">additional background</em> on the transaction, including the parties involved and the stated rationale.</p>`;
  return (
    `<div class="article-body" data-article-id="${id}" data-syndication="rss">` +
    [1, 2, 3].map(para).join('') +
    `<div class="article-share" style="display:flex;gap:8px"><a href="https://twitter.com/intent/tweet?url=https%3A%2F%2Fexample.com%2Fitem-${id}">Share</a>` +
    `<a href="https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fexample.com%2Fitem-${id}">Share</a></div>` +
    `<img src="https://tracking.example.com/pixel.gif?id=${id}&utm_source=feed&utm_medium=rss" width="1" height="1" style="display:none" alt=""/>` +
    `</div>`
  );
}

function makeInoreaderItem(id: number, category: string, hasAnnotation = false) {
  const publishedTs = Math.floor(Date.UTC(2026, 7, 1, 12, 0, 0) / 1000) - id * 3600;
  const body = rawFeedHtml(id);
  return {
    id: `tag:google.com,2005:reader/item/${String(id).padStart(16, '0')}`,
    title: `Regulatory and market developments in enterprise technology, item ${String(id).padStart(3, '0')} headline`,
    published: publishedTs,
    origin: {
      streamId: 'feed/https://example.com/feed',
      title: 'Enterprise Technology Review',
      htmlUrl: 'https://example.com',
    },
    canonical: [
      {
        href: `https://example.com/publications/2026/enterprise-technology/regulatory-developments-item-${id}`,
      },
    ],
    categories: [`user/-/label/${category}`],
    summary: {
      content: `<p>${body}</p><img src="https://tracking.example.com/pixel.gif?id=${id}" width="1" height="1"/>`,
    },
    annotations: hasAnnotation
      ? [{ id: 1, start: 0, end: 10, added_on: publishedTs, text: 'highlight', note: 'GST take' }]
      : undefined,
  };
}

const CATEGORIES = ['pe-ma', 'enterprise-tech', 'ai-automation', 'security'];
const makeTier = (tier: 'fyi' | 'wire', count: number, offset = 0) => ({
  tier,
  lastSeededAt: '2026-08-01T12:00:00.000Z',
  items: Array.from({ length: count }, (_, i) =>
    makeSnapshotItem(offset + i, tier, CATEGORIES[i % CATEGORIES.length])
  ),
});

/**
 * How a tool's size should be judged.
 *
 * `perItem` — the response carries a list whose length tracks a dataset or a
 * caller-supplied `limit`. Budget the width of one item; the count is not this
 * test's business (that is the capability mirror's job, ADR-0005).
 *
 * `absolute` — the response has a fixed shape. Budget the whole envelope.
 */
type BudgetKind =
  | {
      kind: 'perItem';
      itemsKey: string;
      /**
       * The item count this budget was measured at — asserted, not assumed.
       *
       * `count > 0` rules out an empty list but pins nothing about SCALE. Changing
       * `search_regulations`' args from `{ limit: 120 }` to `{ limit: 20 }` left the
       * whole suite green while the measured exposure fell from 355,728 B to
       * 61,261 B, silently falsifying the note that says "measured at the SCHEMA
       * MAX". Prose cannot defend an invariant a one-token edit can break, so the
       * scale is encoded here.
       */
      minItems: number;
      /**
       * The per-item width this budget was measured at — a FLOOR, asserted beside
       * the ceiling.
       *
       * `minItems` pins how many items are measured; nothing pinned how wide they
       * are. Collapsing `rawFeedHtml` to a one-line summary kept every count at
       * 45/45/45/15 and the suite at 18/18 green while 60-70% of the measured
       * exposure vanished — and, stacked with the `stripHtml` revert, left BL-109's
       * defect passing too. That is worse than a low number: it disarms the
       * mutation proof the `search_radar` note cites as its reason to be trusted.
       *
       * Width is the axis this file calls primary ("BL-109's defect was width, not
       * count"), so it is the axis that must not be defended by prose alone. The
       * band is two-sided: the ceiling catches a regression, the floor catches the
       * fixture being quietly hollowed out beneath it.
       */
      minBytesPerItem: number;
      maxBytesPerItem: number;
      maxEnvelopeBytes: number;
    }
  | {
      kind: 'absolute';
      /**
       * The envelope size this budget was measured at — the same floor the
       * `perItem` branch carries, for the same reason, found the same way.
       *
       * "Fixed shape" was the justification for having no floor here, and it is
       * wrong for two of these tools by their own notes: `generate_diligence_agenda`
       * "scales with dimension combinatorics" and `compose_dossier_envelope` "scales
       * with the composed dossier, i.e. with input". Editing the dimension enums in
       * the diligence fixture drops it 32,540 → 26,240 B (−19%) and hollowing the
       * envelope fixture drops it 4,454 → 4,010 B — both silently green before this.
       *
       * Lower stakes than the per-item floors (it degrades an alarm rather than
       * disarming a mutation proof), but this is the fourth time the same shape has
       * been found in this file, and "the other branch is fine" is what was said
       * each of the previous three times.
       */
      minEnvelopeBytes: number;
      maxEnvelopeBytes: number;
    };

interface ToolBudget {
  /** Arguments for the call. Data-scaling tools are called at their worst realistic input. */
  args: Record<string, unknown>;
  /**
   * For tools whose input depends on a prior call. `compose_dossier_envelope` is the
   * only one: `prepare_irl_body` seeds the body cache and returns the 16-hex
   * `irlBodyHash` that compose re-hydrates from (ADR-0002). Driving that through the
   * protocol rather than seeding the cache directly means the budget measures the
   * real path, and exercises both tools.
   */
  argsFrom?: (
    call: (tool: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>
  ) => Promise<Record<string, unknown>>;
  budget: BudgetKind;
  /** Payload keys legitimately absent from the text channel (`toolOk`'s `textOmit`). */
  textOmit?: readonly string[];
  /** Why this number, and what it was measured against. Every entry must justify itself. */
  note: string;
}

/**
 * Budgets, measured 2026-08-06 against the real data files at `@gst/mcp-server`
 * 0.47.0. Headroom differs **by axis**, and stating it that way is the second
 * correction this header has needed — the first draft claimed "~25%" while
 * shipping budgets 8× to 44× the measurement, and the replacement claimed a flat
 * 25-35% band that the data contradicted in seven places while naming two
 * exceptions that were the wrong two. A file arguing that prose cannot defend an
 * invariant should not open with prose the numbers disagree with.
 *
 * - **Per-item widths run +21-35% over measured**, tightly and deliberately: this
 *   is the axis BL-109 actually failed on, and a two-sided band (floor and
 *   ceiling) is what keeps it honest.
 * - **Envelope ceilings are coarser** — a growth alarm, not a contract. On small
 *   fixed-shape responses they cannot be held to any tight band without flaking on
 *   an ordinary edit: a 222 B response cannot carry a 30% ceiling meaningfully.
 *   `search_portfolio`'s is deliberately loose because the tool is unbounded by
 *   ADR-0005, and `search_regulations`' records a size already flagged as
 *   suspicious rather than endorsed.
 *
 * Three of these have recorded baselines in ADR-0011 (`search_portfolio`,
 * `compose_dossier_envelope`, `list_portfolio_facets`). The rest are fresh
 * measurements taken here — labelled as such, because a number nobody has
 * independently checked should not be mistaken for a ratified one.
 */
const BUDGETS: Record<string, ToolBudget> = {
  // --- data-scaling: these are the ones that can break a client ---
  search_portfolio: {
    args: {},
    budget: {
      kind: 'perItem',
      itemsKey: 'matches',
      minItems: 65,
      minBytesPerItem: 1800,
      maxBytesPerItem: 2400,
      maxEnvelopeBytes: 170_000,
    },
    note: 'ADR-0011 baseline: 127,599 B over 65 projects = ~1,963 B/entry. Unbounded by ADR-0005 (the page renders every project), so the envelope ceiling is a growth alarm, not a contract.',
  },
  search_regulations: {
    args: { limit: 120 },
    budget: {
      kind: 'perItem',
      itemsKey: 'matches',
      minItems: 120,
      minBytesPerItem: 2700,
      maxBytesPerItem: 3600,
      maxEnvelopeBytes: 420_000,
    },
    note: 'Measured at the SCHEMA MAX, not the default — the exposure is invisible at limit 20 (~61,300 B). At 120 the envelope is ~355,700 B, i.e. ~2.49x the 143,027-char response that already broke a client. This budget records that reality flagged as suspicious; it does NOT ratify it. Bounding the tool is open — see ADR-0011 § Note 2026-08-06 and BL-113 — the capability mirror cannot supply a number (the page renders one region, largest = 10 frameworks, below the default of 20).',
  },
  search_radar: {
    args: {},
    budget: {
      kind: 'perItem',
      itemsKey: 'matches',
      minItems: 45,
      minBytesPerItem: 2300,
      maxBytesPerItem: 3200,
      maxEnvelopeBytes: 150_000,
    },
    note: 'Measured 114,815 B / 45 items / 2,551 B per item on a 15-FYI + 46-wire corpus at production widths and production MARKUP DENSITY. Reverting the strip takes it to 258,505 B — verified, and the reason this budget is trusted. The tool BL-109 fixed. Bounded to <=45 items (MAX_WIRE 30 + FYI 15) with summaries HTML-stripped. Per-item width is the instrument that would have caught the original defect: raw HTML summaries were width, not count.',
  },
  search_radar_offline: {
    args: {},
    budget: {
      kind: 'perItem',
      itemsKey: 'matches',
      minItems: 45,
      minBytesPerItem: 2100,
      maxBytesPerItem: 2900,
      maxEnvelopeBytes: 150_000,
    },
    note: 'Measured 2,321 B per item. Same bound and same projection as search_radar, reading a frozen snapshot. stdio-only.',
  },
  search_radar_cache: {
    args: {},
    budget: {
      kind: 'perItem',
      itemsKey: 'matches',
      minItems: 45,
      minBytesPerItem: 2100,
      maxBytesPerItem: 2900,
      maxEnvelopeBytes: 150_000,
    },
    note: 'Deprecated alias that tail-calls the offline handler. Budgeted because it is REGISTERED — the coverage rule keys on what tools/list returns, not on what ought to exist. Its removal (documented as "removed in 0.2.0", still present at 0.47.0) is flagged in BL-113, not absorbed.',
  },
  get_latest_insights: {
    args: { limit: 30 },
    budget: {
      kind: 'perItem',
      itemsKey: 'items',
      minItems: 15,
      minBytesPerItem: 2400,
      maxBytesPerItem: 3400,
      maxEnvelopeBytes: 60_000,
    },
    note: 'Measured 2,681 B per item — WIDER than the wire tiers because FYI items carry the GST annotation (gstTake) that wire items do not. A 2,200 budget copied from search_radar tripped on exactly that, which is the guard distinguishing shape from noise. Called at schema max 30, though the FYI tier caps upstream at FYI_MAX_COUNT=15 — so the max-input rule is inert here. Recorded so a future lift of that cap is measured rather than assumed.',
  },
  list_irl_requests: {
    args: {},
    budget: {
      kind: 'perItem',
      itemsKey: 'requests',
      minItems: 67,
      minBytesPerItem: 300,
      maxBytesPerItem: 450,
      maxEnvelopeBytes: 30_000,
    },
    note: 'Scales with an authored document (src/data/irl/information-request-list.md, ~6.4 KB), unprojected. A watch rather than an exposure, but nothing else watches it.',
  },
  // --- fixed shape: budget the whole envelope ---
  list_portfolio_facets: {
    args: {},
    budget: { kind: 'absolute', minEnvelopeBytes: 1000, maxEnvelopeBytes: 1500 },
    note: 'ADR-0011 baseline: 597 B payload -> 1,105 B envelope.',
  },
  list_regulation_facets: {
    args: {},
    budget: { kind: 'absolute', minEnvelopeBytes: 1300, maxEnvelopeBytes: 2000 },
    note: 'Facet lists over 123 frameworks; grows with distinct jurisdictions, not with framework bodies.',
  },
  compute_techpar: {
    args: { ...TECHPAR_INPUTS, _audit: buildPartnerSuppliedTechParAudit('quick') },
    budget: { kind: 'absolute', minEnvelopeBytes: 4000, maxEnvelopeBytes: 6000 },
    note: 'Fixed-shape calculator. Fixture from tests/unit/techpar.test.ts; the metrics-emission args table is minimal and does not satisfy the schema.',
  },
  estimate_tech_debt_cost: {
    args: {
      ...TECH_DEBT_INPUTS,
      _audit: { mttrSource: 'irl-stated', incidentsSource: 'irl-stated' },
    },
    budget: { kind: 'absolute', minEnvelopeBytes: 1300, maxEnvelopeBytes: 2000 },
    note: 'Fixed-shape calculator. Fixture from tests/unit/tech-debt.test.ts.',
  },
  assess_infrastructure_cost_governance: {
    args: { answers: ICG_ANSWERS, companyStage: 'series-bc' },
    budget: { kind: 'absolute', minEnvelopeBytes: 16000, maxEnvelopeBytes: 24_000 },
    note: 'Output scales with the authored question bank, not with caller input. Fixture from tests/unit/icg.test.ts.',
  },
  generate_diligence_agenda: {
    args: VALID_DILIGENCE_PAYLOAD,
    budget: { kind: 'absolute', minEnvelopeBytes: 29000, maxEnvelopeBytes: 43_000 },
    note: 'Topic count scales with dimension combinatorics, bounded by the authored question bank. Same payload the protocol round-trip uses.',
  },
  generate_information_request_list_xlsx: {
    args: { articleUri: 'gst://library/vdr-structure' },
    textOmit: ['base64'],
    budget: { kind: 'absolute', minEnvelopeBytes: 16500, maxEnvelopeBytes: 25_000 },
    note: 'The ONLY channel-asymmetric tool: its ~17 KB base64 workbook rides in structuredContent but is omitted from the text channel via toolOk textOmit, so the envelope is ~payload + 17 KB rather than ~2x. That asymmetry is why the shared helper needed a real exemption parameter instead of a comment saying this tool is not routed through it.',
  },
  fill_information_request_list_xlsx: {
    args: {
      fills: [
        {
          ref: '0-01',
          fileLocation: 'VDR/00/entity-chart.pdf, page 1',
          comments: 'Delaware C-corp, single-entity structure.',
        },
        {
          ref: '1-01',
          fileLocation: '[inferred from product-overview.pdf + demo session]',
          comments: 'Single SaaS surface, multi-tenant, browser-only.',
        },
      ],
    },
    textOmit: ['base64'],
    budget: { kind: 'absolute', minEnvelopeBytes: 16500, maxEnvelopeBytes: 26_000 },
    note: 'BL-140: the SECOND channel-asymmetric tool, by design — same textOmit rationale as its generator sibling (the base64 workbook rides in structuredContent only). Envelope ≈ sibling + the fills written into D/E plus filledRefs. Bounds budget this two-fill fixture; the caps-saturated worst case measured 25,043 bytes on 2026-08-23 (every row × max-length cells) and is pinned by the "caps-saturated envelope" test in tests/unit/tools/fill-information-request-list-xlsx.test.ts — cell text DEFLATEs inside the workbook, so the envelope grows far slower than the raw ~460 KB of cell text would suggest and stays far under the BL-109 client-ceiling observation.',
  },
  prepare_irl_body: {
    args: { filledIrl: SAMPLE_IRL },
    budget: { kind: 'absolute', minEnvelopeBytes: 200, maxEnvelopeBytes: 400 },
    note: 'Returns a 16-hex hash and a fill-ratio precheck, not the body — so the response is fixed-shape even though the INPUT scales. Input-size-driven tools budget the chosen fixture, and this fixture is deliberately small: the tool exists so the body does NOT travel again.',
  },
  validate_irl_provenance: {
    args: {
      filledIrl: SAMPLE_IRL,
      citations: [
        { path: 'a', citation: 'Section 00 — Annual recurring revenue: $45.2M' },
        { path: 'b', citation: 'Section 02 — Engineering FTE count: 58 total' },
      ],
    },
    budget: {
      kind: 'perItem',
      itemsKey: 'verdicts',
      minItems: 2,
      minBytesPerItem: 410,
      maxBytesPerItem: 620,
      maxEnvelopeBytes: 1400,
    },
    note: 'Scales with CALLER-supplied citations — it echoes a verdict per citation, so a caller passing 500 gets 500 back. Per-item width is the right unit precisely because the count is the caller’s choice, not a dataset property.',
  },
  compose_dossier_envelope: {
    args: {},
    argsFrom: async (call) => {
      // prepare_irl_body seeds the body cache and returns the hash compose binds to.
      const prepared = await call('prepare_irl_body', { filledIrl: SAMPLE_IRL });
      return { ...baseEnvelopeInput(), irlBodyHash: prepared.irlBodyHash };
    },
    budget: { kind: 'absolute', minEnvelopeBytes: 4200, maxEnvelopeBytes: 6000 },
    note: 'Measured 5,680 B on this fixture (was 4,454 B before BL-130 added two emitInstructions sentences, which ship twice - structuredContent plus the text mirror; the first draft of that prose hit 6,202 B and this budget caught it). The floor is 4,200 rather than 4,000 because 4,000 did NOT catch the hollowing this budget cites: emptying the gates arrays lands at 4,030 B, which passed. A floor that misses the mutation its own note claims it catches is the defect this file is about. ADR-0011 records 16,581 -> 33,290 B on a realistic dossier — 5.5x this budget, so do NOT read that baseline as passing: the fixture here is far smaller than a real composition. Scales with the composed dossier, i.e. with input. This budget is a TEST-ONLY regression signal and must never be read as a runtime output cap — nothing in the handler enforces it.',
  },
};

describe('tool response budgets (BL-112)', () => {
  let client: PairedHalf;
  let nextId = 1;
  const fetchSpy = vi.fn();

  /**
   * Every measurement taken this run, printed once at the end.
   *
   * BL-109 measured `134,370 -> 78,737` on a corpus that was never committed, so the
   * numbers could not be reproduced and the follow-up question could not be answered
   * without redoing the work. Printing the table means the current figures are always
   * one command away, and can be pasted into a commit message or a doc without
   * anyone re-deriving them.
   *
   * **It does not print under a plain `npm run test:mcp`** — this vitest setup
   * swallows `console` from both a test body and `afterAll`. Run:
   *
   *   npx vitest run tests/integration/tool-response-budget.test.ts --disableConsoleIntercept
   *
   * Stated because "always one test run away" was the claim, and it was wrong
   * without the flag.
   */
  const measurements: {
    tool: string;
    bytes: number;
    chars: number;
    payload: number;
    ratio: number;
    items?: number;
    perItem?: number;
  }[] = [];

  const baseEnv: Env = {
    MCP_KEY_RP: 'test-mcp-key-rp',
    INOREADER_APP_ID: 'test-app-id',
    INOREADER_APP_KEY: 'test-app-key',
    INOREADER_ACCESS_TOKEN: 'env-access-token',
    UPSTASH_MCP_REST_URL: 'https://mcp-db.upstash.io',
    UPSTASH_MCP_REST_TOKEN: 'test-mcp-standard',
  };

  /**
   * Narrow a JSON-RPC reply to its result, mirroring `protocol-roundtrip.test.ts`.
   * A bare `as JSONRPCResponse` cast does not typecheck: the SDK union does not
   * expose `result` without narrowing the error branch away first.
   */
  function unwrap(msg: JSONRPCResponse | JSONRPCErrorResponse): unknown {
    if ('error' in msg) {
      throw new Error(`JSON-RPC error: ${msg.error.message}`);
    }
    return msg.result;
  }

  function rpc(method: string, params: unknown): Promise<JSONRPCResponse | JSONRPCErrorResponse> {
    const id = nextId++;
    return new Promise((resolve) => {
      const onMessage = (msg: JSONRPCMessage) => {
        if ('id' in msg && msg.id === id) {
          client.onmessage = undefined;
          resolve(msg as JSONRPCResponse | JSONRPCErrorResponse);
        }
      };
      client.onmessage = onMessage;
      void client.send({ jsonrpc: '2.0', id, method, params } as JSONRPCMessage);
    });
  }

  beforeEach(async () => {
    nextId = 1;
    redisGet.mockReset();
    redisSet.mockReset();
    redisDel.mockReset();
    redisTtl.mockReset();
    fetchSpy.mockReset();
    vi.stubGlobal('fetch', fetchSpy);

    // Circuit closed, no cached snapshot, OAuth token present. Inoreader is never
    // reached over the network — `fetchSpy` below serves a production-shaped corpus
    // by URL, so the live radar tools resolve a real 15-FYI + 46-wire feed.
    //
    // This comment previously said the stub "returns an empty stream for every call,
    // so the live radar tools resolve to an empty-but-successful tier" — true of an
    // earlier draft, false of the code beneath it, and a description of exactly the
    // configuration that makes the per-item budgets measure nothing.
    redisGet.mockImplementation(async (key: string) =>
      key === 'mcp:inoreader:access_token' ? 'upstash-access-token' : null
    );
    redisTtl.mockResolvedValue(-2);
    redisSet.mockResolvedValue('OK');
    // Route Inoreader by URL, as `radar-live.test.ts` does — 15 annotated (FYI) plus
    // 46 wire across four folders, the same 15/46 shape BL-109 measured. A fresh
    // Response per call: a body can only be read once, and reusing one object yields
    // "Body has already been read" on the second fetch.
    const json = (payload: unknown) =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    const fyiItems = Array.from({ length: 15 }, (_, i) =>
      makeInoreaderItem(i, INOREADER_CATEGORIES[i % 4], true)
    );
    const wireFolders = INOREADER_CATEGORIES.map((folder, f) => ({
      folder,
      items: Array.from({ length: f === 0 ? 13 : 11 }, (_, i) =>
        makeInoreaderItem(100 + f * 20 + i, folder)
      ),
    }));
    fetchSpy.mockImplementation(async (url: string | URL) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('annotated')) {
        return json({ direction: 'ltr', id: 'annotated', updated: 0, items: fyiItems });
      }
      if (u.includes('tag/list')) {
        return json({ tags: wireFolders.map((f) => ({ id: `user/-/label/${f.folder}` })) });
      }
      for (const f of wireFolders) {
        if (u.includes(encodeURIComponent(`user/-/label/${f.folder}`))) {
          return json({ direction: 'ltr', id: f.folder, updated: 0, items: f.items });
        }
      }
      return json({ direction: 'ltr', id: 'empty', updated: 0, items: [] });
    });

    // The stdio-only radar tools read `.cache/inoreader/` through `node:fs`, which
    // does not exist in CI. Spy on the reader module rather than `vi.mock`-ing the
    // path, matching `radar-offline-handler.test.ts` — that file explains why: a
    // module-level mock races the parallel suites that share the path.
    vi.spyOn(snapshot, 'readFyiSnapshot').mockReturnValue(
      makeTier('fyi', 15) as unknown as ReturnType<typeof snapshot.readFyiSnapshot>
    );
    vi.spyOn(snapshot, 'readWireSnapshot').mockReturnValue(
      makeTier('wire', 46, 100) as unknown as ReturnType<typeof snapshot.readWireSnapshot>
    );

    // `compose_dossier_envelope` re-hydrates the IRL body from this cache by hash
    // (ADR-0002); without it the handler cannot resolve the body and errors.
    const server = createServer(baseEnv, { irlBodyCache: new InMemoryIrlBodyCache() });
    registerLocalOnlyTools(server); // mirror src/index.ts — the stdio surface is the only one with all 17
    const pair = createPairedTransports();
    client = pair.client;
    await server.connect(pair.server);

    const init = await rpc('initialize', {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'tool-response-budget', version: '0.0.0' },
    });
    if ('error' in init) throw new Error(`initialize failed: ${init.error.message}`);
    void client.send({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    } as JSONRPCMessage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    if (measurements.length === 0) return;
    const rows = measurements
      .sort((a, b) => b.bytes - a.bytes)
      .map(
        (r) =>
          `  ${r.tool.padEnd(38)} ${r.bytes.toLocaleString().padStart(9)} B  ${r.chars.toLocaleString().padStart(9)} ch  ${r.ratio.toFixed(2)}x` +
          (r.perItem
            ? `  ${Math.round(r.perItem).toLocaleString().padStart(6)} B/item x${r.items}`
            : '')
      )
      .join('\n');
    console.log(
      `\ntool response sizes @ ${new Date().toISOString().slice(0, 10)} (envelope = both channels + framing)\n${rows}\n` +
        `  reference: 143,027 chars is the search_radar response that exceeded a real client's ceiling (BL-109) —\n` +
        `  an observation of a failure, not a threshold. The true ceiling is unknown and strictly below it.\n`
    );
  });

  /**
   * The coverage rule: every REGISTERED tool must have a budget entry.
   *
   * Enumerated from a live `tools/list` rather than by reading `src/tools/*.ts`,
   * because 13 modules register 17 tools and the name literal sits on the line
   * after `registerTool(` opens — a source scan keyed by filename would silently
   * miss the second tool in a two-tool module, which is the drift this rule exists
   * to prevent. It is enumerated against the **stdio** surface deliberately: the
   * Worker registers 15, and the two stdio-only radar tools would escape.
   *
   * `protocol-roundtrip.test.ts` remains authoritative for *which tools exist*;
   * this is authoritative for *which tools have a size decision*.
   */
  it('every registered tool has a budget — a new tool cannot ship without a size decision', async () => {
    const res = await rpc('tools/list', {});
    expect('error' in res).toBe(false);
    const listed = unwrap(res) as unknown as ListToolsResultPayload;
    const names = listed.tools.map((t) => t.name).sort();

    expect(names.length).toBeGreaterThan(10);

    const missing = names.filter((n) => !(n in BUDGETS));
    const stale = Object.keys(BUDGETS).filter((n) => !names.includes(n));

    expect(
      missing,
      'these tools are registered with no response-size budget — add an entry to BUDGETS with a measured number and a note justifying it'
    ).toEqual([]);
    expect(stale, 'these budgets name tools that are no longer registered').toEqual([]);
  });

  for (const [tool, spec] of Object.entries(BUDGETS)) {
    it(`${tool} — envelope contract holds and size is within budget`, async () => {
      const callTool = async (name: string, args: Record<string, unknown>) => {
        const r = await rpc('tools/call', { name, arguments: args });
        if ('error' in r) throw new Error(`${name} (setup) failed: ${r.error.message}`);
        const payload = unwrap(r) as unknown as CallToolResultPayload;
        if (payload.isError) {
          throw new Error(`${name} (setup) errored: ${payload.content?.[0]?.text ?? ''}`);
        }
        return (payload.structuredContent ?? {}) as Record<string, unknown>;
      };
      const args = spec.argsFrom ? await spec.argsFrom(callTool) : spec.args;

      const res = await rpc('tools/call', { name: tool, arguments: args });
      expect('error' in res, `${tool} returned a JSON-RPC error`).toBe(false);
      const result = unwrap(res) as unknown as CallToolResultPayload;
      expect(
        result.isError,
        `${tool} returned an error envelope: ${result.content?.[0]?.text ?? '(no caption)'}`
      ).not.toBe(true);

      // BL-108: both channels, and they agree. Asserted on every tool rather than
      // the four the round-trip suite happens to exercise.
      const payload = parseToolResult<Record<string, unknown>>(result, {
        textOmit: spec.textOmit,
      });

      const m = measureEnvelope(result);
      const detail = `${tool}: envelope ${m.envelopeBytes.toLocaleString()} B (${m.envelopeChars.toLocaleString()} chars), payload ${m.payloadBytes.toLocaleString()} B, ratio ${m.ratio.toFixed(2)}x — ${spec.note}`;
      const itemCount =
        spec.budget.kind === 'perItem' && Array.isArray(payload[spec.budget.itemsKey])
          ? (payload[spec.budget.itemsKey] as unknown[]).length
          : undefined;
      measurements.push({
        tool,
        bytes: m.envelopeBytes,
        chars: m.envelopeChars,
        payload: m.payloadBytes,
        ratio: m.ratio,
        items: itemCount,
        perItem: itemCount ? m.envelopeBytes / itemCount : undefined,
      });

      expect(m.envelopeBytes, detail).toBeLessThanOrEqual(spec.budget.maxEnvelopeBytes);

      if (spec.budget.kind === 'absolute') {
        expect(
          m.envelopeBytes,
          `${detail} — BELOW the ${spec.budget.minEnvelopeBytes} B floor this budget was measured at. The fixture got smaller, so the ceiling above is measuring less than it claims. Re-measure and move the floor deliberately — do not lower it to go green.`
        ).toBeGreaterThanOrEqual(spec.budget.minEnvelopeBytes);
      }

      if (spec.budget.kind === 'perItem') {
        const items = payload[spec.budget.itemsKey];
        expect(
          Array.isArray(items),
          `${tool}: budget names items key '${spec.budget.itemsKey}' but the payload has no such array`
        ).toBe(true);
        // ASSERT non-empty, never skip. `if (count > 0)` was the vacuity path:
        // emptying the Inoreader fixture left the whole suite green with
        // `search_radar` and `get_latest_insights` — the two tools with the actual
        // client-breaking history — measuring nothing at all. A guard that goes
        // quiet when its input disappears is the failure this file exists to stop.
        const count = (items as unknown[]).length;
        expect(
          count,
          `${tool}: expected at least ${spec.budget.minItems} items in '${spec.budget.itemsKey}' but got ${count}. ` +
            `The budget was measured at that scale; a smaller input measures a smaller response and the per-item ` +
            `budget passes having proven nothing. If the input genuinely changed, re-measure and move minItems ` +
            `deliberately — do not lower it to go green.`
        ).toBeGreaterThanOrEqual(spec.budget.minItems);

        const perItem = m.envelopeBytes / count;
        expect(
          perItem,
          `${detail} — ${perItem.toFixed(0)} B per item over ${count} items. Per-item width moves when the SHAPE changes, so this is a field-width regression, not dataset growth.`
        ).toBeLessThanOrEqual(spec.budget.maxBytesPerItem);

        // The FLOOR. Without it the fixture can be hollowed out beneath the ceiling:
        // collapsing the radar HTML to a one-liner held every count at 45/45/45/15
        // and kept the suite green while 60-70% of the exposure vanished — and, worse,
        // left BL-109's own defect passing when stacked with the strip revert.
        expect(
          perItem,
          `${detail} — ${perItem.toFixed(0)} B per item is BELOW the ${spec.budget.minBytesPerItem} B floor this budget was measured at. The fixture or the projection got narrower, so the ceiling above is no longer measuring anything. Re-measure and move the floor deliberately — do not lower it to go green.`
        ).toBeGreaterThanOrEqual(spec.budget.minBytesPerItem);
      }
    });
  }
});
