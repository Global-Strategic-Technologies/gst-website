/**
 * The capability registry behind `/hub/mcp/docs/`.
 *
 * ONE source of truth for that page: the Reference sidebar, the four group
 * counts, the client-side search index, the workflow steps, and every contract
 * pane are all derived from this module at build time. Nothing on the page
 * hardcodes a capability name or a count.
 *
 * WHY THIS IS AUTHORED RATHER THAN GENERATED. `mcp-server/src/docs/tools/*` is
 * the internal engineering corpus: it carries operator runbooks, wire detail,
 * and cache semantics that a prospect should never read. This registry is
 * written FROM that corpus for a public audience, and bound back to server
 * source by `tests/integration/mcp-docs-parity.test.ts` — identifiers, argument
 * names, orchestration lists and counts all fail there if the server moves.
 * Authored prose (glosses, callouts) is the part the guard cannot pin, which is
 * the accepted trade. Decision record: ADR-0023.
 *
 * COPY RULES, enforced by that same guard over these string values:
 *   - No em dashes (operator preference, shared with the marketing page).
 *   - No uptime figure or availability percentage, and no promissory SLA claim.
 *   - No link to a docs subdomain; `/hub/mcp/docs/` is the one published address.
 *   - Rate ceilings are always framed as tunable and non-contractual.
 *   - Nothing operator-only: no admin endpoints, key rotation, or storage detail.
 *
 * Adding a tool or prompt to the server without adding it here fails the parity
 * suite. See src/docs/hub/MCP_CAPABILITY_DOCS.md for the full procedure.
 */

export type CapabilityGroup = 'Tools' | 'Prompts' | 'Resources' | 'Operations';

/**
 * Job keys, used by `usedIn` and by the Jobs lens.
 *
 * The four `irl-*` keys were one `irl` key until the round trip was split: a
 * reader who has a filled workbook in hand and wants a dossier is not doing the
 * same job as one who has nothing yet and needs to issue the blank ask. They
 * share a document, not a task, and the four prompts run at different times, on
 * different inputs, for different people.
 */
export type JobKey =
  | 'screen'
  | 'kickoff'
  | 'irl-issue'
  | 'irl-fill'
  | 'irl-extract'
  | 'irl-sweep'
  | 'spend'
  | 'architecture'
  | 'reg'
  | 'precedent'
  | 'radar'
  | 'handover';

export interface CapabilityArg {
  /** Argument name, verbatim wire casing. */
  name: string;
  /** One-line description, written for a reader deciding what to pass. */
  desc: string;
  /**
   * A literal value that satisfies `desc`, written exactly as it appears inside
   * the call — `"series-b"` carries its quotes, `18400000` does not.
   *
   * TRACEABILITY IS THE RULE, and it is the reason this field is optional. Every
   * value here comes from a UAT Input table under
   * `mcp-server/src/docs/testing/uat/`, from a literal call in a UAT step, or
   * from an enum or default in the tool's CONTRACT.md or Zod schema. Where UAT
   * and code disagree the code wins — the `_audit` blocks UAT-03.1/04.1/05.1
   * mark required have been `.optional()` since server 0.60.0. An argument with
   * no such source gets no example, which costs a table cell rather than buying
   * a fabricated value.
   */
  example?: string;
}

export interface Capability {
  /** Wire identifier, verbatim. Never uppercase-transformed in the UI. */
  id: string;
  group: CapabilityGroup;
  /** Type tag shown beside the contract title. */
  type: 'Tool' | 'Prompt' | 'Resource family' | 'Operations';
  /** One or two sentences: what it is, in the reader's terms. */
  gloss: string;
  args?: CapabilityArg[];
  /**
   * Qualifier below the argument table (cross-field rules, limits). Also the
   * whole body of the Arguments section when `args` is absent — an
   * argument-less tool still renders the heading, so "Takes no arguments." is a
   * stated contract rather than a missing section.
   */
  argNote?: string;
  /**
   * The Example block has two arms, and a tool carries exactly one of them
   * (asserted by the parity suite).
   *
   * `exampleCall` is the ordered list of argument names a demonstrated call
   * passes; `buildExampleCall` renders it from those arguments' own `example`
   * values, so the table column and the call below it are one source shown
   * twice and cannot drift. The empty list renders `id({})`.
   *
   * `example` is a hand-authored call, for the four tools a flat generated one
   * cannot serve: `fill_information_request_list_xlsx` documents `ref` /
   * `fileLocation` / `comments`, which are `fills[]` sub-fields rather than
   * top-level keys; `compose_dossier_envelope` documents a pseudo-argument
   * naming two fields at once; and `prepare_irl_body` and
   * `validate_irl_provenance` both key off a per-body value no literal can
   * stand in for. Generating a flat call for those would produce something
   * invalid on the wire that still passed a name-matching guard.
   *
   * Nothing asserts the SIZE of that set, deliberately — a fifth tool joining
   * it is a judgement, not a regression. But the count is stated in
   * MCP_CAPABILITY_DOCS.md and ADR-0023 as well, so move all three together.
   *
   * The Example COLUMN is independent of which arm a tool uses — a literal-arm
   * tool still fills the column wherever a value is traceable.
   */
  example?: string;
  /** See `example`. Ordered argument names the generated call passes. */
  exampleCall?: string[];
  /** Resource families only: the URI template. */
  uri?: string;
  /** Prompts only: the tools the prompt drives. Pinned to server source. */
  orchestrates?: string[];
  /** Tools and resources: what comes back. */
  returns?: string[];
  /** Prompts: the sections of the artifact produced. */
  output?: string[];
  noteTitle?: string;
  note?: string;
  availability?: string;
  /** Other capability ids, rendered as navigating chips. */
  related?: string[];
  usedIn?: JobKey[];
  /** Resource families only: how many documents the family holds. */
  count?: number;
}

/**
 * The contract shown when Reference opens with no capability in the URL.
 * Asserted to exist by the parity suite, so a rename cannot leave the lens
 * opening on nothing.
 */
export const DEFAULT_CAPABILITY_ID = 'search_regulations';

const TIER_LINE =
  'Included in all tiers. Rate ceilings are per-client capability limits, not contractual quotas.';
const RADAR_TIER_LINE =
  'Radar access is granted separately from the analysis tools. Rate ceilings are per-client capability limits, not contractual quotas.';
const PROMPT_LINE =
  'Included in all tiers. Surfaces as a slash command with an argument form in Claude Desktop.';
const RESOURCE_LINE =
  'Included in all tiers. Browsable from the resource library in any MCP client that surfaces resources.';

export const CAPABILITIES: readonly Capability[] = [
  // ---------------------------------------------------------------- Tools ---
  {
    id: 'generate_diligence_agenda',
    group: 'Tools',
    type: 'Tool',
    usedIn: ['kickoff'],
    gloss:
      'Turns a target profile into a prescriptive diligence agenda: the topics to cover, the questions to ask under each, and the attention areas the profile makes material.',
    args: [
      {
        name: 'transactionType',
        desc: 'enum. full-acquisition · majority-stake · business-integration · carve-out · venture-series.',
        example: '"full-acquisition"',
      },
      {
        name: 'productType',
        desc: 'enum. b2b-saas · b2c-marketplace · on-premise-enterprise · deep-tech-ip · tech-enabled-service.',
        example: '"b2b-saas"',
      },
      {
        name: 'techArchetype',
        desc: 'enum. modern-cloud-native · hybrid-legacy · self-managed-infra · datacenter-vendor. The largest single driver of which questions surface.',
        example: '"modern-cloud-native"',
      },
      {
        name: 'headcount',
        desc: 'ordinal enum. Company size band. Questions can gate on a minimum band rather than an exact match.',
        example: '"51-200"',
      },
      {
        name: 'revenueRange',
        desc: 'ordinal enum. Revenue band, gated the same way.',
        example: '"5-25m"',
      },
      {
        name: 'growthStage',
        desc: 'enum. Where the company sits in its funding and growth arc.',
        example: '"scaling"',
      },
      {
        name: 'companyAge',
        desc: 'ordinal enum. Age band, gated the same way.',
        example: '"5-10yr"',
      },
      {
        name: 'geographies',
        desc: 'enum array. The only multi-select input. Two or more specific regions auto-adds multi-region.',
        example: '["eu"]',
      },
      {
        name: 'businessModel',
        desc: 'enum. How the target earns.',
        example: '"productized-platform"',
      },
      {
        name: 'scaleIntensity',
        desc: 'enum. Load and growth pressure on the platform.',
        example: '"moderate"',
      },
      {
        name: 'transformationState',
        desc: 'enum. How much change the estate is already carrying.',
        example: '"stable"',
      },
      {
        name: 'dataSensitivity',
        desc: 'enum. Drives the privacy and security question set.',
        example: '"high"',
      },
      {
        name: 'operatingModel',
        desc: 'enum. How engineering and operations are organized.',
        example: '"product-aligned-teams"',
      },
    ],
    argNote:
      'All thirteen dimensions are required: the engine has no defaults, and a missing field is rejected before it runs. Each accepts a fixed identifier set; call the tool with an invalid value and the error names the valid ones.',
    // UAT-03.2, the fully specified target: an EU healthcare SaaS business.
    // Paired with 03.1 (every dimension "unknown") it is what shows the
    // dimensions do work: attention areas collapse from 28 to 4.
    exampleCall: [
      'transactionType',
      'productType',
      'techArchetype',
      'headcount',
      'revenueRange',
      'growthStage',
      'companyAge',
      'geographies',
      'businessModel',
      'scaleIntensity',
      'transformationState',
      'dataSensitivity',
      'operatingModel',
    ],
    returns: [
      'A prioritized agenda: topics, and per topic the questions the profile makes worth asking.',
      'Attention areas, the themes this particular combination of dimensions puts at risk.',
      'deeplink. Opens the Diligence Machine wizard populated with the same thirteen answers.',
    ],
    availability: TIER_LINE,
    related: ['gst_diligence_kickoff', 'gst_diligence_handoff_memo', 'gst://library/…'],
  },
  {
    id: 'search_portfolio',
    group: 'Tools',
    type: 'Tool',
    usedIn: ['precedent'],
    gloss:
      "Searches GST's anonymized engagement record by free text, theme, and engagement side, so a current deal can be framed against work already done.",
    args: [
      {
        name: 'search',
        desc: 'string, optional. Free text matched against code name, industry, summary, and technologies. Substring match, not fuzzy.',
        example: '"healthcare"',
      },
      {
        name: 'theme',
        desc: 'string, optional. One of the values list_portfolio_facets returns, or "all". Defaults to "all".',
        example: '"Healthcare"',
      },
      {
        name: 'engagement',
        desc: 'string, optional. Buy-Side · Sell-Side · all. Defaults to "all".',
        example: '"Buy-Side"',
      },
    ],
    argNote:
      'The empty call returns every engagement. There is no limit argument: the tool mirrors the website filter surface exactly, and the website renders the full set.',
    // UAT-01.2 supplies the free-text value, UAT-01.3 the two facet filters.
    exampleCall: ['search', 'theme', 'engagement'],
    returns: [
      'matches. The engagements passing all three filters, each with its summary, challenge, and solution.',
      'totalMatched and returned.',
      'deeplink. Opens the M&A portfolio filtered the same way.',
    ],
    availability: TIER_LINE,
    related: ['list_portfolio_facets', 'gst_comparable_engagements_memo'],
  },
  {
    id: 'list_portfolio_facets',
    group: 'Tools',
    type: 'Tool',
    usedIn: ['precedent'],
    gloss:
      'Lists the values the portfolio filters accept. Call it before search_portfolio rather than guessing a theme name.',
    argNote: 'Takes no arguments.',
    exampleCall: [],
    returns: [
      'themes and engagementCategories. The two filterable dimensions.',
      'growthStages and years. Not filterable today, exposed for orientation.',
    ],
    availability: TIER_LINE,
    related: ['search_portfolio'],
  },
  {
    id: 'search_regulations',
    group: 'Tools',
    type: 'Tool',
    usedIn: ['reg'],
    gloss:
      'Queries 123 regulatory frameworks by jurisdiction, category, and free text. The curated corpus carries current effective dates, scope language, key requirements, and statutory penalty bands.',
    args: [
      {
        name: 'jurisdiction',
        desc: 'string or string array, optional. Lowercase codes: "eu", "us", "us-ca", "ca-qc". An array combines matches in one call.',
        example: '"eu"',
      },
      {
        name: 'category',
        desc: 'string or string array, optional. data-privacy · ai-governance · cybersecurity · industry-compliance.',
        example: '"ai-governance"',
      },
      {
        name: 'query',
        desc: 'string, optional. Matches name, curated aliases, summary, and id. Common short forms resolve to the statute they name.',
      },
      { name: 'limit', desc: 'number, optional. Default 20, maximum 120.' },
    ],
    argNote:
      'Keep limit at or near its default and narrow by category. Broad multi-jurisdiction queries return very large responses, and raising the limit is how a result outgrows a client rather than how it gets more useful. When an array holds more than one value, the response omits that filter from its deeplink, because the website uses single-select chips.',
    // UAT-02.2. `query` and `limit` are deliberately outside the call: the case
    // leaves limit at its default, and the note above says to keep it there.
    exampleCall: ['jurisdiction', 'category'],
    returns: [
      'Framework records: name, jurisdiction, category, effective date, key requirements, penalties. The corpus carries no article numbers.',
      'Each match resolves its Regulatory Map resource URI, so the full document can be read next.',
      'deeplink. Opens the Regulatory Map filtered to the same region and category.',
    ],
    availability: TIER_LINE,
    related: ['list_regulation_facets', 'gst://regulations/…', 'gst_regulatory_exposure_brief'],
  },
  {
    id: 'list_regulation_facets',
    group: 'Tools',
    type: 'Tool',
    usedIn: ['reg'],
    gloss:
      'Lists the jurisdictions and categories the regulatory corpus actually indexes, plus the total framework count. The recovery call when a jurisdiction code does not resolve.',
    argNote: 'Takes no arguments.',
    exampleCall: [],
    returns: [
      'jurisdictions and categories. Every value search_regulations will accept.',
      'totalFrameworks. The size of the indexed corpus.',
    ],
    availability: TIER_LINE,
    related: ['search_regulations', 'gst://regulations/…'],
  },
  {
    id: 'assess_infrastructure_cost_governance',
    group: 'Tools',
    type: 'Tool',
    usedIn: ['spend'],
    gloss:
      'Scores cloud cost governance maturity across six domains and returns a prioritized improvement list. Wraps the engine behind the Hub wizard.',
    args: [
      {
        name: 'answers',
        desc: 'map of question id to a score. Keys take the form q1_1, q1_2 … q6_N across the six domains.',
        example: '{}',
      },
      {
        name: 'companyStage',
        desc: 'enum, optional. Canonical funding stage (seed · series-a · series-b · series-c · pe · enterprise) or one of the four native bands. Adds a benchmark band; never changes the score.',
        example: '"series-b"',
      },
    ],
    argNote:
      'The scale is 0 Not in place · 1 Ad hoc · 2 Established · 3 Optimized, with -1 meaning Not sure. The map is sparse: missing questions count as zero, so a partial assessment reports an honest absence of information rather than failing. Only an explicit -1 is reported as skipped.',
    // UAT-06.1, the discovery call, verbatim: an empty answers map is valid and
    // is what the case is for. companyStage carries UAT-06.2's value in the
    // column without joining this call, which would then be a shape no case ran.
    exampleCall: ['answers'],
    returns: [
      'overallScore and maturityLevel. Reactive · Aware · Optimizing · Strategic.',
      'domainScores. One per domain, with the raw and normalized score.',
      'showFoundationalFlag. Set when visibility or attribution scores low, independent of the overall score.',
      'recommendations. Sorted by impact, then effort, then domain.',
      'answeredCount, totalQuestions, skippedCount. How much of the assessment was actually answered.',
      'deeplink. Opens the wizard on the results view with the same answers.',
    ],
    noteTitle: 'A high overall score can hide a foundational gap',
    note: 'Two of the six domains, visibility and tagging plus account structure and attribution, are foundational: everything else rests on them. If either scores at or below a third, the result raises its foundational flag no matter how strong the overall number looks.',
    availability: TIER_LINE,
    related: ['compute_techpar', 'estimate_tech_debt_cost', 'gst_target_quick_look'],
  },
  {
    id: 'compute_techpar',
    group: 'Tools',
    type: 'Tool',
    usedIn: ['screen', 'spend'],
    gloss:
      'Benchmarks total technology cost against stage-adjusted ranges and projects a 36-month trajectory. Wraps the TechPar engine behind the Hub wizard.',
    args: [
      {
        name: 'arr',
        desc: 'number > 0. Annual recurring revenue, dollars. Drives every percentage-of-revenue calculation.',
        example: '18400000',
      },
      {
        name: 'stage',
        desc: 'enum. Canonical funding stage: seed · series-a · series-b · series-c · pe · enterprise. Selects the per-stage benchmark band.',
        example: '"series-b"',
      },
      {
        name: 'mode',
        desc: 'enum, no default. quick reads rdOpEx directly; deepdive synthesizes R&D OpEx as engCost + prodCost + toolingCost.',
        example: '"quick"',
      },
      {
        name: 'capexView',
        desc: 'enum. cash includes rdCapEx in totals; gaap excludes it.',
        example: '"cash"',
      },
      {
        name: 'growthRate',
        desc: 'number. Annual revenue growth, as a percentage; drives the 36-month projection.',
        example: '31',
      },
      {
        name: 'exitMultiple',
        desc: 'number, zero or more. Translates the cumulative gap to exit value. 12x is the SaaS convention.',
        example: '12',
      },
      {
        name: 'infraHostingAnnual',
        desc: 'number, zero or more. Annual infrastructure and hosting cost, dollars. Must be above zero.',
        example: '732000',
      },
      {
        name: 'infraPersonnel',
        desc: 'number, zero or more. Annual infrastructure personnel cost, dollars.',
        example: '640000',
      },
      {
        name: 'rdOpEx',
        desc: 'number, zero or more. R&D OpEx. Read in quick mode; discarded in deepdive.',
        example: '4100000',
      },
      { name: 'rdCapEx', desc: 'number, zero or more. Capitalized R&D.', example: '450000' },
      {
        name: 'engFTE',
        desc: 'number, zero or more. Engineering headcount; yields revenue per engineer.',
        example: '84',
      },
      {
        name: 'engCost',
        desc: 'number, zero or more. Annual engineering personnel cost. deepdive only.',
        example: '0',
      },
      {
        name: 'prodCost',
        desc: 'number, zero or more. Annual product personnel cost. deepdive only.',
        example: '0',
      },
      {
        name: 'toolingCost',
        desc: 'number, zero or more. Annual tooling cost. deepdive only.',
        example: '0',
      },
    ],
    argNote:
      'All 14 fields are required in both modes; the engine ignores the fields the selected mode does not read. All money fields are annual dollars on one currency basis. A zero arr or infraHostingAnnual returns invalid-input, never a stack trace.',
    // UAT-04.1, run against production 0.48.2. Hand-checkable: 732000 + 640000
    // + 4100000 + 450000 is 5,922,000, which on 18,400,000 of ARR is the 32.18
    // the Series B-C band reads as ahead.
    exampleCall: [
      'arr',
      'stage',
      'mode',
      'capexView',
      'growthRate',
      'exitMultiple',
      'infraHostingAnnual',
      'infraPersonnel',
      'rdOpEx',
      'rdCapEx',
      'engFTE',
      'engCost',
      'prodCost',
      'toolingCost',
    ],
    returns: [
      'total, totalCash, totalGAAP, totalTechPct. Annual technology cost and its share of revenue.',
      'zone. underinvest · ahead · healthy · above · elevated · critical, against the stage benchmark band.',
      'categories and kpis. Per-category breakdown plus unit-economics KPIs including revenue per engineer.',
      'gap. cumulative36, exitValue, underinvestGap. The 36-month projection.',
      'deeplink. Opens the TechPar wizard populated with the same inputs.',
    ],
    availability: TIER_LINE,
    related: [
      'gst_target_quick_look',
      'estimate_tech_debt_cost',
      'assess_infrastructure_cost_governance',
    ],
  },
  {
    id: 'estimate_tech_debt_cost',
    group: 'Tools',
    type: 'Tool',
    usedIn: ['screen'],
    gloss:
      'Estimates the annual carrying cost of accumulated technical debt from team size, salary, maintenance burden, and delivery cadence.',
    args: [
      {
        name: 'teamSize',
        desc: 'integer above zero. Engineering headcount. A direct multiplier on the carrying cost.',
        example: '84',
      },
      {
        name: 'salary',
        desc: 'number above zero. Average fully loaded annual engineering salary, dollars.',
        example: '165000',
      },
      {
        name: 'maintenanceBurdenPct',
        desc: 'number 0 to 100. Share of engineering capacity consumed by maintenance and debt servicing. The headline input.',
        example: '28',
      },
      {
        name: 'deployFrequency',
        desc: 'enum. Multiple/day · Daily · Weekly · Bi-weekly · Three-week · Monthly · Quarterly+ · Bi-annually · Annually. Sets the DORA tier and the velocity multiplier.',
        example: '"Weekly"',
      },
      {
        name: 'incidents',
        desc: 'integer, zero or more. Production incidents per month.',
        example: '3',
      },
      {
        name: 'mttrHours',
        desc: 'number, zero or more. Mean time to recovery, hours per incident.',
        example: '8',
      },
      {
        name: 'remediationBudget',
        desc: 'number, zero or more. Capital available for debt paydown, dollars.',
        example: '900000',
      },
      {
        name: 'arr',
        desc: 'number, zero or more. Annual recurring revenue, used to express the cost as a share of revenue.',
        example: '18400000',
      },
      {
        name: 'remediationPct',
        desc: 'number 0 to 100. Expected reduction in debt cost from the remediation.',
        example: '65',
      },
      {
        name: 'contextSwitchOn',
        desc: 'boolean. Whether to model the context-switching overhead surcharge.',
        example: 'true',
      },
    ],
    argNote:
      'These are business values, not wizard slider positions: pass the precision you actually have. An arr of zero is allowed and reports the revenue share as zero rather than dividing by it.',
    // UAT-05.1.
    exampleCall: [
      'teamSize',
      'salary',
      'maintenanceBurdenPct',
      'deployFrequency',
      'incidents',
      'mttrHours',
      'remediationBudget',
      'arr',
      'remediationPct',
      'contextSwitchOn',
    ],
    returns: [
      'totalMonthly and annualCost. The carrying cost, and its split across steady-state burden, context switching, and incident time.',
      'hoursLostPerEng and costPerEng. The same number expressed per engineer.',
      'doraLabel. The DORA tier the deploy cadence lands in, and the multiplier it applied.',
      'debtPctArr. Annual cost as a share of revenue, the usual deal-discussion framing.',
      'paybackMonths and monthlySavings. What the remediation budget buys back.',
      'deeplink. Opens the Tech Debt calculator with the same inputs.',
    ],
    availability: TIER_LINE,
    related: ['compute_techpar', 'assess_infrastructure_cost_governance', 'gst_target_quick_look'],
  },
  {
    id: 'generate_information_request_list_xlsx',
    group: 'Tools',
    type: 'Tool',
    usedIn: ['irl-issue'],
    gloss:
      'Builds the blank information request list as an XLSX workbook, configured for the engagement. This is the ask GST hands a target before diligence tools can run.',
    args: [
      {
        name: 'targetName',
        desc: 'string, optional. The target the list is addressed to.',
        example: '"Northwind Health"',
      },
      { name: 'companyName', desc: 'string, optional. Composed into the workbook title.' },
      {
        name: 'projectName',
        desc: 'string, optional. Composed into the title alongside companyName.',
      },
      {
        name: 'transactionContext',
        desc: 'enum, optional. sell-side · buy-side · value-creation · unknown. Fires the authored skip-if directives, removing questions that do not apply.',
        example: '"buy-side"',
      },
      {
        name: 'includeSections',
        desc: 'array of two-digit section ids, optional. Keeps whole sections. Defaults to all ten.',
        example: '["00", "03"]',
      },
      {
        name: 'excludeRequests',
        desc: 'array of NN-II keys, optional. Removes individual questions. Call list_irl_requests to find the keys.',
        example: '["03-08"]',
      },
      {
        name: 'customRequests',
        desc: 'array, optional. Extra questions, each with a section and its text.',
      },
      {
        name: 'showCanonicalReference',
        desc: 'boolean, optional. Whether to print the canonical reference column.',
      },
    ],
    argNote:
      'Every field is optional: the empty call produces the full canonical workbook. The three subtractions compose, and surviving questions keep their reference ids, so the gaps read as deliberate rather than as an incomplete list.',
    // UAT-07.2. companyName, projectName, customRequests and
    // showCanonicalReference are outside the call and carry no example: UAT-07
    // supplies no value for them, and inventing one is the thing this registry
    // does not do.
    exampleCall: ['targetName', 'transactionContext', 'includeSections', 'excludeRequests'],
    returns: [
      'filename and the workbook bytes.',
      'sectionCount and bulletCount. What the configuration actually produced.',
      "downloadUrl. The Hub generator with this call's arguments pre-filled, which is the surface to hand a person.",
      'canonicalUrl. The library article the questions come from.',
    ],
    availability: TIER_LINE,
    related: ['list_irl_requests', 'fill_information_request_list_xlsx', 'gst_irl_create'],
  },
  {
    id: 'fill_information_request_list_xlsx',
    group: 'Tools',
    type: 'Tool',
    usedIn: ['irl-fill'],
    gloss:
      'Builds the same workbook already populated from evidence the model holds, writing each answer and the source it rests on into the row. Removes the wait for a third party wherever the information already exists.',
    args: [
      {
        name: 'fills',
        desc: 'array of 1 to 200 entries, each { ref, fileLocation, comments }. All three are required per entry.',
      },
      {
        name: 'ref',
        desc: 'The workbook Reference value for the row being answered, for example 0-03. Must exist in the configured workbook, and cannot repeat.',
        example: '"0-01"',
      },
      {
        name: 'fileLocation',
        desc: 'What the answer rests on: a document reference and optional locator, or a bracketed origin note. A reference, never an excerpt.',
        example: '"VDR/00/entity-chart.pdf, page 1"',
      },
      {
        name: 'comments',
        desc: 'The answer itself, as single-line prose. Under the extraction rules an entry here is a real answer, never a placeholder.',
        example: '"Delaware C-corp, single operating entity."',
      },
      {
        name: 'targetName',
        desc: 'string, optional. Same scoping arguments as the blank generator, minus productSummary.',
        example: '"UAT Eleven Corp"',
      },
      {
        name: 'transactionContext',
        desc: 'enum, optional. sell-side · buy-side · value-creation · unknown.',
        example: '"buy-side"',
      },
    ],
    argNote:
      'Requiring both a source and an answer on every entry is structural: a row cannot be answered without saying what it rests on. The shape of the reference is checked; whether the referenced document exists is deliberately not, because that is what the human reviewer verifies.',
    // Hand-authored rather than generated: ref / fileLocation / comments are
    // documented above as arguments because that is where a reader looks for
    // them, but on the wire they are `fills[]` sub-fields. A flat generated call
    // would name them at the top level and be invalid. Values are UAT-11.1's.
    example:
      'fill_information_request_list_xlsx({\n  "targetName": "UAT Eleven Corp",\n  "transactionContext": "buy-side",\n  "fills": [\n    { "ref": "0-01", "fileLocation": "VDR/00/entity-chart.pdf, page 1", "comments": "Delaware C-corp, single operating entity." },\n    { "ref": "1-01", "fileLocation": "[inferred from product-overview.pdf + demo session]", "comments": "Single multi-tenant SaaS surface." },\n    { "ref": "9-01", "fileLocation": "[User stated this in session chat]", "comments": "Five-member board, two independent seats." }\n  ]\n})',
    returns: [
      'filename and the workbook bytes, identical in behavior to a target-returned file.',
      'filledRowCount and filledRefs. The operator review checklist.',
      'blankRowCount. What remains to ask for, which is the follow-up list.',
    ],
    noteTitle: 'Blank rows are the ask',
    note: 'Rows the evidence cannot support stay empty on purpose. Filling them from inference would produce a workbook that looks complete and is not, so the unanswered rows are what goes back to the target.',
    availability: TIER_LINE,
    related: ['generate_information_request_list_xlsx', 'gst_irl_populate', 'gst_irl_sweep'],
  },
  {
    id: 'list_irl_requests',
    group: 'Tools',
    type: 'Tool',
    usedIn: ['irl-issue'],
    gloss:
      'Returns the canonical question set behind the information request list, with the key for each question. The only way to map "drop that question" onto the key the generator accepts.',
    argNote: 'Takes no arguments.',
    exampleCall: [],
    returns: [
      'requests. Each with its NN-II key, section, section title, question text, and any engagement contexts that auto-remove it.',
      'sectionCount and bulletCount.',
    ],
    availability: TIER_LINE,
    related: ['generate_information_request_list_xlsx', 'gst://library/…'],
  },
  {
    id: 'prepare_irl_body',
    group: 'Tools',
    type: 'Tool',
    gloss:
      'Registers a completed information request list with the server and returns a short hash for it. Everything downstream in the dossier pipeline refers to the document by that hash instead of resending it.',
    args: [
      {
        name: 'filledIrl',
        desc: 'string, required. The populated list, entire markdown body, at least 200 characters.',
      },
    ],
    argNote:
      'The hash is computed byte for byte with no normalization, so the same body always produces the same hash. Do not hand-compute it: the downstream tools accept only the value this call returns.',
    example: 'prepare_irl_body({ "filledIrl": "<the populated body, verbatim>" })',
    returns: [
      'irlBodyHash. The reference every later call uses.',
      'byteLength. What the server actually received.',
      'mintedAt. When the server first saw this body, which is what lets a later record say the timestamp was witnessed rather than asserted.',
    ],
    availability: TIER_LINE,
    related: ['validate_irl_provenance', 'compose_dossier_envelope', 'gst_irl_extract'],
  },
  {
    id: 'validate_irl_provenance',
    group: 'Tools',
    type: 'Tool',
    usedIn: ['irl-sweep'],
    gloss:
      'Checks every claim in a draft back to the request list it cites, and reports which citations actually hold. Run it to see the verdicts before they are written into a deliverable.',
    args: [
      {
        name: 'citations',
        desc: 'array, required. Each entry pairs the claim path with the citation supporting it. A citation may be one string or up to eight.',
      },
      // No example on either: a hash is minted per body and a body is a whole
      // document, so any literal in a copyable cell would fail on first use.
      // The placeholder lives in the call below, where it reads as a template.
      { name: 'irlBodyHash', desc: 'string. The hash from prepare_irl_body.' },
      { name: 'filledIrl', desc: 'string. The body itself, as an alternative to the hash.' },
    ],
    argNote:
      'One of irlBodyHash or filledIrl must be supplied; the body wins when both are. Prefer the hash: passing the body re-sends the whole document on every call. Where a claim is genuinely synthesized from several bullets, the array form checks each and aggregates conservatively, so one unverified element makes the whole citation unverified.',
    // Hand-authored: `citations` entries are objects, and the hash is per-body,
    // so no literal here could be run as written. UAT-07.4 supplies the shape;
    // the hash stays a marked placeholder rather than a plausible-looking
    // sixteen hex characters that would fail on the first call.
    example:
      'validate_irl_provenance({\n  "irlBodyHash": "<the hash prepare_irl_body returned>",\n  "citations": [\n    { "path": "financials.arr", "citation": "0-03 Annual recurring revenue" }\n  ]\n})',
    returns: [
      'verified. The cited text is present in the list.',
      'verified-fuzzy. Not verbatim, but a long enough run of words matches to tolerate light paraphrase.',
      'partner-supplied. Cited to the partner directly, with no list text to check against.',
      'unverified. Neither. Treat it as fabricated: pull the claim or re-cite it.',
    ],
    availability: TIER_LINE,
    related: ['prepare_irl_body', 'compose_dossier_envelope'],
  },
  {
    id: 'compose_dossier_envelope',
    group: 'Tools',
    type: 'Tool',
    gloss:
      "The terminus of the dossier pipeline: takes the run's claims, gaps, and tool outcomes and returns the audit sections the finished dossier carries. Driven by the ingestion prompt rather than called by hand.",
    args: [
      {
        name: 'irlBodyHash',
        desc: 'string, required. From prepare_irl_body. The sole reference to the document.',
      },
      {
        name: 'claims',
        desc: 'array, required. Every load-bearing claim the dossier will make, each with its citation and tier.',
      },
      { name: 'gaps', desc: 'array. What the run could not answer, categorized. May be empty.' },
      {
        name: 'fillRatio',
        desc: 'object. How much of the list came back answered, and whether that is enough to proceed.',
      },
      {
        name: 'gatesPassed / gatesElided',
        desc: 'arrays. Which tools ran, and which were skipped with the reason and the section that would have fed them.',
      },
      { name: 'mode', desc: 'enum. full · extract-only.', example: '"full"' },
      {
        name: 'auditLevel',
        desc: 'enum. standard · enhanced · debug. Selects which audit blocks come back.',
        example: '"debug"',
      },
    ],
    argNote:
      'The array fields are required but may be empty; omitting one is an error, passing an empty array is not. This is the most common first-call mistake. The call fails outright if prepare_irl_body has not registered the body first, and the fix is always to register it again rather than retrying.',
    // Hand-authored: `gatesPassed / gatesElided` is one documented row naming
    // two wire fields, so no generated call could render it correctly, and the
    // hash is per-body.
    //
    // Every value is UAT-07.5's except the three arrays, which that case fills
    // (one gap, two gatesPassed, one gatesElided) and this deliberately empties
    // to demonstrate the argNote's rule. Including the fillRatio quadruple: the status
    // is a three-value enum (`halt` · `partial` · `ok`, schemas/
    // compose-dossier-envelope.ts) and 16/67 really does derive to 24, which
    // lands in `partial`. An earlier revision invented `78 / 94 / 120 /
    // "sufficient"`: not a legal status, not a coherent ratio, and on the one
    // arm no guard can check. The empty arrays are the point the argNote makes
    // above: required, but `[]` is fine.
    //
    // TRUNCATED ON PURPOSE, and the ellipsis says so. `promptName`,
    // `modelVersion`, `irlSource`, `conditionalTriggersFired` and
    // `forceToolsApplied` are required too and are not documented as arguments
    // here, so a call listing only the documented ones would look complete and
    // be rejected — the exact first-call mistake the argNote warns about.
    example:
      'compose_dossier_envelope({\n  "irlBodyHash": "<the hash prepare_irl_body returned>",\n  "mode": "full",\n  "auditLevel": "debug",\n  "fillRatio": { "percent": 24, "substantiveCells": 16, "totalCells": 67, "status": "partial" },\n  "claims": [{ "claim": "ARR is 18.4m", "citation": "0-03 Annual recurring revenue", "tier": "2" }],\n  "gaps": [],\n  "gatesPassed": [],\n  "gatesElided": [],\n  …\n})',
    returns: [
      "The gap list, ready to paste as the dossier's audit section.",
      'Provenance verification counts across the same four verdict buckets validate_irl_provenance reports.',
      'A record of which tools were attempted and which succeeded during the run.',
    ],
    noteTitle: 'Verification is not advisory',
    note: 'This tool runs the same citation check validate_irl_provenance exposes, over every claim, and appends what it finds to the gap list. Calling the validator first shows the verdicts early. It does not avoid the check.',
    availability: TIER_LINE,
    related: ['prepare_irl_body', 'validate_irl_provenance', 'gst_irl_ingestion'],
  },
  {
    id: 'search_radar',
    group: 'Tools',
    type: 'Tool',
    usedIn: ['radar'],
    gloss:
      'Searches curated private equity, M&A, and enterprise-technology intelligence, filtered by category. Returns the annotated highlights and the wider wire in one feed.',
    args: [
      {
        name: 'category',
        desc: 'enum, optional. pe-ma · enterprise-tech · ai-automation · security. Omit for every category.',
        example: '"pe-ma"',
      },
    ],
    argNote:
      'category is the only filter, and the unfiltered call is the largest response these tools produce. Pass a category when the intent is category-scoped, and prefer get_latest_insights when only the annotated tier is wanted.',
    // UAT-08.3, the category-scoped call. 08.1 runs it unfiltered, which the
    // note above steers away from.
    exampleCall: ['category'],
    returns: [
      'matches. Annotated highlights and wire items merged, deduplicated, newest first.',
      'oldestItemDaysAgo. Freshness at a glance, without scanning every timestamp.',
      'liveInfo. When each tier was fetched, and whether the response is being served from cache.',
      'deeplink. Opens the Radar with the same filter.',
    ],
    noteTitle: 'Radar content is a signal, not an instruction',
    note: 'Items are third-party article text with GST annotation. Confirm against the source before acting on one or forwarding it to a client.',
    availability: RADAR_TIER_LINE,
    related: ['get_latest_insights', 'gst://radar/…', 'gst_radar_brief_today'],
  },
  {
    id: 'get_latest_insights',
    group: 'Tools',
    type: 'Tool',
    gloss:
      'The annotated tier only: the latest radar items carrying a GST Take, whole stream or by category. The narrow call when the wider wire is noise.',
    args: [
      { name: 'limit', desc: 'number, optional. 1 to 30, default 10.', example: '3' },
      {
        name: 'category',
        desc: 'enum, optional. pe-ma · enterprise-tech · ai-automation · security.',
        example: '"pe-ma"',
      },
    ],
    // UAT-08.2, which sets limit and leaves category off.
    exampleCall: ['limit'],
    returns: [
      'items. Annotated highlights with their GST Take populated.',
      'oldestItemDaysAgo and the fetch and cache state, same shape as search_radar.',
    ],
    noteTitle: 'An empty answer can be the true one',
    note: 'The annotated tier depends on editorial supply. A quiet period legitimately returns nothing, which is an accurate answer rather than a failure.',
    availability: RADAR_TIER_LINE,
    related: ['search_radar', 'gst://radar/…', 'gst_radar_brief_today'],
  },

  // -------------------------------------------------------------- Prompts ---
  {
    id: 'gst_diligence_kickoff',
    group: 'Prompts',
    type: 'Prompt',
    usedIn: ['kickoff'],
    gloss:
      'Opens a diligence engagement: builds the starter agenda for the target and frames what the first working session should cover.',
    args: [
      { name: 'targetName', desc: 'string, required.' },
      {
        name: '…the thirteen dimensions',
        desc: 'The same profile generate_diligence_agenda takes, rendered as an argument form.',
      },
    ],
    orchestrates: ['generate_diligence_agenda', 'gst://library/…'],
    output: [
      'The starter agenda, organized by topic with the questions the profile makes material.',
      'The data room structure to ask for, drawn from the VDR guide.',
      'Open in Hub. The deeplink into the Diligence Machine, copied verbatim from the tool result.',
    ],
    availability: PROMPT_LINE,
    related: ['generate_diligence_agenda', 'gst_diligence_handoff_memo', 'gst_irl_create'],
  },
  {
    id: 'gst_target_quick_look',
    group: 'Prompts',
    type: 'Prompt',
    usedIn: ['screen'],
    gloss:
      'First-look brief for an unfamiliar target. Combines cost-governance maturity, unit-economics benchmark, tech-debt range, and regulatory exposure into one digestible page.',
    args: [
      { name: 'targetName', desc: 'string, required.' },
      {
        name: 'productType',
        desc: 'string, required. Drives stage-norm derivations and regulatory category selection.',
      },
      { name: 'arr', desc: 'number above zero. Annual recurring revenue, dollars.' },
      {
        name: 'stage',
        desc: 'enum. Canonical funding stage: seed · series-a · series-b · series-c · pe · enterprise.',
      },
      {
        name: 'hqJurisdiction',
        desc: 'string, required. Filters regulatory exposure to the HQ jurisdiction.',
      },
    ],
    orchestrates: [
      'assess_infrastructure_cost_governance',
      'compute_techpar',
      'estimate_tech_debt_cost',
      'list_regulation_facets',
      'search_regulations',
    ],
    output: [
      'Header. Target, product type, ARR, stage, HQ jurisdiction.',
      'Cost-governance read. Overall score, maturity level, top recommendations.',
      'Unit economics. TechPar zone with the mode it ran and one line on why.',
      'Tech-debt range. Annual cost, payback, DORA tier; extraction-only fields named plainly.',
      'Assumptions and unknowns. One consolidated list of every value supplied from stage norms rather than evidence.',
      'Regulatory exposure. Applicable frameworks for the HQ jurisdiction.',
      'Open in Hub. Deeplinks into all four wizards, copied verbatim from tool results.',
    ],
    noteTitle: 'Two branches',
    note: 'With a GST extract record in context the brief resolves real figures from evidence; with the five arguments alone it derives conservative stage norms and discloses every derivation. A form-derived figure and an evidence-backed one never read alike.',
    availability: PROMPT_LINE,
    related: ['gst_irl_extract', 'gst_diligence_kickoff', 'gst_diligence_handoff_memo'],
  },
  {
    id: 'gst_diligence_handoff_memo',
    group: 'Prompts',
    type: 'Prompt',
    usedIn: ['handover'],
    gloss:
      'Produces the memo a deal team hands onward: the agenda, the comparable engagements, and the data room follow-ups in one document.',
    args: [
      { name: 'targetName', desc: 'string, required.' },
      { name: '…the thirteen dimensions', desc: 'The target profile, as in the kickoff prompt.' },
      {
        name: 'agendaJson',
        desc: 'string, optional. A pre-generated agenda. Absent, the prompt generates one.',
      },
      {
        name: 'comparablesJson',
        desc: 'string, optional. Pre-generated comparables. Absent, the prompt searches for them.',
      },
    ],
    argNote:
      'The two optional arguments exist so a memo can be built from work already done in the session rather than re-running it.',
    orchestrates: ['generate_diligence_agenda', 'search_portfolio', 'gst://library/…'],
    output: [
      'The agenda, condensed to what the receiving team needs to act on.',
      'Comparable GST engagements and what they imply for this deal.',
      'Data room follow-ups still outstanding.',
    ],
    availability: PROMPT_LINE,
    related: [
      'gst_diligence_kickoff',
      'gst_comparable_engagements_memo',
      'generate_diligence_agenda',
    ],
  },
  {
    id: 'gst_comparable_engagements_memo',
    group: 'Prompts',
    type: 'Prompt',
    usedIn: ['precedent'],
    gloss:
      'Frames a target against three to five comparable past GST engagements, drawn from the anonymized record and read analogically rather than as a list.',
    args: [
      {
        name: 'targetDescription',
        desc: 'string, required. Industry, theme, and deal-shape signal in free text.',
      },
      {
        name: 'theme',
        desc: 'string, optional. A thematic hint to steer the search, for example "vertical SaaS consolidation". Defaults to deriving one from the description.',
      },
      {
        name: 'engagementCategory',
        desc: 'enum, optional. Buy-Side · Sell-Side. Defaults to both unless the description clearly implies one.',
      },
    ],
    orchestrates: ['search_portfolio', 'list_portfolio_facets'],
    output: [
      'The comparable engagements, each with why it is comparable.',
      'What each one implies for the deal in hand.',
    ],
    availability: PROMPT_LINE,
    related: ['search_portfolio', 'gst_diligence_handoff_memo'],
  },
  {
    id: 'gst_irl_create',
    group: 'Prompts',
    type: 'Prompt',
    usedIn: ['irl-issue'],
    gloss:
      'Assembles the blank information-gathering ask GST hands a target before diligence tools can run, configured for the engagement and delivered as a workbook to fill in.',
    args: [
      {
        name: 'targetName / companyName / projectName',
        desc: 'strings, optional. Composed into the workbook title.',
      },
      {
        name: 'transactionContext',
        desc: 'enum, optional. sell-side · buy-side · value-creation · unknown. Also fires the authored skip-if directives.',
      },
      { name: 'includeSections', desc: 'array of two-digit section ids, optional.' },
      {
        name: 'excludeRequests',
        desc: 'array of NN-II keys, optional. See list_irl_requests for the keys.',
      },
      { name: 'customRequests', desc: 'string, optional. Extra per-section requests.' },
      { name: 'showCanonicalReference', desc: 'boolean, optional.' },
    ],
    orchestrates: ['generate_information_request_list_xlsx', 'gst://library/…'],
    output: [
      'The configured request list, section by section.',
      'The workbook to send, plus the Hub page for a one-click download.',
    ],
    noteTitle: 'This one issues, it does not answer',
    note: 'The workbook comes back empty, for the target to complete. When the answers are already in your own evidence, a data room export or filings or an earlier conversation, use gst_irl_populate instead: it produces the same workbook already populated, and leaves only the rows it could not support blank.',
    availability: PROMPT_LINE,
    related: ['generate_information_request_list_xlsx', 'list_irl_requests', 'gst_irl_populate'],
  },
  {
    id: 'gst_irl_populate',
    group: 'Prompts',
    type: 'Prompt',
    usedIn: ['irl-fill'],
    gloss:
      'Populates the request list from evidence already in the conversation, a data room export, filings, or prior sessions, instead of waiting for the target to return one. Stops at the artifact for the operator to review.',
    args: [
      {
        name: 'targetName / companyName / projectName',
        desc: 'strings, optional. Composed into the workbook title.',
      },
      {
        name: 'transactionContext',
        desc: 'enum, optional. sell-side · buy-side · value-creation · unknown.',
      },
      {
        name: 'includeSections / excludeRequests / customRequests',
        desc: 'The same scoping the blank generator takes.',
      },
    ],
    orchestrates: ['fill_information_request_list_xlsx', 'gst://library/…'],
    output: [
      'An inventory of the evidence found, before anything is written.',
      'The populated workbook, each answered row carrying the source it rests on.',
      'The blank rows, which are the remaining ask to the target.',
    ],
    noteTitle: 'It stops at the artifact',
    note: 'The prompt does not run the diligence sweep. The operator reviews the populated workbook first, then runs gst_irl_sweep on it exactly as for a target-returned one. Re-running with new evidence extends the file rather than overwriting it.',
    availability: PROMPT_LINE,
    related: ['fill_information_request_list_xlsx', 'gst_irl_extract', 'gst_irl_sweep'],
  },
  {
    id: 'gst_irl_extract',
    group: 'Prompts',
    type: 'Prompt',
    usedIn: ['irl-extract'],
    gloss:
      'Distills a populated request list into a portable extract record plus the per-tool payloads derived from it. Makes no tool calls, so the record can be saved and pasted into later sessions and other GST prompts.',
    args: [
      {
        name: 'filledIrl',
        desc: 'string, optional. The populated list, entire markdown body. Omit it when the list is attached to the conversation or was pasted earlier.',
      },
    ],
    argNote:
      'Pasting into a single-line client field collapses the line breaks. The run still works: what the record is checked against normalizes whitespace before matching.',
    output: [
      'The extract record: one fact per answered row, with the section it came from.',
      'Derived payloads for the nine analysis tools, projected from the record without calling any of them, ready to hand over in a later session.',
      'A self-dating header recording when the record was made and whether the server witnessed the time.',
    ],
    noteTitle: 'It calls nothing',
    note: 'This prompt runs no tools. It reads the list and produces a record, which is what makes the record portable: it survives the conversation, and any later session can drive the analysis tools from it. For the full sweep in one turn, use gst_irl_sweep.',
    availability: PROMPT_LINE,
    related: ['gst_irl_sweep', 'gst_irl_populate', 'gst_target_quick_look'],
  },
  {
    id: 'gst_irl_sweep',
    group: 'Prompts',
    type: 'Prompt',
    usedIn: ['irl-sweep'],
    gloss:
      'Ingests a populated request list and drives every applicable Hub tool to a unified engagement dossier, sections (A) through (J).',
    args: [
      {
        name: 'filledIrl',
        desc: 'string, optional. The populated Information Request List, entire markdown body. Omit when the list is attached to the conversation or pasted earlier.',
      },
    ],
    argNote:
      'Target name and engagement context are inferred from the list itself; the only hard stop is no list present anywhere, a blank-template halt, or tools unavailable.',
    orchestrates: [
      'generate_diligence_agenda',
      'list_portfolio_facets',
      'search_portfolio',
      'list_regulation_facets',
      'search_regulations',
      'compute_techpar',
      'assess_infrastructure_cost_governance',
      'estimate_tech_debt_cost',
      'search_radar',
    ],
    output: [
      '(A) Target snapshot · (B) Diligence agenda · (C) Architecture and paradigm assessment.',
      '(D) Infrastructure cost governance · (E) Technical debt · (F) Regulatory exposure.',
      '(G) Comparable engagements · (H) Market signal · (I) Synthesis and recommendation.',
      '(J) Gaps and assumptions. The audit surface of the run: unanswered rows, elided tools, every assumption and conversion applied.',
      'Every tool-backed section closes with its deeplink, copied verbatim.',
    ],
    noteTitle: 'Trust the operator',
    note: 'A populated GST request list is trusted input: no provenance apparatus, no hashing, no citation loops. The model-authored gap list is what keeps the run honest. For the portable extract record without tool calls, use gst_irl_extract.',
    availability:
      'Included in all tiers. The market-signal section renders only where radar tools are granted.',
    related: ['gst_irl_populate', 'gst_irl_extract', 'gst_irl_ingestion'],
  },
  {
    id: 'gst_irl_ingestion',
    group: 'Prompts',
    type: 'Prompt',
    usedIn: ['irl-sweep'],
    gloss:
      'The provenance-instrumented ingestion workflow: the same dossier sweep, plus hashing, citation verification, and a structured audit envelope.',
    args: [
      { name: 'filledIrl', desc: 'string, optional. The populated list.' },
      {
        name: 'mode',
        desc: 'enum. full runs the whole sweep; extract-only produces the record and stops.',
      },
      {
        name: 'auditLevel',
        desc: 'enum. standard · enhanced · debug. Selects how much of the audit surface comes back.',
      },
    ],
    orchestrates: [
      'generate_diligence_agenda',
      'list_portfolio_facets',
      'search_portfolio',
      'list_regulation_facets',
      'search_regulations',
      'compute_techpar',
      'assess_infrastructure_cost_governance',
      'estimate_tech_debt_cost',
      'search_radar',
      'compose_dossier_envelope',
    ],
    output: [
      'The same dossier sections gst_irl_sweep produces.',
      'A provenance footer: what was verified, what was not, and what was assumed.',
      'The audit envelope, at the level the run asked for.',
    ],
    noteTitle: 'Coexists with gst_irl_sweep',
    note: 'Both are registered. Reach for gst_irl_sweep when the operator vouches for the document, which is the usual case. Reach for this one when the run has to carry its own citation-level audit trail.',
    availability: PROMPT_LINE,
    related: ['gst_irl_sweep', 'compose_dossier_envelope', 'validate_irl_provenance'],
  },
  {
    id: 'gst_architecture_layer_review',
    group: 'Prompts',
    type: 'Prompt',
    usedIn: ['architecture'],
    gloss:
      "Walks a target through GST's five architectural layers, software, operations, product, organization, and industry, and surfaces the risks that sit in each.",
    args: [
      {
        name: 'targetSummary',
        desc: "Free text describing the target's architecture: product and software stack, infrastructure and hosting, data estate, engineering org shape, and industry context. The more architectural detail supplied, the sharper the per-layer read.",
      },
    ],
    orchestrates: ['gst://library/…'],
    output: [
      'A read per layer, with the risks that layer carries for this target.',
      'How those risks cascade between layers, which is where the framework earns its keep.',
    ],
    availability: PROMPT_LINE,
    related: ['gst://library/…', 'gst_target_quick_look'],
  },
  {
    id: 'gst_regulatory_exposure_brief',
    group: 'Prompts',
    type: 'Prompt',
    usedIn: ['reg'],
    gloss:
      'Compiles the regulatory frameworks that apply to a target, with summaries and a resource link per framework, so counsel starts from an exposure list rather than an open question.',
    args: [
      {
        name: 'targetJurisdictions',
        desc: 'array, required. Where the target operates, collects, or processes data, for example ["eu", "us-ca"].',
      },
      {
        name: 'dataCategories',
        desc: 'array, required. Which categories to assess: data-privacy · ai-governance · industry-compliance · cybersecurity.',
      },
      {
        name: 'productType',
        desc: 'string, required. Informs which frameworks apply beyond jurisdiction alone.',
      },
    ],
    orchestrates: ['search_regulations', 'list_regulation_facets', 'gst://regulations/…'],
    output: [
      'The applicable frameworks, grouped by jurisdiction.',
      'A summary per framework, taken from the corpus rather than from memory.',
      'The resource URI for each, so the full document can be read next.',
    ],
    availability: PROMPT_LINE,
    related: ['search_regulations', 'gst://regulations/…', 'list_regulation_facets'],
  },
  {
    id: 'gst_radar_brief_today',
    group: 'Prompts',
    type: 'Prompt',
    usedIn: ['radar'],
    gloss:
      "The day's radar, briefed: the most recent annotated items summarized in the GST Take voice, for a morning read or a pre-meeting scan.",
    args: [
      {
        name: 'category',
        desc: 'enum, optional. pe-ma · enterprise-tech · ai-automation · security. Omit for all categories.',
      },
    ],
    orchestrates: ['gst://radar/…'],
    output: [
      'The recent annotated items, with what GST makes of each.',
      'A provenance line: radar items are not independently verified, so confirm against the source before acting or sharing with a client.',
    ],
    availability: RADAR_TIER_LINE,
    related: ['get_latest_insights', 'search_radar', 'gst://radar/…'],
  },

  // ------------------------------------------------------------ Resources ---
  {
    id: 'gst://library/…',
    group: 'Resources',
    type: 'Resource family',
    usedIn: ['architecture', 'handover'],
    count: 4,
    gloss:
      "The four reference guides behind GST's diligence method, readable in full: the architecture framework, the data room structure, the information request list, and the mapping from request to tool input.",
    uri: 'gst://library/<guide>',
    returns: [
      'Business and technology architectures. The five layers and how they cascade into business outcomes.',
      'Virtual data room structure. Nine folder categories, with the common pitfalls.',
      'Information request list. The intake checklist, organized by the same taxonomy.',
      'Request-to-tool mapping. Which line of a completed list feeds which tool input.',
    ],
    availability: RESOURCE_LINE,
    related: ['list_irl_requests', 'gst_architecture_layer_review', 'gst_irl_create'],
  },
  {
    id: 'gst://regulations/…',
    group: 'Resources',
    type: 'Resource family',
    usedIn: ['reg'],
    count: 123,
    gloss: '123 framework documents, one per regulatory framework, each readable in full.',
    uri: 'gst://regulations/<jurisdiction>/<framework>',
    returns: [
      'One document per framework: requirements, penalties, effective dates.',
      'Four categories: data privacy · AI governance · cybersecurity · industry compliance.',
    ],
    noteTitle: 'Resources are host-loaded',
    note: 'A prompt cannot read a resource. The host application loads resources as context, so they are in the conversation before the model needs them; workflows that need canonical text embed it server-side.',
    availability: RESOURCE_LINE,
    related: ['search_regulations', 'list_regulation_facets', 'gst_regulatory_exposure_brief'],
  },
  {
    id: 'gst://radar/…',
    group: 'Resources',
    type: 'Resource family',
    usedIn: ['radar'],
    count: 6,
    gloss:
      'Six feeds: the annotated highlights, the whole wire, and the wire split by each of the four categories.',
    uri: 'gst://radar/<tier>/<latest|category>',
    returns: [
      'The annotated tier, each item carrying its GST Take.',
      'The wire, whole or filtered to private equity and M&A, enterprise technology, AI and automation, or security.',
    ],
    availability: RADAR_TIER_LINE,
    related: ['search_radar', 'get_latest_insights', 'gst_radar_brief_today'],
  },

  // ----------------------------------------------------------- Operations ---
  {
    id: 'Authentication',
    group: 'Operations',
    type: 'Operations',
    gloss:
      'OAuth 2.1 for both shapes of client: client credentials for a machine client, and authorization code with PKCE for a person connecting a desktop AI client.',
    returns: [
      'Machine clients receive a client id and secret, and exchange them for a short-lived access token.',
      'A person connecting a desktop client is taken through a consent screen and never handles a token by hand.',
      'Every call carries its token; there is no anonymous surface beyond the health check.',
    ],
    noteTitle: 'Clients are registered, not self-service',
    note: 'There is no dynamic client registration and no user directory. Credentials are issued through a conversation with GST, which is also how scopes and a tier get set correctly the first time.',
    availability:
      'Request access to be provisioned. See the request-access path on the MCP Server page.',
    related: ['Rate limits', 'Status'],
  },
  {
    id: 'Rate limits',
    group: 'Operations',
    type: 'Operations',
    gloss:
      'Per-client capability ceilings by tier, applied per minute and per day, with the radar tools metered separately from the analysis tools.',
    returns: [
      "Every response carries standard rate-limit headers, including the caller's own ceilings, so a client can self-diagnose its budget without first hitting a limit.",
      'A warning surfaces as the budget approaches its ceiling, ahead of any refusal.',
      'Over the ceiling, calls are refused with the time to wait rather than failing opaquely.',
    ],
    noteTitle: 'Tunable, not contractual',
    note: 'These are abuse and capacity limits, adjustable per client, not ratified service quotas. No rate commitment is contractually made. The current per-tier ceilings are published on the MCP Server page.',
    availability: 'Applies to every tier. A tier change takes effect on the next window.',
    related: ['Authentication', 'Status'],
  },
  {
    id: 'Status',
    group: 'Operations',
    type: 'Operations',
    gloss:
      'A public status page over the same health data the server reports: dependency state, per-tool latency, and request volume.',
    returns: [
      'Dependency status, including whether the intelligence feed is reachable.',
      'Per-tool latency and request volume.',
      'The build actually serving traffic.',
    ],
    availability: 'Public, no credentials required.',
    related: ['Authentication', 'Rate limits'],
  },
];

export interface JobStep {
  /** A capability id from CAPABILITIES. This is what the step links to. */
  capabilityId: string;
  /** The step's type label, shown above the identifier. */
  kind: 'Prompt' | 'Tool' | 'Resource';
  /** One line on what this step does in this job. */
  gloss: string;
  /**
   * Resource steps only: the ONE document under the family this step means.
   *
   * The registry documents three resource FAMILIES, not 133 documents, so a
   * resource step can only link to its family's contract. Without this field
   * two steps that mean different articles render the same identifier and the
   * same anchor: `Review the architecture` and `Handover an assessment` both
   * showed `gst://library/…` and both pointed at `#cap-gst-library`, which is
   * a reader being told two different things are one thing.
   *
   * So the step DISPLAYS this URI and still links to the family pane, which
   * names the document in its returns list. Omit it where the step genuinely
   * means the whole family: the regulatory job reads across frameworks, so
   * `gst://regulations/…` is the honest identifier there.
   *
   * Pinned to server source by the parity suite: every value must be a URI the
   * server actually serves, under the family it is attached to.
   */
  documentUri?: string;
}

export interface Job {
  key: JobKey;
  title: string;
  /** The job in the reader's terms, not the server's. */
  description: string;
  steps: JobStep[];
  /**
   * The artifact that lands at the end, named as a thing rather than a status.
   *
   * This is the field that makes the lens a JOB list rather than a capability
   * grouping: a reader choosing between two entry points is choosing between
   * two deliverables, and the steps alone do not say what either produces.
   * Optional on the type so a job can be added before its output is settled,
   * but every job below carries one.
   */
  youGetBack?: string;
}

/**
 * The twelve jobs, in the order a deal tends to run them.
 *
 * These groupings are an EDITORIAL layer over the registry, not a registry
 * fact: the prompts and the tools around them are re-keyed here by the
 * analyst's task rather than by capability type. The parity suite pins every
 * `capabilityId` to a real capability, so a server rename breaks this list
 * loudly, but the titles, blurbs and `youGetBack` lines are authored and are
 * expected to be revised as the product learns which jobs readers actually
 * arrive with.
 *
 * Copy here is governed by the same rules as CAPABILITIES (see the module
 * header) and walked by the same guard, em dash ban included.
 */
export const JOBS: readonly Job[] = [
  {
    key: 'screen',
    title: 'Screen an unfamiliar target',
    description:
      'A target profile in, a first-look read out. Cost governance, unit economics, debt range and regulatory exposure, in one conversation.',
    youGetBack: 'A one-page brief, with every norm-derived figure declared.',
    steps: [
      {
        capabilityId: 'gst_target_quick_look',
        kind: 'Prompt',
        gloss: 'Run the four-analysis quick look from the argument form.',
      },
      {
        capabilityId: 'compute_techpar',
        kind: 'Tool',
        gloss: 'Benchmarks R&D spend against the stage cohort.',
      },
      {
        capabilityId: 'estimate_tech_debt_cost',
        kind: 'Tool',
        gloss: 'Returns annual cost, share of ARR, payback and DORA tier.',
      },
    ],
  },
  {
    key: 'kickoff',
    title: 'Shape a technology diligence before the LOI',
    description:
      'Thirteen dimensions in, a prioritised agenda out. Supply only the target name and the agenda widens conservatively rather than guessing.',
    youGetBack: 'A starter agenda with attention areas, ready for the wizard.',
    steps: [
      {
        capabilityId: 'gst_diligence_kickoff',
        kind: 'Prompt',
        gloss: 'Builds the agenda from sales notes or a bare target name.',
      },
      {
        capabilityId: 'generate_diligence_agenda',
        kind: 'Tool',
        gloss: 'Called by the model as the conversation needs it.',
      },
    ],
  },
  // The information-request round trip is FOUR jobs, not one. They were one
  // entry, `Issue and ingest an IRL`, whose four steps were four separate
  // undertakings sharing a document: a reader with nothing yet needs to issue
  // the blank ask, a reader holding a data room needs to answer it without
  // waiting on anyone, a reader with a filled file wants a record that outlives
  // the session, and a reader ready to analyse wants the dossier. Different
  // inputs, different outputs, days apart, often different people. Collapsing
  // them into one row asked a reader to open a job to find out that only a
  // quarter of it was theirs, and hid the artifact each one actually returns
  // behind a single line naming only the last.
  {
    key: 'irl-issue',
    title: 'Create an information request list for a company',
    description:
      'The blank ask GST hands a target before any diligence tool can run, scoped to the engagement and delivered as a workbook to fill in.',
    youGetBack: 'A configured workbook to send, plus the Hub page to download it from.',
    steps: [
      {
        capabilityId: 'gst_irl_create',
        kind: 'Prompt',
        gloss: 'Configures the list for the engagement and issues it blank.',
      },
      {
        capabilityId: 'generate_information_request_list_xlsx',
        kind: 'Tool',
        gloss: 'Builds the workbook the prompt hands over.',
      },
      {
        capabilityId: 'list_irl_requests',
        kind: 'Tool',
        gloss: 'The question keys, which is how a question gets dropped from the ask.',
      },
    ],
  },
  {
    key: 'irl-fill',
    title: 'Populate a request list from available information',
    description:
      'The same list answered from what you already hold, a data room export, filings, or an earlier session, so the ask left to the target is only what is genuinely missing.',
    youGetBack: 'A populated workbook, each answer sourced, the blanks left as the ask.',
    steps: [
      {
        capabilityId: 'gst_irl_populate',
        kind: 'Prompt',
        gloss: 'Inventories the evidence first, then writes the rows it can support.',
      },
      {
        capabilityId: 'fill_information_request_list_xlsx',
        kind: 'Tool',
        gloss: 'Writes each answer and the source it rests on into the row.',
      },
    ],
  },
  {
    key: 'irl-extract',
    title: 'Extract useful context from an IRL',
    description:
      'One fact per answered row, plus the payloads the analysis tools take, projected without calling any of them.',
    youGetBack: 'A portable record, self-dated, that a later session can drive the tools from.',
    steps: [
      // One step, and correctly so: the prompt makes no tool calls, which is
      // the property that makes the record portable. The provenance tools
      // belong to the sweep below, where something actually mints a hash.
      {
        capabilityId: 'gst_irl_extract',
        kind: 'Prompt',
        gloss: 'Reads the list and produces the record. Calls nothing.',
      },
    ],
  },
  {
    key: 'irl-sweep',
    title: 'Drive company assessment from a populated IRL',
    description:
      'Every applicable engine driven over one populated list in a single turn, with whatever it could not answer named rather than filled in.',
    youGetBack: 'A partner-level dossier, sections (A) to (J), gaps named.',
    steps: [
      {
        capabilityId: 'gst_irl_sweep',
        kind: 'Prompt',
        gloss: 'The usual route: the operator vouches for the document.',
      },
      {
        capabilityId: 'gst_irl_ingestion',
        kind: 'Prompt',
        gloss: 'The same sweep instrumented, where the run must carry its own audit trail.',
      },
      {
        capabilityId: 'validate_irl_provenance',
        kind: 'Tool',
        gloss: 'Reports which cited claims hold, before they reach a deliverable.',
      },
    ],
  },
  {
    key: 'spend',
    title: 'Benchmark the spend',
    description:
      'Whether the technology cost base is defensible for the stage, and where the governance gaps sit underneath it.',
    youGetBack: 'A zone verdict, a maturity score, and the investigation list.',
    steps: [
      {
        capabilityId: 'compute_techpar',
        kind: 'Tool',
        gloss: 'Stage cohort comparison, with the mode stated explicitly.',
      },
      {
        capabilityId: 'assess_infrastructure_cost_governance',
        kind: 'Tool',
        gloss: 'Twenty questions across six domains, where "not sure" is a real signal.',
      },
    ],
  },
  {
    key: 'architecture',
    title: 'Review the architecture',
    description:
      "GST's five-layer framework applied to the target, with the canonical layer definitions used verbatim.",
    youGetBack: 'A per-layer memo plus the risks that cascade between layers.',
    steps: [
      {
        capabilityId: 'gst_architecture_layer_review',
        kind: 'Prompt',
        gloss: 'Walks the layers in the order the article defines.',
      },
      {
        capabilityId: 'gst://library/…',
        documentUri: 'gst://library/business-architectures',
        kind: 'Resource',
        gloss: 'Grounds the review in the canonical architectures article.',
      },
    ],
  },
  {
    key: 'reg',
    title: 'Map the regulatory exposure',
    description:
      'Jurisdictions and data categories in, applicable frameworks out, with obligations read from the search results rather than recalled.',
    youGetBack: 'A citation-anchored brief with cross-jurisdictional themes.',
    steps: [
      {
        capabilityId: 'gst_regulatory_exposure_brief',
        kind: 'Prompt',
        gloss: 'One search per jurisdiction and category pair.',
      },
      {
        capabilityId: 'search_regulations',
        kind: 'Tool',
        gloss: 'Returns scope, key requirements and penalty band.',
      },
      {
        capabilityId: 'list_regulation_facets',
        kind: 'Tool',
        gloss: 'Recovery call when a jurisdiction id fails to resolve.',
      },
      {
        capabilityId: 'gst://regulations/…',
        kind: 'Resource',
        gloss: 'Read the framework documents behind the numbers.',
      },
    ],
  },
  {
    key: 'precedent',
    title: 'Find comparable engagements',
    description:
      'Which past engagements rhyme with this deal, and what each one teaches, framed as guidance rather than history.',
    youGetBack: 'Three to five comparables, each with its lesson and a deeplink.',
    steps: [
      {
        capabilityId: 'gst_comparable_engagements_memo',
        kind: 'Prompt',
        gloss: 'Selects on two or more shared attributes.',
      },
      {
        capabilityId: 'list_portfolio_facets',
        kind: 'Tool',
        gloss: 'Enumerates valid themes before the search runs.',
      },
      {
        capabilityId: 'search_portfolio',
        kind: 'Tool',
        gloss: 'One batched call across the theme array.',
      },
    ],
  },
  {
    key: 'radar',
    title: 'Check the news',
    description:
      'What moved in your sectors, in GST Take voice, with the provenance framing that says it is aggregated third-party reporting.',
    youGetBack: 'A briefing you can take into the morning call.',
    steps: [
      {
        capabilityId: 'gst_radar_brief_today',
        kind: 'Prompt',
        gloss: 'Reads the annotated tier, cache only.',
      },
      {
        capabilityId: 'search_radar',
        kind: 'Tool',
        gloss: 'Live category filter across the feed.',
      },
      {
        capabilityId: 'gst://radar/…',
        documentUri: 'gst://radar/fyi/latest',
        kind: 'Resource',
        gloss: 'Pin the feed to keep the annotated tier in context.',
      },
    ],
  },
  {
    key: 'handover',
    title: 'Handover an assessment',
    description:
      'Agenda, comparables and VDR follow-ups combined into one document the deal team can act on without reading the tool output.',
    youGetBack: 'A handoff memo, not a stitched-together set of results.',
    steps: [
      {
        capabilityId: 'gst_diligence_handoff_memo',
        kind: 'Prompt',
        gloss: 'Hand the result onward in memo form.',
      },
      {
        capabilityId: 'gst://library/…',
        documentUri: 'gst://library/vdr-structure',
        kind: 'Resource',
        gloss: 'Canonical VDR folder labels, used verbatim.',
      },
    ],
  },
];
