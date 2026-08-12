# Information Request List — Northwind Freight Systems (filled)

> Engagement context: Buy Side
> Generated: 2026-08-12
> Canonical reference: https://globalstrategic.tech/hub/library/information-request-list/

- 0-01 Company name (legal entity + brand if different) [CLOSED] — Northwind Freight Systems, Inc. (Delaware C-corp); brand Northwind
- 0-02 Engagement context [CLOSED] — Buy-side diligence, pre-LOI; sponsor is evaluating a platform acquisition in mid-market freight brokerage
- 0-03 Annual recurring revenue (most recent quarter, plus prior 12 months) [CLOSED] — $38.6M Q2-FY26 annualized; $29.9M trailing twelve months. Excludes the two tuck-in acquisitions that closed in Q4 FY26 (Source: VDR/03-Financials/arr-bridge-FY26Q2.xlsx) (Note: Unaudited; audit completes September)
- 0-04 Business model [CLOSED] — B2B SaaS subscription per seat, plus a per-shipment transaction fee on brokered loads
- 0-05 Geographies of operation [CLOSED] — United States (48 contiguous states); operations centres in Chicago and Dallas. Revenue is US-only today; a Canadian pilot starts in FY27
- 0-06 Total headcount [PARTIAL] — 212 as of the June HRIS export (Note: HRIS export attached is one month stale)
- 0-07 Year-over-year growth rate [CLOSED] — <NO RESPONSE>
- 1-01 One-paragraph product description [CLOSED] — Northwind is a transportation management and load-brokerage platform for mid-market shippers. It ingests tender requests, rates them against contracted and spot capacity, and books carriers automatically. Buyers are VPs of Transportation at shippers and operations directors at 3PLs.
- 1-02 Target market [CLOSED] — Mid-market shippers ($50M-$500M freight spend) and regional 3PLs
- 1-03 Product roadmap snapshot [OPEN] — <NO RESPONSE> (Source: VDR/01-Product/roadmap-FY27.pdf)
- 1-04 Competitive landscape [CLOSED] — project44 and FourKites on visibility; Convoy legacy accounts on brokerage (Note: Partner disputes the Convoy comparison)
- 2-01 Primary language and framework stack [CLOSED] — TypeScript on Node 22, Python 3.12 for the rating engine, Postgres 16, Kafka
- 2-02 Engineering FTE count and composition [CLOSED] — 64 total — 41 product, 9 platform, 6 data, 5 SRE, 3 security. Contractors are excluded from this count.
- 2-03 Architecture pattern [PARTIAL] — Modular monolith with three extracted services (rating, tracking, billing) (Source: VDR/02-Architecture/c4-context.png)
- 3-01 Annual cloud hosting spend [CLOSED] — $4.15M FY26 actual, AWS us-east-1 and us-west-2 (Source: VDR/03-Financials/aws-invoices-FY26/) (Note: Committed-use discount renews in November)
- 3-02 Deployment frequency [CLOSED] — Twelve to eighteen production deploys per week
- 4-01 Technical debt self-assessment [CLOSED] — Moderate. Test coverage sits near 54% and the rating engine carries most of it. The rating engine is the acknowledged hot spot; a rewrite was scoped twice and deferred twice.
- 4-02 P1 mean time to resolution [CLOSED] — 6.5 hours over the trailing two quarters
- 4-03 Code review practice [OPEN] — <NO RESPONSE> (Note: Ask in the management call)
- 5-01 Data sensitivity classification [CLOSED] — Commercial-confidential shipment and rate data; no PHI, no cardholder data
- 5-02 Machine-learning or AI use in production [CLOSED] — A carrier-price prediction model retrains weekly on internal booking history.
- 6-01 Most recent penetration test [CLOSED] — Latacora, February 2026 — 0 Critical, 3 High (all remediated), 11 Medium (Source: VDR/06-Security/pentest-2026-02-Latacora.pdf)
- 6-02 Security certifications held [CLOSED] — SOC 2 Type II (current); ISO 27001 in progress, targeted FY27-Q1
- 7-01 Average fully-loaded engineering salary [CLOSED] — $198k (Note: US-weighted; excludes equity)
- 7-02 Engineering attrition [PARTIAL] — Voluntary attrition was 14% trailing twelve months
- 8-01 Annual IT spend outside engineering [CLOSED] — $1.9M including licences, endpoints, and helpdesk
- 9-01 Applicable regulatory frameworks [CLOSED] — CCPA, and state privacy statutes in Colorado and Virginia. FMCSA carrier-vetting obligations also apply to the brokerage side.
- 9-02 Jurisdictions of operation [CLOSED] — United States only; no EU or UK establishment
