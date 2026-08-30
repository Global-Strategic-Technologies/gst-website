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

/** Workflow keys, used by `usedIn` and by the Workflows lens. */
export type WorkflowKey = 'screen' | 'irl' | 'spend' | 'reg';

export interface CapabilityArg {
  /** Argument name, verbatim wire casing. */
  name: string;
  /** One-line description, written for a reader deciding what to pass. */
  desc: string;
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
  /** A copyable call, using real enum values. */
  example?: string;
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
  usedIn?: WorkflowKey[];
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
    usedIn: ['screen'],
    gloss:
      'Turns a target profile into a prescriptive diligence agenda: the topics to cover, the questions to ask under each, and the attention areas the profile makes material.',
    args: [
      {
        name: 'transactionType',
        desc: 'enum. full-acquisition · majority-stake · business-integration · carve-out · venture-series.',
      },
      {
        name: 'productType',
        desc: 'enum. b2b-saas · b2c-marketplace · on-premise-enterprise · deep-tech-ip · tech-enabled-service.',
      },
      {
        name: 'techArchetype',
        desc: 'enum. modern-cloud-native · hybrid-legacy · self-managed-infra · datacenter-vendor. The largest single driver of which questions surface.',
      },
      {
        name: 'headcount',
        desc: 'ordinal enum. Company size band. Questions can gate on a minimum band rather than an exact match.',
      },
      { name: 'revenueRange', desc: 'ordinal enum. Revenue band, gated the same way.' },
      { name: 'growthStage', desc: 'enum. Where the company sits in its funding and growth arc.' },
      { name: 'companyAge', desc: 'ordinal enum. Age band, gated the same way.' },
      {
        name: 'geographies',
        desc: 'enum array. The only multi-select input. Two or more specific regions auto-adds multi-region.',
      },
      { name: 'businessModel', desc: 'enum. How the target earns.' },
      { name: 'scaleIntensity', desc: 'enum. Load and growth pressure on the platform.' },
      {
        name: 'transformationState',
        desc: 'enum. How much change the estate is already carrying.',
      },
      { name: 'dataSensitivity', desc: 'enum. Drives the privacy and security question set.' },
      { name: 'operatingModel', desc: 'enum. How engineering and operations are organized.' },
    ],
    argNote:
      'All thirteen dimensions are required: the engine has no defaults, and a missing field is rejected before it runs. Each accepts a fixed identifier set; call the tool with an invalid value and the error names the valid ones.',
    example:
      'generate_diligence_agenda({ "transactionType": "carve-out", "productType": "b2b-saas", "techArchetype": "hybrid-legacy", … })',
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
    gloss:
      "Searches GST's anonymized engagement record by free text, theme, and engagement side, so a current deal can be framed against work already done.",
    args: [
      {
        name: 'search',
        desc: 'string, optional. Free text matched against code name, industry, summary, and technologies. Substring match, not fuzzy.',
      },
      {
        name: 'theme',
        desc: 'string, optional. One of the values list_portfolio_facets returns, or "all". Defaults to "all".',
      },
      {
        name: 'engagement',
        desc: 'string, optional. Buy-Side · Sell-Side · all. Defaults to "all".',
      },
    ],
    argNote:
      'The empty call returns every engagement. There is no limit argument: the tool mirrors the website filter surface exactly, and the website renders the full set.',
    example: 'search_portfolio({ "search": "carve-out", "engagement": "Buy-Side" })',
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
    gloss:
      'Lists the values the portfolio filters accept. Call it before search_portfolio rather than guessing a theme name.',
    argNote: 'Takes no arguments.',
    example: 'list_portfolio_facets({})',
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
      },
      {
        name: 'category',
        desc: 'string or string array, optional. data-privacy · ai-governance · cybersecurity · industry-compliance.',
      },
      {
        name: 'query',
        desc: 'string, optional. Matches name, curated aliases, summary, and id. Common short forms resolve to the statute they name.',
      },
      { name: 'limit', desc: 'number, optional. Default 20, maximum 120.' },
    ],
    argNote:
      'Keep limit at or near its default and narrow by category. Broad multi-jurisdiction queries return very large responses, and raising the limit is how a result outgrows a client rather than how it gets more useful. When an array holds more than one value, the response omits that filter from its deeplink, because the website uses single-select chips.',
    example: 'search_regulations({ "jurisdiction": "eu", "category": "ai-governance" })',
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
    gloss:
      'Lists the jurisdictions and categories the regulatory corpus actually indexes, plus the total framework count. The recovery call when a jurisdiction code does not resolve.',
    argNote: 'Takes no arguments.',
    example: 'list_regulation_facets({})',
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
      },
      {
        name: 'companyStage',
        desc: 'enum, optional. Canonical funding stage (seed · series-a · series-b · series-c · pe · enterprise) or one of the four native bands. Adds a benchmark band; never changes the score.',
      },
    ],
    argNote:
      'The scale is 0 Not in place · 1 Ad hoc · 2 Established · 3 Optimized, with -1 meaning Not sure. The map is sparse: missing questions count as zero, so a partial assessment reports an honest absence of information rather than failing. Only an explicit -1 is reported as skipped.',
    example:
      'assess_infrastructure_cost_governance({ "answers": { "q1_1": 2, "q1_2": 1, "q2_1": 0, … }, "companyStage": "series-b" })',
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
    usedIn: ['spend'],
    gloss:
      'Benchmarks total technology cost against stage-adjusted ranges and projects a 36-month trajectory. Wraps the TechPar engine behind the Hub wizard.',
    args: [
      {
        name: 'arr',
        desc: 'number > 0. Annual recurring revenue, dollars. Drives every percentage-of-revenue calculation.',
      },
      {
        name: 'stage',
        desc: 'enum. Canonical funding stage: seed · series-a · series-b · series-c · pe · enterprise. Selects the per-stage benchmark band.',
      },
      {
        name: 'mode',
        desc: 'enum, no default. quick reads rdOpEx directly; deepdive synthesizes R&D OpEx as engCost + prodCost + toolingCost.',
      },
      { name: 'capexView', desc: 'enum. cash includes rdCapEx in totals; gaap excludes it.' },
      {
        name: 'growthRate',
        desc: 'number. Annual revenue growth, as a percentage; drives the 36-month projection.',
      },
      {
        name: 'exitMultiple',
        desc: 'number, zero or more. Translates the cumulative gap to exit value. 12x is the SaaS convention.',
      },
      {
        name: 'infraHostingAnnual',
        desc: 'number, zero or more. Annual infrastructure and hosting cost, dollars. Must be above zero.',
      },
      {
        name: 'infraPersonnel',
        desc: 'number, zero or more. Annual infrastructure personnel cost, dollars.',
      },
      {
        name: 'rdOpEx',
        desc: 'number, zero or more. R&D OpEx. Read in quick mode; discarded in deepdive.',
      },
      { name: 'rdCapEx', desc: 'number, zero or more. Capitalized R&D.' },
      {
        name: 'engFTE',
        desc: 'number, zero or more. Engineering headcount; yields revenue per engineer.',
      },
      {
        name: 'engCost',
        desc: 'number, zero or more. Annual engineering personnel cost. deepdive only.',
      },
      {
        name: 'prodCost',
        desc: 'number, zero or more. Annual product personnel cost. deepdive only.',
      },
      { name: 'toolingCost', desc: 'number, zero or more. Annual tooling cost. deepdive only.' },
    ],
    argNote:
      'All 14 fields are required in both modes; the engine ignores the fields the selected mode does not read. All money fields are annual dollars on one currency basis. A zero arr or infraHostingAnnual returns invalid-input, never a stack trace.',
    example:
      'compute_techpar({ "arr": 12000000, "stage": "series-a", "mode": "quick", "capexView": "gaap", … })',
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
    usedIn: ['spend'],
    gloss:
      'Estimates the annual carrying cost of accumulated technical debt from team size, salary, maintenance burden, and delivery cadence.',
    args: [
      {
        name: 'teamSize',
        desc: 'integer above zero. Engineering headcount. A direct multiplier on the carrying cost.',
      },
      {
        name: 'salary',
        desc: 'number above zero. Average fully loaded annual engineering salary, dollars.',
      },
      {
        name: 'maintenanceBurdenPct',
        desc: 'number 0 to 100. Share of engineering capacity consumed by maintenance and debt servicing. The headline input.',
      },
      {
        name: 'deployFrequency',
        desc: 'enum. Multiple/day · Daily · Weekly · Bi-weekly · Three-week · Monthly · Quarterly+ · Bi-annually · Annually. Sets the DORA tier and the velocity multiplier.',
      },
      { name: 'incidents', desc: 'integer, zero or more. Production incidents per month.' },
      {
        name: 'mttrHours',
        desc: 'number, zero or more. Mean time to recovery, hours per incident.',
      },
      {
        name: 'remediationBudget',
        desc: 'number, zero or more. Capital available for debt paydown, dollars.',
      },
      {
        name: 'arr',
        desc: 'number, zero or more. Annual recurring revenue, used to express the cost as a share of revenue.',
      },
      {
        name: 'remediationPct',
        desc: 'number 0 to 100. Expected reduction in debt cost from the remediation.',
      },
      {
        name: 'contextSwitchOn',
        desc: 'boolean. Whether to model the context-switching overhead surcharge.',
      },
    ],
    argNote:
      'These are business values, not wizard slider positions: pass the precision you actually have. An arr of zero is allowed and reports the revenue share as zero rather than dividing by it.',
    example:
      'estimate_tech_debt_cost({ "teamSize": 24, "salary": 165000, "maintenanceBurdenPct": 35, "deployFrequency": "Monthly", … })',
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
    gloss:
      'Builds the blank information request list as an XLSX workbook, configured for the engagement. This is the ask GST hands a target before diligence tools can run.',
    args: [
      { name: 'targetName', desc: 'string, optional. The target the list is addressed to.' },
      { name: 'companyName', desc: 'string, optional. Composed into the workbook title.' },
      {
        name: 'projectName',
        desc: 'string, optional. Composed into the title alongside companyName.',
      },
      {
        name: 'transactionContext',
        desc: 'enum, optional. sell-side · buy-side · value-creation · unknown. Fires the authored skip-if directives, removing questions that do not apply.',
      },
      {
        name: 'includeSections',
        desc: 'array of two-digit section ids, optional. Keeps whole sections. Defaults to all ten.',
      },
      {
        name: 'excludeRequests',
        desc: 'array of NN-II keys, optional. Removes individual questions. Call list_irl_requests to find the keys.',
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
    example:
      'generate_information_request_list_xlsx({ "targetName": "Northwind Analytics", "transactionContext": "buy-side" })',
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
      },
      {
        name: 'fileLocation',
        desc: 'What the answer rests on: a document reference and optional locator, or a bracketed origin note. A reference, never an excerpt.',
      },
      {
        name: 'comments',
        desc: 'The answer itself, as single-line prose. Under the extraction rules an entry here is a real answer, never a placeholder.',
      },
      {
        name: 'targetName',
        desc: 'string, optional. Same scoping arguments as the blank generator, minus productSummary.',
      },
      {
        name: 'transactionContext',
        desc: 'enum, optional. sell-side · buy-side · value-creation · unknown.',
      },
    ],
    argNote:
      'Requiring both a source and an answer on every entry is structural: a row cannot be answered without saying what it rests on. The shape of the reference is checked; whether the referenced document exists is deliberately not, because that is what the human reviewer verifies.',
    example:
      'fill_information_request_list_xlsx({ "targetName": "Northwind Analytics", "fills": [{ "ref": "0-03", "fileLocation": "10-K FY2025, Item 1A", "comments": "…" }] })',
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
    gloss:
      'Returns the canonical question set behind the information request list, with the key for each question. The only way to map "drop that question" onto the key the generator accepts.',
    argNote: 'Takes no arguments.',
    example: 'list_irl_requests({})',
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
    gloss:
      'Checks every claim in a draft back to the request list it cites, and reports which citations actually hold. Run it to see the verdicts before they are written into a deliverable.',
    args: [
      {
        name: 'citations',
        desc: 'array, required. Each entry pairs the claim path with the citation supporting it. A citation may be one string or up to eight.',
      },
      { name: 'irlBodyHash', desc: 'string. The hash from prepare_irl_body.' },
      { name: 'filledIrl', desc: 'string. The body itself, as an alternative to the hash.' },
    ],
    argNote:
      'One of irlBodyHash or filledIrl must be supplied; the body wins when both are. Prefer the hash: passing the body re-sends the whole document on every call. Where a claim is genuinely synthesized from several bullets, the array form checks each and aggregates conservatively, so one unverified element makes the whole citation unverified.',
    example:
      'validate_irl_provenance({ "irlBodyHash": "9f2c0a71b3d84e56", "citations": [{ "path": "…", "citation": "…" }] })',
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
      { name: 'mode', desc: 'enum. full · extract-only.' },
      {
        name: 'auditLevel',
        desc: 'enum. standard · enhanced · debug. Selects which audit blocks come back.',
      },
    ],
    argNote:
      'The array fields are required but may be empty; omitting one is an error, passing an empty array is not. This is the most common first-call mistake. The call fails outright if prepare_irl_body has not registered the body first, and the fix is always to register it again rather than retrying.',
    example:
      'compose_dossier_envelope({ "irlBodyHash": "9f2c0a71b3d84e56", "mode": "full", "auditLevel": "standard", "claims": [ … ], "gaps": [], … })',
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
    gloss:
      'Searches curated private equity, M&A, and enterprise-technology intelligence, filtered by category. Returns the annotated highlights and the wider wire in one feed.',
    args: [
      {
        name: 'category',
        desc: 'enum, optional. pe-ma · enterprise-tech · ai-automation · security. Omit for every category.',
      },
    ],
    argNote:
      'category is the only filter, and the unfiltered call is the largest response these tools produce. Pass a category when the intent is category-scoped, and prefer get_latest_insights when only the annotated tier is wanted.',
    example: 'search_radar({ "category": "pe-ma" })',
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
      { name: 'limit', desc: 'number, optional. 1 to 30, default 10.' },
      {
        name: 'category',
        desc: 'enum, optional. pe-ma · enterprise-tech · ai-automation · security.',
      },
    ],
    example: 'get_latest_insights({ "limit": 5, "category": "ai-automation" })',
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
    usedIn: ['screen'],
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
    usedIn: ['irl'],
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
    usedIn: ['irl'],
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
    usedIn: ['irl'],
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
    usedIn: ['irl'],
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

export interface WorkflowStep {
  /** A capability id from CAPABILITIES. */
  capabilityId: string;
  /** The step's type label, shown above the identifier. */
  kind: 'Prompt' | 'Tool' | 'Resource';
  /** One line on what this step does in this workflow. */
  gloss: string;
}

export interface Workflow {
  key: WorkflowKey;
  title: string;
  description: string;
  steps: WorkflowStep[];
}

export const WORKFLOWS: readonly Workflow[] = [
  {
    key: 'screen',
    title: 'Screen a target',
    description: 'From a target profile to an IC-ready starter agenda, in one conversation.',
    steps: [
      {
        capabilityId: 'gst_target_quick_look',
        kind: 'Prompt',
        gloss: 'Run the four-analysis quick look from the argument form.',
      },
      {
        capabilityId: 'generate_diligence_agenda',
        kind: 'Tool',
        gloss: 'Called by the model as the conversation needs it.',
      },
      {
        capabilityId: 'gst_diligence_handoff_memo',
        kind: 'Prompt',
        gloss: 'Hand the result onward in memo form.',
      },
    ],
  },
  {
    key: 'irl',
    title: 'Issue and ingest an IRL',
    description: 'The information-request round trip: issue, fill, extract, sweep.',
    steps: [
      {
        capabilityId: 'gst_irl_create',
        kind: 'Prompt',
        gloss: 'Issue the blank request list to the target.',
      },
      {
        capabilityId: 'gst_irl_populate',
        kind: 'Prompt',
        gloss: 'Or answer it yourself from evidence you already hold.',
      },
      {
        capabilityId: 'gst_irl_extract',
        kind: 'Prompt',
        gloss: 'Extract the filled file into a context record.',
      },
      {
        capabilityId: 'gst_irl_sweep',
        kind: 'Prompt',
        gloss: 'Nine engines, one dossier, sections (A) to (J).',
      },
    ],
  },
  {
    key: 'spend',
    title: 'Benchmark technology spend',
    description: 'Turn "engineering feels slow" into a number the board can act on.',
    steps: [
      {
        capabilityId: 'compute_techpar',
        kind: 'Tool',
        gloss: 'Stage-adjusted spend ranges, 36-month trajectory.',
      },
      {
        capabilityId: 'estimate_tech_debt_cost',
        kind: 'Tool',
        gloss: 'Annual carrying cost of technical debt.',
      },
      {
        capabilityId: 'assess_infrastructure_cost_governance',
        kind: 'Tool',
        gloss: 'Cloud cost governance maturity, six domains.',
      },
    ],
  },
  {
    key: 'reg',
    title: 'Scope regulatory exposure',
    description: 'Counsel starts from an exposure list instead of an open question.',
    steps: [
      {
        capabilityId: 'gst_regulatory_exposure_brief',
        kind: 'Prompt',
        gloss: 'Open the standing exposure review.',
      },
      {
        capabilityId: 'search_regulations',
        kind: 'Tool',
        gloss: 'Query 123 frameworks by jurisdiction, category, and date.',
      },
      {
        capabilityId: 'gst://regulations/…',
        kind: 'Resource',
        gloss: 'Read the framework documents behind the numbers.',
      },
    ],
  },
];
