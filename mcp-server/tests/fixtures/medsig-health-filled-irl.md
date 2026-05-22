# Information Request List — MedSig Health (returned, 2026-05-20)

> Prepared by Daniel Park, VP Engineering, on behalf of Christina Reyes (COO).
> Sources: internal finance dashboard (FY25-Q1 cut), engineering OKR doc, latest pentest report (Bishop Fox, Mar 2026), HRIS export.

## 00 — Basics

- Company name (legal entity + brand if different): MedSig Health, Inc. (Delaware C-corp); brand MedSig
- Engagement context: buy-side review on behalf of a strategic investor evaluating MedSig
- Annual recurring revenue (most recent quarter, plus prior 12 months if available): $45.2M Q1-FY26 annualized; $31.4M trailing 12 months on entry of FY25-Q4
- If applicable, funding stage and most recent round details (date, lead investor, headline valuation): Series-B closed 2024-11; $48M raised; lead Atomico; $310M post-money
- Business model (B2B SaaS, B2C subscription, enterprise license + services, marketplace, other): B2B SaaS, multi-year subscription with per-claim transactional uplift
- Geographies of operation (revenue presence; engineering presence if different): Revenue — US (East Coast, Texas, California ~88%), EU (Germany, France, Netherlands, Spain ~12%, expansion launched 2025); Engineering — US (Atlanta HQ, Austin satellite) + EU (Berlin, hired 2025-Q3)
- Headquarters jurisdiction (incorporation entity + primary operating location): Delaware incorporation; Atlanta, GA primary operations
- Company age (founding year; note any major pivot): Founded 2018; pivoted 2021 from a single-product denials-management tool to the four-module platform of today
- Total headcount (current and 12 months ago): 187 today; 121 twelve months ago
- Year-over-year growth rate (revenue, and headcount if a different signal): Revenue 62% YoY; headcount 55% YoY

## 01 — Product

- One-paragraph product description: what it does, who buys it, the problem it solves: MedSig is a revenue-cycle-management platform for hospital networks and large physician groups. It unifies insurance follow-up, denial appeals, payment posting, and AR recovery into one workflow — replacing 4-6 point tools that hospitals would otherwise stitch together. Buyers are CFOs and VP Revenue Cycle at 200-bed regional hospitals up to multi-site groups with 5k+ providers.
- Target market: primary buyer persona, segment, industry vertical(s): Mid-market hospital networks + large physician groups; industry vertical healthcare provider; buyer persona CFO / VP-RevCycle with IT veto
- Product roadmap snapshot: current-quarter priorities + next-12-month outlook: FY26-Q1 — denial-prediction ML model GA, EU multi-tenant tenancy isolation; next 12 months — claims-AI co-pilot, Epic + Cerner native integrations, EU prior-authorization module
- Top three features by adoption (DAU/MAU or equivalent engagement metric): (1) Denial Appeals workflow — 94% MAU of customer base; (2) Payment Posting auto-reconciler — 87% MAU; (3) AR Recovery dashboards — 73% MAU
- Customer profile: typical contract size, contract length, top concentration risk: $375k ACV median; 3-year terms; largest customer 7.2% of ARR (Texas hospital network — flagged at 5% threshold to board)
- Competitive landscape: three to five named alternatives and how the product differentiates: Waystar (incumbent), Change Healthcare (post-divestiture), R1 RCM (services-heavy), Experian Health (broad but shallow). MedSig differentiates on unified workflow + denial-prediction ML; Waystar wins on enterprise references, Change on payer connectivity breadth
- Operational scale: low (internal tools or small user base), moderate (thousands of users with steady growth), or high (millions of users or high transaction volume): moderate — ~14,000 daily active clinical-revenue users across 120 customers; 1.4M claims processed/day in production

## 02 — Software Architecture

- High-level architecture diagram (PDF or image): logical components, data flow, external integrations: Attached separately (`medsig-architecture-2026.pdf`); summary — React/Next.js front-end, Node.js/TypeScript API gateway, Python services for claim parsing + ML inference, Postgres (Aurora) primary store, Redshift warehouse, integrations with 47 payer APIs + Epic / Cerner via HL7 FHIR
- Technology stack: primary languages, frameworks, databases, infrastructure providers: TypeScript (Node 22), Python 3.12 (FastAPI), Next.js 14, Aurora Postgres 15, Redshift, AWS (US-East-1 + EU-Central-1), Terraform, GitHub Actions CI/CD
- Repository organization: monorepo vs. polyrepo, number of services, approximate lines of code: Polyrepo — 14 services across 14 repositories; ~480k LOC total (340k TS, 110k Python, 30k Terraform)
- Engineering FTE count: total and breakdown by team (product engineering, infrastructure / SRE, security, data): 58 total engineering — 38 product engineering (4 squads), 8 infrastructure / SRE, 3 security, 7 data + ML, 2 platform DX
- Product personnel cost: annual fully-loaded cost for product managers and designers, if tracked separately from engineering: $2.4M annual fully-loaded — 8 PMs + 5 designers
- Annual build and tooling cost: IDE licenses, CI/CD platform, observability tooling: $640k — GitHub Enterprise $96k, Datadog $310k, Vercel $48k, Sentry $36k, JetBrains/VS Code Pro licenses $72k, misc dev tooling $78k
- Third-party dependency overview: major licensed libraries or APIs + renewal exposure: 47 payer API contracts (renewed annually), Epic Open.Epic integration ($210k/yr), AWS HealthLake ($180k/yr), OpenAI API for claims-AI ($95k/yr — usage-billed, growing 18% MoM), Twilio for patient SMS ($72k/yr); no single dependency >$300k
- Most recent technical-debt assessment or code-quality report (SonarQube, CodeClimate, equivalent) if available: SonarQube run 2026-03-15 — overall Maintainability rating B, 14% duplicate-code, 1,847 code smells of which 312 critical. Bulk of debt concentrated in legacy denial-appeals service (rewrite scheduled FY26-Q3)

## 03 — Infrastructure & Operations

- Hosting model: cloud provider(s), self-hosted / managed mix, primary region(s): 100% AWS managed (no self-hosted); primary US-East-1 (N. Virginia), secondary EU-Central-1 (Frankfurt); active-active multi-region for EU customers only
- The past three months' monthly hosting and infrastructure spend: Feb $1.84M, Mar $1.92M, Apr $2.07M
- 12–24 months of hosting and infrastructure spend history if available: 24-month series available; monthly avg FY24 $1.05M → FY25 $1.55M → FY26 trending $1.95M+; growth tracks revenue but with 1.3x multiplier (rising unit economics question for diligence)
- Headcount dedicated to infrastructure operations (FTE equivalent): 8 FTE (5 SRE, 2 platform infra, 1 cloud-cost FinOps lead — hired 2025-Q4)
- Monitoring and alerting stack (tools, on-call rotation, escalation paths): Datadog (metrics + APM + RUM), Sentry (errors), PagerDuty (alerting + on-call); 2-tier on-call (primary 5 SRE rotation, secondary engineering lead), 15-min response SLA P0
- Deployment frequency to production (e.g., multiple/day, weekly, monthly, quarterly): Multiple per day on customer-facing services (avg 12 deploys/day across the platform); weekly on data pipelines; monthly on warehouse schema migrations
- Capacity headroom: current utilization vs. provisioned: 62% average compute utilization across the fleet; 78% on the claims-parsing service during US business hours (provisioned for 3x headroom Q4 peak)
- Material capital expenditure on infrastructure in the last 12 months: $1.1M one-time — EU-Central-1 region build-out (multi-AZ + cross-region replication for the EU expansion launch)

## 04 — SDLC

- Development methodology (Agile, Scrum, Kanban, Waterfall, hybrid) and release cadence: 2-week scrum sprints per squad; continuous deployment to staging on merge, gated production deploys per service
- Branching strategy (trunk-based, Gitflow, feature-branch) and code-review process: Trunk-based with short-lived feature branches; 2-approval requirement on services touching PHI, 1-approval elsewhere; required CODEOWNERS coverage
- Test coverage targets: unit / integration / end-to-end (measured percentage if tracked): Unit 78% (target 80%), integration 54% (no target), E2E 31% (target 40% by FY26-Q3) — unit coverage measured per PR via Codecov
- Production deployment process: manual or automated, gating criteria, rollback approach: Automated via GitHub Actions; gates — passing CI, Datadog synthetic checks green, schema-migration approval for DB changes; rollback via blue-green for stateless services, point-in-time-restore for stateful services (3-min RPO Aurora)
- Production incidents: quarterly counts over the last 24 months: FY24-Q1 8 (1 P0, 3 P1, 4 P2); Q2 11; Q3 9; Q4 7; FY25-Q1 6 (1 P0); Q2 5; Q3 4 (no P0); Q4 4. Trending down despite scale growth. Mean time to resolution P0 2.4h, P1 7.8h
- Active maintenance burden as a percentage of engineering time: ~22% (measured by PR labels — bug/maintenance vs feature/refactor); concentrated on denial-appeals legacy service (driving the FY26-Q3 rewrite)
- Annual investment planned for technical-debt remediation: ~$1.8M FY26 — 4 senior engineers dedicated to the denial-appeals rewrite Q1-Q3 + $200k for Datadog APM scope expansion to legacy services
- Open bugs by severity (P0 / P1 / P2 / P3) and aging: P0 0; P1 7 (avg age 11 days, all targeted FY26-Q2); P2 41; P3 184 (some >180 days — accepted as wont-fix, formally triaged)
- Engineering operating model: in-house, outsourced, hybrid (with rough split): In-house 91%, contractor 9% (mostly Berlin EU expansion contract-to-hire pipeline + one US security specialist consultant)

## 05 — Data, Analytics & AI

- Data architecture overview: primary data stores, pipelines, warehousing platform: Aurora Postgres (transactional PHI, encrypted at rest, per-tenant logical isolation), Redshift (analytics warehouse — de-identified per HIPAA Safe Harbor), Airflow for batch pipelines, Kafka for real-time claims stream
- Data sensitivity classification: customer PII, financial, health, or other regulated categories handled: PHI on every transaction (claims, demographic data, clinical codes); financial (payment data — not card data, MedSig is not in the cardholder-data flow); employment data from customer HR systems; classified internally as Tier-1 Restricted across the board
- ML/AI capabilities in production (if any): models, training infrastructure, monitoring: Denial-prediction model (XGBoost; trained on 4yr de-identified claims dataset; SageMaker training, real-time inference via SageMaker endpoint); Claims-AI co-pilot uses OpenAI gpt-4-turbo via API for natural-language denial-letter drafting (in beta, ~12% customers enabled); model monitoring via Datadog ML observability
- Third-party data dependencies: licensed datasets, model providers, API integrations: AMA CPT/HCPCS code license ($75k/yr), CMS payer policy feed (free), 47 payer APIs (mostly free, some access fees), OpenAI API (~$95k/yr)
- Analytics stack: BI tooling, internal dashboards, customer-facing reporting: Internal — Mode + Hex on Redshift, dbt for transformations; Customer-facing — embedded Looker dashboards (300+ tenant-scoped reports), JSON API for customer-side data exports

## 06 — Security

- Most recent penetration test (date, executive summary if shareable, remediation status): Bishop Fox 2026-03 — Critical findings 0, High 2 (both remediated within 30 days), Medium 7 (4 remediated, 3 in progress), Low 14. Executive summary attached `bishopfox-2026-03-exec-summary.pdf`
- Security incident history: any reportable events in the last 24 months: 1 reportable event 2025-Q2 — accidental access by a customer admin to another tenant's de-identified data subset (root cause: misconfigured Looker LDAP group); reported to affected customer per BAA; no PHI exposure, no HIPAA breach threshold crossed, no OCR notification required. Postmortem + corrective actions documented
- Access controls: SSO/MFA coverage, privileged-access management approach: SSO via Okta (100% of employee access); MFA enforced on all sensitive systems (cloud, code repo, CI/CD, customer admin consoles); privileged access via CyberArk vault with 4-eye approval for prod database access; quarterly access reviews
- Compliance certifications maintained: SOC 2 Type II (renewed 2026-02, no exceptions); HITRUST CSF r2 in progress (target certification FY26-Q4); no ISO 27001, no HIPAA-specific certification (HIPAA is statutory, not certifiable, but BAA-grade controls audited under SOC 2)
- Business continuity and disaster recovery plan: RPO/RTO targets, last tested date: RPO 5 min, RTO 4 hours; full failover test EU-Central-1 → US-East-1 conducted 2026-02 (passed in 3h12m); next full-failover test scheduled FY26-Q3

## 07 — People & Organization

- Organizational chart with reporting lines: Attached `medsig-org-chart-2026-05.pdf`. Top-line — CEO (Sarah Min, founder), COO (Christina Reyes, hired 2023 from Cerner), CTO (Daniel Park, founding), CFO (Marcus Hong, hired 2024), VP Sales (Devon Ortiz), VP People (Kate Boyer)
- Engineering headcount by role: ICs vs. managers, seniority distribution, contractor mix: 58 total — 8 managers (4 EMs, 3 directors, 1 VP), 50 ICs; seniority — 6 staff/principal, 22 senior, 21 mid, 5 junior; contractor mix 9%
- Average fully-loaded engineering salary, or salary band by level: Fully-loaded avg $232k US, $148k EU (Berlin); bands — Junior $145-175k, Mid $185-225k, Senior $235-285k, Staff $295-360k, Principal $370-440k (all US, fully-loaded including equity + benefits)
- Key-person dependencies: single points of knowledge, succession plans: CTO Daniel Park is sole authority on claims-parsing service (under formal knowledge transfer — second eng named 2026-Q1); denial-prediction ML model is bus-factor-2 (model author + data lead); no other identified SPOFs
- Attrition: voluntary and involuntary turnover in the last 24 months: Voluntary 14% TTM (industry benchmark 18%, healthy); involuntary 3% TTM (performance-managed, no layoffs); regrettable attrition concentrated in senior IC band (2 staff engineers to AI startups in 2025)
- Twelve-month hiring plan: net new headcount, key roles, expected start dates: +42 net headcount FY26 — 18 product engineering, 6 ML/data, 8 GTM, 6 customer success, 4 other; majority US, with 8 Berlin hires planned Q2-Q3
- Recent organizational transformation: re-orgs, leadership changes, methodology shifts in the last 24 months: COO + CFO hired 2024; engineering reorg from feature-team model to squad model 2025-Q1; introduced platform-engineering team 2025-Q3; no methodology shift in CY2026

## 08 — Corporate IT

- Enterprise applications inventory: ERP, CRM, HRIS, finance, communication tools: NetSuite (ERP/finance), Salesforce (CRM), Rippling (HRIS + payroll), Slack (communication), Notion (docs/wiki), Zoom (video), Atlassian Jira + Confluence (engineering)
- Identity and access management: SSO provider, directory service, provisioning workflow: Okta (identity + SSO + lifecycle), Workato for SaaS provisioning automation, JumpCloud directory; standard joiner/mover/leaver runbooks with 4-hour SLA on deprovisioning
- Annual IT spend: software licensing, hardware, support services: $2.85M total — $2.1M SaaS licensing (Salesforce + NetSuite + Okta dominate), $480k hardware (mostly MacBook refresh), $270k IT support contracts + helpdesk

## 09 — Governance & Compliance

- Data categories handled: PHI (claims, demographics, clinical codes — every transaction), employment data from customer HRs (for staff-credentialing flows), financial data (payment posting metadata — no cardholder data); no children's data, no biometric data, no genetic data
- Jurisdictions of operation: where customers reside, where data is stored, where employees work: Customers reside US (50 states with concentration East Coast / TX / CA) + EU-4 (Germany, France, Netherlands, Spain); data stored US-East-1 for US customers, EU-Central-1 for EU customers (strict regional isolation, no cross-border replication of PHI); employees work US (Atlanta + Austin + remote) and EU (Berlin)
- Applicable regulatory frameworks: HIPAA (US-statutory, BAAs in place with all customers), GDPR (EU-statutory, DPO appointed 2025), Germany BDSG, France CNIL guidance, Netherlands Wbp, Spain LOPDGDD; SOC 2 Type II audit (renewed); HITRUST in progress; no PCI DSS exposure (not in cardholder flow); CCPA applicable for California customers
- Audit history: outstanding remediation items from third-party audits: SOC 2 2026-02 no findings; HITRUST gap assessment 2026-Q1 — 14 control gaps identified, 11 remediated, 3 in flight (governance documentation maturity items, none control-effectiveness gaps)
- Data-processing agreements: standard contracts, cross-border transfer mechanisms: Standard DPA in every customer contract; for EU customers SCCs incorporated with Atlas-based transfer impact assessments; sub-processor list maintained at medsig.health/legal/subprocessors with 30-day change-notification SLA

---

_Returned 2026-05-20 in response to GST's Information Request List dated 2026-05-13. Available follow-up: Daniel Park, daniel.park@medsig.health._
