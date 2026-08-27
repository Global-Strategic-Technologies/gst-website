# Northwind Analytics — Information Request List (returned 2026-08-14)

Partial return. Sections 05–08 pending; flagged where an answer is not tracked
rather than skipped, per the instructions.

## 00 — Basics

- Company name: Northwind Analytics, Inc. (brand: Northwind)
- Engagement context: buy-side review
- Annual recurring revenue: $15.2M as of Q2 2026; $11.4M trailing 12 months prior
- Funding stage: Series B, $32M led by Cadence Partners, closed March 2025
- Business model: B2B SaaS, annual contracts, no services revenue
- Geographies of operation: United States and Canada revenue; engineering in
  Toronto and Lisbon
- Headquarters jurisdiction: Delaware incorporation, primary operations in
  San Francisco, California
- Company age: founded 2019; pivoted from agency reporting to self-serve in 2021
- Total headcount: 118 today, 94 twelve months ago
- Year-over-year growth rate: 33% revenue, 26% headcount

## 01 — Product

- Product description: embedded analytics for mid-market e-commerce operators.
  Ingests order and fulfilment data, returns cohort and margin reporting inside
  the customer's own admin surface. Buyer is the VP of Operations.
- Target market: mid-market, retail and consumer goods verticals
- Roadmap snapshot: Q3 is warehouse-native deployment; next 12 months is
  forecasting and a partner API
- Top three features by adoption: margin explorer, cohort retention, alerting
- Customer profile: $48K median ACV, 24-month terms, top customer is 9% of ARR
- Competitive landscape: Looker embedded, Mode, two in-house builds
- Operational scale: moderate — 14,000 monthly active operator seats

## 02 — Software Architecture

- Architecture diagram: not yet tracked in shareable form; whiteboard only
- Technology stack: TypeScript, Node, Postgres, Snowflake, AWS
- Repository organization: monorepo, 9 deployable services, ~340K lines
- Engineering FTE count: 41 total — 26 product, 8 infrastructure, 3 data, 4 QA
- Product personnel cost: $2.1M annually for PM and design
- Annual build and tooling cost: $310K
- Third-party dependency overview: Snowflake, Stripe, two licensed geo datasets;
  Snowflake renews January 2027
- Most recent technical-debt assessment: none formally; SonarQube reports
  22% duplication on the ingest service

## 03 — Infrastructure & Operations

- Hosting model: AWS, single region us-west-2, managed services throughout
- Past three months' hosting spend: $88K, $91K, $96K
- 12–24 month spend history: available on request, roughly $780K last 12 months
- Headcount dedicated to infrastructure operations: 8 FTE
- Monitoring and alerting stack: Datadog, PagerDuty, weekly on-call rotation
- Deployment frequency to production: 4–6 times per week
- Capacity headroom: warehouse compute provisioned ~40% above steady state
- Material capital expenditure: none in the last 12 months

## 04 — SDLC

- Development methodology: Scrum, two-week sprints, fortnightly release
- Branching strategy: trunk-based with short-lived feature branches, two reviewers
- Test coverage: 61% unit, 34% integration, no end-to-end target
- Production deployment process: automated via CI, manual approval gate,
  rollback by redeploy
- Production incidents: 24 over the last 8 quarters — 3 Sev1, 9 Sev2, 12 Sev3;
  mean time to resolution 4.5 hours
- Active maintenance burden: approximately 30% of engineering time
- Annual technical-debt remediation investment: 2 FTE budgeted for 2027,
  committed to re-platforming the ingest pipeline
- Open bugs by severity: 2 P1, 31 P2, 140 P3; P3 median age 8 months
- Engineering operating model: in-house, with 4 contractors in QA

## 09 — Governance & Compliance

- Data categories handled: customer PII, order and payment metadata.
  No PHI.
- Jurisdictions of operation: customers in US and Canada, data stored in
  us-west-2, employees in Canada, Portugal and the US
- Applicable regulatory frameworks: CCPA, PIPEDA, GDPR for the Lisbon entity,
  PCI DSS via Stripe as processor
- Audit history: SOC 2 Type II completed 2026-02, three low-severity items
  outstanding on access review
- Data-processing agreements: standard DPA, SCCs for the Portugal transfer
