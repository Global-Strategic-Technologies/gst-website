# Information Request List

> The structured information GST needs to execute its Hub diligence tools and MCP-mediated analysis against a target or client. Authored as the canonical text rendered by both the live website at <https://globalstrategic.tech/hub/library/information-request-list> and the MCP Library resource `gst://library/information-request-list`. Single source of truth — both surfaces consume this file directly.

This one-page request list assembles the inputs GST needs at the start of a diligence or value-creation engagement. Hand it to a target (buy-side), a client (sell-side preparation), or a portfolio company (value-creation) before the first working session.

The structure mirrors the canonical [VDR taxonomy](./vdr-structure.md) so responses map cleanly into the VDR that will ultimately house the transaction's diligence record. Section `00` collects the engagement-level facts that no single VDR folder owns; sections `01` through `09` mirror the VDR-9 folders.

The artifact is intentionally compact. Each bullet asks for one fact or a short summary — not exhaustive documentation. Depth comes later in the diligence cycle; this list scopes the first conversation.

---

## How to use this list

- Treat this as the opening intake. Hand the relevant sections to the recipient and ask for written responses or attachments per bullet.
- Short answers are preferred. Depth comes later in the diligence cycle.
- Note "n/a" or "not yet known" rather than skipping. The presence of an answer is signal, including "we don't track this."
- Sections are ordered to mirror the canonical VDR taxonomy. Most engagements use all ten; narrower conversations might lead with sections `00`, `01`, and `09` alone.

---

## 00 — Engagement Basics

Cross-cutting facts that anchor the rest of the conversation. None of these live in a single VDR folder, but every downstream analysis depends on them.

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

Buyers and investors evaluate whether the product organization can sustain innovation post-transaction. This section frames what the product is, who buys it, and how it competes.

- One-paragraph product description: what it does, who buys it, the problem it solves
- Target market: primary buyer persona, segment (SMB / mid-market / enterprise), industry vertical(s)
- Product roadmap snapshot: current-quarter priorities + next-12-month outlook
- Top three features by adoption (DAU/MAU or equivalent engagement metric)
- Customer profile: typical contract size, contract length, top concentration risk
- Competitive landscape: three to five named alternatives and how the product differentiates

## 02 — Software Architecture

How the system is built. The goal is a clear picture without requiring source-code access at this stage.

- High-level architecture diagram (PDF or image): logical components, data flow, external integrations
- Technology stack: primary languages, frameworks, databases, infrastructure providers
- Repository organization: monorepo vs. polyrepo, number of services, approximate lines of code
- Engineering FTE count: total and breakdown by team (product engineering, infrastructure / SRE, security, data)
- Annual build and tooling cost: IDE licenses, CI/CD platform, observability tooling
- Third-party dependency overview: major licensed libraries or APIs + renewal exposure
- Most recent technical-debt assessment or code-quality report (SonarQube, CodeClimate, equivalent) if available

## 03 — Infrastructure & Operations

Operational maturity directly drives post-acquisition integration cost. This section captures hosting posture, spend, and operational discipline.

- Hosting model: cloud provider(s), self-hosted / managed mix, primary region(s)
- Monthly hosting and infrastructure spend (last three months, with trend if available)
- Headcount dedicated to infrastructure operations (FTE equivalent)
- Monitoring and alerting stack (tools, on-call rotation, escalation paths)
- Deployment frequency to production (e.g., multiple/day, weekly, monthly, quarterly)
- Capacity headroom: current utilization vs. provisioned
- Material capital expenditure on infrastructure in the last 12 months

## 04 — SDLC

How software gets built reveals more about engineering maturity than the software itself. This section measures repeatability and quality of the delivery process.

- Development methodology (Agile, Scrum, Kanban, Waterfall, hybrid) and release cadence
- Branching strategy (trunk-based, Gitflow, feature-branch) and code-review process
- Test coverage targets: unit / integration / end-to-end (measured percentage if tracked)
- Production deployment process: manual or automated, gating criteria, rollback approach
- Production incidents in the last 12 months: count, severity distribution, mean time to resolution
- Active maintenance burden as a percentage of engineering time
- Open bugs by severity (P0 / P1 / P2 / P3) and aging
- Engineering operating model: in-house, outsourced, hybrid (with rough split)

## 05 — Data, Analytics & AI

Data is increasingly the core asset in technology engagements. This section captures how the target collects, stores, transforms, and uses data — and whether AI/ML capabilities are production-grade.

- Data architecture overview: primary data stores, pipelines, warehousing platform
- Data sensitivity classification: customer PII, financial, health, or other regulated categories handled
- ML/AI capabilities in production (if any): models, training infrastructure, monitoring
- Third-party data dependencies: licensed datasets, model providers, API integrations
- Analytics stack: BI tooling, internal dashboards, customer-facing reporting

## 06 — Security

Security posture is a deal-driver. Gaps trigger purchase-price adjustments or outright termination; proactive disclosure signals maturity.

- Most recent penetration test (date, executive summary if shareable, remediation status)
- Security incident history: any reportable events in the last 24 months
- Access controls: SSO/MFA coverage, privileged-access management approach
- Compliance certifications maintained (SOC 2, ISO 27001, HITRUST, PCI DSS, others)
- Business continuity and disaster recovery plan: RPO/RTO targets, last tested date

## 07 — People & Organization

Skills are often the primary asset in technology engagements. This section captures team depth and key-person risk.

- Organizational chart with reporting lines (executive team + engineering leadership)
- Engineering headcount by role: ICs vs. managers, seniority distribution, contractor mix
- Average fully-loaded engineering salary, or salary band by level
- Key-person dependencies: single points of knowledge, succession plans
- Attrition: voluntary and involuntary turnover in the last 24 months
- Twelve-month hiring plan: net new headcount, key roles, expected start dates
- Recent organizational transformation: re-orgs, leadership changes, methodology shifts in the last 24 months

## 08 — Corporate IT

Enterprise systems supporting internal operations. Often a source of hidden integration cost.

- Enterprise applications inventory: ERP, CRM, HRIS, finance, communication tools
- Identity and access management: SSO provider, directory service, provisioning workflow
- Annual IT spend: software licensing, hardware, support services

## 09 — Governance & Compliance

Compliance readiness determines whether the target can operate in regulated environments post-close. This section captures regulatory exposure and audit history.

- Data categories handled (PII, PHI, financial, regulated industry data)
- Jurisdictions of operation: where customers reside, where data is stored, where employees work
- Applicable regulatory frameworks (e.g., GDPR, CCPA, HIPAA, SOX, PCI DSS, NIS2, EU AI Act)
- Audit history: outstanding remediation items from third-party audits
- Data-processing agreements: standard contracts, cross-border transfer mechanisms (SCCs, DPAs)

---

_Last updated: 2026-05-21._
