# Information Request List

Below is information useful to size and execute a client engagement. Per-bullet, short answers are preferred. Note "n/a" or "not yet tracked" rather than skipping; the presence of an answer is signal, including "we don't track this."

## 00 — Engagement Basics

- Target / client name (legal entity + brand if different)
- Engagement context: sell-side preparation, buy-side review, post-close value creation, or other
- Annual recurring revenue (most recent quarter, plus prior 12 months if available)
- Funding stage and most recent round details (date, lead investor, headline valuation)
- Business model (B2B SaaS, B2C subscription, enterprise license + services, marketplace, other)
- Geographies of operation (revenue presence; engineering presence if different)
- Headquarters jurisdiction (incorporation entity + primary operating location)
- Company age (founding year; note any major pivot)
- Total headcount (current and 12 months ago)
- Year-over-year growth rate (revenue, and headcount if a different signal)

## 01 — Product

- One-paragraph product description: what it does, who buys it, the problem it solves
- Target market: primary buyer persona, segment (SMB / mid-market / enterprise), industry vertical(s)
- Product roadmap snapshot: current-quarter priorities + next-12-month outlook
- Top three features by adoption (DAU/MAU or equivalent engagement metric)
- Customer profile: typical contract size, contract length, top concentration risk
- Competitive landscape: three to five named alternatives and how the product differentiates
- Operational scale: low (single-tenant or small SaaS; under 10M DAU), moderate (mid-market; 10–100M DAU or multi-tenant), or high (hypergrowth; over 100M DAU, real-time data pipelines, or sub-100ms latency SLA)

## 02 — Software Architecture

- High-level architecture diagram (PDF or image): logical components, data flow, external integrations
- Technology stack: primary languages, frameworks, databases, infrastructure providers
- Repository organization: monorepo vs. polyrepo, number of services, approximate lines of code
- Engineering FTE count: total and breakdown by team (product engineering, infrastructure / SRE, security, data)
- Product personnel cost: annual fully-loaded cost for product managers and designers, if tracked separately from engineering
- Annual build and tooling cost: IDE licenses, CI/CD platform, observability tooling
- Third-party dependency overview: major licensed libraries or APIs + renewal exposure
- Most recent technical-debt assessment or code-quality report (SonarQube, CodeClimate, equivalent) if available

## 03 — Infrastructure & Operations

- Hosting model: cloud provider(s), self-hosted / managed mix, primary region(s)
- The past three months' monthly hosting and infrastructure spend
- 12–24 months of hosting and infrastructure spend history if available
- Headcount dedicated to infrastructure operations (FTE equivalent)
- Monitoring and alerting stack (tools, on-call rotation, escalation paths)
- Deployment frequency to production (e.g., multiple/day, weekly, monthly, quarterly)
- Capacity headroom: current utilization vs. provisioned
- Material capital expenditure on infrastructure in the last 12 months

## 04 — SDLC

- Development methodology (Agile, Scrum, Kanban, Waterfall, hybrid) and release cadence
- Branching strategy (trunk-based, Gitflow, feature-branch) and code-review process
- Test coverage targets: unit / integration / end-to-end (measured percentage if tracked)
- Production deployment process: manual or automated, gating criteria, rollback approach
- Production incidents: quarterly counts over the last 24 months (or 12 if 24 unavailable), with severity distribution and mean time to resolution
- Active maintenance burden as a percentage of engineering time
- Annual investment planned for technical-debt remediation (headcount budgeted, capex allocated, or specific roadmap commitments — e.g., "rewriting the legacy billing system in 2027")
- Open bugs by severity (P0 / P1 / P2 / P3) and aging
- Engineering operating model: in-house, outsourced, hybrid (with rough split)

## 05 — Data, Analytics & AI

- Data architecture overview: primary data stores, pipelines, warehousing platform
- Data sensitivity classification: customer PII, financial, health, or other regulated categories handled
- ML/AI capabilities in production (if any): models, training infrastructure, monitoring
- Third-party data dependencies: licensed datasets, model providers, API integrations
- Analytics stack: BI tooling, internal dashboards, customer-facing reporting

## 06 — Security

- Most recent penetration test (date, executive summary if shareable, remediation status)
- Security incident history: any reportable events in the last 24 months
- Access controls: SSO/MFA coverage, privileged-access management approach
- Compliance certifications maintained (SOC 2, ISO 27001, HITRUST, PCI DSS, others)
- Business continuity and disaster recovery plan: RPO/RTO targets, last tested date

## 07 — People & Organization

- Organizational chart with reporting lines (executive team + engineering leadership)
- Engineering headcount by role: ICs vs. managers, seniority distribution, contractor mix
- Average fully-loaded engineering salary, or salary band by level
- Key-person dependencies: single points of knowledge, succession plans
- Attrition: voluntary and involuntary turnover in the last 24 months
- Twelve-month hiring plan: net new headcount, key roles, expected start dates
- Recent organizational transformation: re-orgs, leadership changes, methodology shifts in the last 24 months

## 08 — Corporate IT

- Enterprise applications inventory: ERP, CRM, HRIS, finance, communication tools
- Identity and access management: SSO provider, directory service, provisioning workflow
- Annual IT spend: software licensing, hardware, support services

## 09 — Governance & Compliance

- Data categories handled (PII, PHI, financial, regulated industry data)
- Jurisdictions of operation: where customers reside, where data is stored, where employees work
- Applicable regulatory frameworks (e.g., GDPR, CCPA, HIPAA, SOX, PCI DSS, NIS2, EU AI Act)
- Audit history: outstanding remediation items from third-party audits
- Data-processing agreements: standard contracts, cross-border transfer mechanisms (SCCs, DPAs)

---

_Last updated: 2026-05-22._
