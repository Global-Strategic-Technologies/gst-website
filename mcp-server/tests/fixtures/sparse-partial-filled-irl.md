# Information Request List — Nimbus Cargo (returned, 2026-05-30, partially-filled)

> Returned by Nadia Okonkwo (CEO) directly — engineering team not yet engaged in diligence prep. **Many sections left blank pending CTO interviews scheduled for next week.**

## 00 — Basics

- Company name (legal entity + brand if different): Nimbus Cargo Ltd; brand Nimbus
- Engagement context: buy-side preliminary screen — pre-LOI exploration
- Annual recurring revenue (most recent quarter, plus prior 12 months if available): ~$12M ARR
- If applicable, funding stage and most recent round details: Series-A 2024; Bain Capital Ventures lead; specifics tbd in next session
- Business model (B2B SaaS, B2C subscription, enterprise license + services, marketplace, other): B2B SaaS — air-cargo capacity booking platform
- Geographies of operation (revenue presence; engineering presence if different): US + LATAM customer base; engineering Mexico City
- Headquarters jurisdiction (incorporation entity + primary operating location): Delaware Inc.; Mexico City operations
- Company age (founding year; note any major pivot): Founded 2021
- Total headcount (current and 12 months ago): 38 today; n/a 12 months ago — will pull from HRIS
- Year-over-year growth rate (revenue, and headcount if a different signal): "Strong YoY growth — specifics pending finance close"

## 01 — Product

- One-paragraph product description: what it does, who buys it, the problem it solves: Nimbus Cargo is a capacity-booking marketplace for air-freight forwarders. Forwarders search rates + book capacity directly with passenger + freighter airlines. Buyers are mid-market freight forwarders in North America + LATAM. Replaces email + spreadsheet workflows that forwarders use today.
- Target market: primary buyer persona, segment, industry vertical(s): Mid-market freight forwarders; vertical air-cargo logistics
- Product roadmap snapshot: current-quarter priorities + next-12-month outlook: open — to be discussed with VP Product next week
- Top three features by adoption (DAU/MAU or equivalent engagement metric): not yet tracked centrally — analytics rollout in progress
- Customer profile: typical contract size, contract length, top concentration risk: open
- Competitive landscape: three to five named alternatives and how the product differentiates: WebCargo (Freightos), cargo.one — Nimbus differentiates on LATAM coverage + USD/MXN dual-currency pricing
- Operational scale: low (internal tools or small user base), moderate (thousands of users with steady growth), or high (millions of users or high transaction volume): moderate — ~2,400 booking-active forwarders; ~140,000 bookings/quarter

## 02 — Software Architecture

- High-level architecture diagram (PDF or image): logical components, data flow, external integrations: not available — will request from CTO
- Technology stack: primary languages, frameworks, databases, infrastructure providers: TypeScript (Node 20), Postgres, AWS (us-east-1)
- Repository organization: monorepo vs. polyrepo, number of services, approximate lines of code: monorepo; LOC tbd
- Engineering FTE count: total and breakdown by team (product engineering, infrastructure / SRE, security, data): 14 total — breakdown tbd
- Product personnel cost: annual fully-loaded cost for product managers and designers, if tracked separately from engineering: open
- Annual build and tooling cost: IDE licenses, CI/CD platform, observability tooling: open
- Third-party dependency overview: major licensed libraries or APIs + renewal exposure: open
- Most recent technical-debt assessment or code-quality report (SonarQube, CodeClimate, equivalent) if available: not formally assessed — will scope a Bishop Fox or equivalent engagement during diligence

## 03 — Infrastructure & Operations

- Hosting model: cloud-native (AWS); single-region us-east-1
- Monthly hosting + infra spend (3-month average): n/a — finance to pull
- Infrastructure headcount: not separately tracked — included in 14 total
- Material capex flagged: minimal — fully-cloud

## 04 — SDLC

- Deployment frequency (per team, per service): open — anecdotally "multiple per day for the booking service"
- Test coverage by service tier: not yet tracked
- Mean time to resolution (P0, P1) — last 12 months: open — no formal incident-response tooling beyond PagerDuty
- Production incidents (P0 + P1) — last 4 quarters: open — to be pulled from PagerDuty + Slack archives

## 09 — Governance & Compliance

- Regulated frameworks the platform faces: CCPA (California customers); LGPD (Brazilian customers — Brazil expansion 2025-Q4); no PHI, no PCI (Stripe handles payments)
- Cross-border data flows: US ↔ Brazil + Mexico data flows; SCC equivalents in place
