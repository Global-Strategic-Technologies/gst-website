# Information Request List — Helios Grid (returned, 2026-05-28)

> Prepared by Mateus Albuquerque, CTO, on behalf of Sophie Lansing (CEO).
> Sources: internal finance pack (Q1-FY27 cut), engineering quarterly review, SOC 2 Type II report (Coalfire, Feb 2026), HRIS export.
> **Engagement context: sell-side preparation. The company is preparing the data room for a planned 2026-Q4 process.**

## 00 — Basics

- Company name (legal entity + brand if different): Helios Grid Operations Ltd. (UK Ltd); brand Helios Grid
- Engagement context: sell-side preparation — full process expected 2026-Q4, dual-track strategic + financial
- Annual recurring revenue (most recent quarter, plus prior 12 months if available): £68.4M Q1-FY27 annualized; £52.1M trailing 12 months — recurring + utility-billing transactional uplift
- If applicable, funding stage and most recent round details: Series-C 2023-09; £42M raised; lead Lightrock; pre-money £180M
- Business model: B2B SaaS with utility-tariff-billed transactional uplift — base subscription per MW under management + per-MWh balancing-service fee
- Geographies of operation: Revenue — UK ~62%, EU (DE/NL/IE/ES) ~28%, AU+NZ ~10% (launched 2025-Q2); Engineering — UK (London + Edinburgh), EU (Dublin)
- Headquarters jurisdiction: UK incorporation; London primary operations + Edinburgh R&D
- Company age: Founded 2017 in Edinburgh; expanded to London 2021; AU launch 2025
- Total headcount: 244 today; 198 twelve months ago
- Year-over-year growth rate: Revenue 31% YoY (recurring) + 18% YoY (transactional uplift); headcount 23% YoY

## 01 — Product

- One-paragraph product description: Helios Grid is a real-time energy-trading and battery-storage optimization platform for utility-scale battery operators, distribution network operators, and Balancing Responsible Parties. It ingests wholesale market signals, weather forecasts, and grid telemetry to dispatch battery assets across National Grid ESO services + EPEX SPOT + Nord Pool day-ahead/intraday markets. Buyers are heads of trading at battery operators (Gresham House, Zenobē, etc.) and DSO grid-services teams.
- Target market: Primary buyer — Head of Trading at utility-scale battery operators (>50 MW portfolio); secondary — DSO grid-services managers; vertical energy-grid + battery storage
- Product roadmap snapshot: FY27-Q2 — co-located solar+battery optimization, AS-NZS frequency-response modules for AU launch; next 12 months — German balancing-market (Regelarbeitsmarkt) integration, automated dispatch for hybrid sites
- Top three features by adoption: (1) Wholesale-arbitrage dispatcher — 100% portfolio under management; (2) Dynamic Containment frequency-response — 78% of UK customers; (3) Day-ahead optimization — 62% of customers
- Customer profile: median ACV £840k; 3-year terms with break clauses at year 2; top-three customers = 22% of ARR (Gresham House 9%, Zenobē 7%, Fidra 6%)
- Competitive landscape: Modo Energy (analytics-heavy), Habitat Energy (full-stack but services-led), Octopus Kraken (incumbent utility platform), Conrad Energy (vertically-integrated competitor). Helios differentiates on autonomous dispatch + cross-market arbitrage; Modo wins on analytics depth, Habitat on managed-service hand-holding
- Operational scale: moderate-to-high — 2.1 GW under management across 78 sites; 4.2M dispatch decisions/day across day-ahead/intraday/balancing markets

## 02 — Software Architecture

- High-level architecture diagram: Attached separately (`helios-architecture-2026.pdf`); summary — Go services for low-latency market ingest + dispatch, Python for forecasting + ML, Rust for the trading-decision engine, TimescaleDB (Postgres) for telemetry, Kafka for market data, Kubernetes on AWS (eu-west-2 + eu-central-1)
- Technology stack: Go 1.22 (8 services), Python 3.12 (forecasting + research), Rust (decision engine — single binary), TimescaleDB 2.13, Kafka, Kubernetes (EKS), AWS, Terraform, GitLab CI
- Repository organization: Monorepo (Bazel) — 38 services / packages; ~620k LOC total (180k Go, 240k Python, 95k Rust, 65k Terraform, 40k other)
- Engineering FTE count: 71 total — 52 product engineering (5 squads incl. Quant Research squad of 6), 11 SRE / platform, 4 security, 4 data engineering. (Excludes 8 PMs + 3 designers in Product org.)
- Product personnel cost: £2.1M annual fully-loaded — 8 PMs + 3 designers + 1 head of product
- Annual build and tooling cost: £710k — GitLab Ultimate £128k, Datadog £270k, AWS support enterprise £180k, JetBrains floating £62k, GitHub copilot Business £40k, misc £30k
- Third-party dependency overview: National Grid ESO data feed (regulated, no licence cost), EPEX SPOT data subscription £180k/yr, Nord Pool feed £95k/yr, AWS HealthLake — n/a (different industry), weather data Vaisala £210k/yr, Snowflake (analytics) £340k/yr — largest single dependency
- Most recent technical-debt assessment: Internal SonarQube run 2026-04-08 — Maintainability rating A overall; the legacy Python forecasting library has Maintainability C and is on a planned Rust rewrite (FY27-Q3 milestone). Critical code-smells 41; total code-smells 920.

## 03 — Infrastructure & Operations

- Hosting model: AWS EKS primary; multi-region (eu-west-2 London + eu-central-1 Frankfurt) active-active for dispatch services; AU+NZ traffic routed via ap-southeast-2 read replica with London-primary writes
- Monthly hosting + infra spend (3-month average): £142k/mo across AWS (EKS, RDS, Kafka MSK, S3, CloudFront), Datadog, Snowflake — annualized £1.7M
- Infrastructure headcount: 11 FTE — 6 SRE, 3 platform engineering, 2 DBA
- Material capex flagged: Minimal — fully-cloud, no on-prem; 2025 capex was £180k on a Snowflake reserved instance (3-year), straight-line amortized
- Disaster recovery posture: Active-active across UK + DE regions; RTO 15 min for dispatch services; quarterly DR drills (latest 2026-03-18)
- Uptime SLA committed to customers and historical attainment: 99.95% committed for dispatch APIs; achieved 99.971% trailing 12 months
- FinOps maturity (cost reviews, reserved-instance strategy, anomaly alerting): Monthly cost reviews owned by VP Engineering + Finance; reserved instances for steady-state EKS + RDS; anomaly alerting via AWS Cost Anomaly Detection + Datadog cost dashboards

## 04 — SDLC

- Deployment frequency (per team, per service): Daily for stateless API services; weekly for the Rust decision engine (gated by quant-research backtest sign-off); monthly for the forecasting library
- Test coverage by service tier: 84% line coverage backend services (Go + Python); 78% for the Rust decision engine; 91% for the dispatch APIs (highest-criticality services)
- Mean time to resolution (P0, P1) — last 12 months: P0 1.8h, P1 6.4h trailing 12 months; SLO P0 ≤ 2h, P1 ≤ 8h
- Production incidents (P0 + P1) — last 4 quarters: 12 total — 1 P0 (eu-central-1 outage Mar 2026 from AWS, no customer-impact), 11 P1
- Branching + release strategy: Trunk-based with feature flags (LaunchDarkly); CI/CD via GitLab; staging environment mirrors production; canary releases for dispatch services
- Active maintenance burden as % of engineering time: 18% — measured via Jira labels + quarterly engineering survey
- Planned remediation budget (next 12 months): £1.4M earmarked for the Python forecasting → Rust rewrite (FY27-Q3 milestone); engineering allocation 6 FTE for one quarter

## 05 — Data, Analytics & AI

- Data warehouse / lake architecture: Snowflake primary; S3 raw landing zone; dbt for transformations; Looker for BI
- Data volume (DAU events, MAU, total customers — whichever fits): ~4.2M dispatch decisions/day landed in Snowflake; 2.1B telemetry points/day from grid devices; 78 production tenants
- ML / AI in product: Forecasting models (weather + price + demand) in production for 4 years; reinforcement-learning research for autonomous arbitrage strategies (not yet in prod); LLM use confined to internal copilot tooling, not customer-facing
- AI-specific risks the company tracks: Forecast-model drift (monitored daily), reward-hacking in RL research (mitigated by simulation-only deployment), no LLM-in-production exposure → EU AI Act high-risk classification is N/A for current product

## 06 — Security

- Most recent third-party pentest: Coalfire SOC 2 Type II Feb 2026 (clean — 2 informational findings closed); annual app pentest by NCC Group, last completed Jan 2026 — 6 medium findings remediated, 0 high
- Certifications held: SOC 2 Type II (Feb 2026), ISO 27001 (renewed 2025-11), Cyber Essentials Plus (UK, renewed 2026-01)
- Vulnerability management: Snyk for SCA, GitLab dependency scanning, monthly patching cadence for non-prod, weekly for prod-facing; mean time to patch critical CVE 9 days
- Secrets management: AWS Secrets Manager + HashiCorp Vault for break-glass; quarterly secret rotation
- Authentication: Customer-facing SSO via Auth0 (SAML + OIDC); internal SSO via Okta

## 07 — People & Organization

- Engineering org chart (titles + reporting line, anonymized OK): VP Engineering (Mateus Albuquerque) reports to CEO. Direct reports — Director of Platform (11 SRE), Director of Product Engineering (52 FTE across 5 squads — Trading, Forecasting, Dispatch, Integrations, Quant Research), Head of Security (4 FTE), Head of Data (4 FTE)
- Squad structure: 5 squads × 8-12 each (Trading, Forecasting, Dispatch, Integrations, Quant Research); product-aligned with embedded designer + PM
- Average fully-loaded engineering salary: £148k UK average (mix of London + Edinburgh); £162k EU (Dublin); £168k Quant Research squad (higher comp band)
- Attrition (regrettable) over last 12 months: 9.4% engineering; 14% company-wide
- Hiring plan next 12 months: +18 engineering net (4 SRE, 8 product eng across squads, 2 security, 4 data); +2 PM
- Key-person dependencies: Head of Quant Research is a named-person dependency for the reinforcement-learning roadmap — succession plan in progress (2 senior researchers being upskilled)

## 08 — Corporate IT

- Identity provider: Okta (employee + contractor); Auth0 (customer-facing)
- Endpoint posture: Mac fleet (180 devices) under JAMF; Windows fleet (24 finance + sales) under Intune; full-disk encryption mandatory
- VPN / Zero-Trust: Cloudflare Access for internal apps; no traditional VPN
- BYOD policy: No BYOD for engineering; sales + finance allowed with MDM

## 09 — Governance & Compliance

- Regulated frameworks the platform faces: UK Data Protection Act 2018 + UK GDPR (mandatory); GDPR (EU customer base, mandatory); NIS2 (UK + EU energy-sector scope; in-scope as "essential entity" under Annex I — Energy sector); ISO 27001 (held, see Security); FCA — not applicable (no investment-product issuance); EU AI Act — analyzed, current product not in scope (no high-risk AI system per Annex III); Ofgem licensing — applicable to customers (Balancing Service Providers); Helios is not directly licensed
- Regulated data the platform handles: No PHI; no PCI; no customer PII at scale (b2b only — operational user accounts only); commercial pricing data + grid telemetry only
- Cross-border data flows: UK ↔ EU customers in scope; Standard Contractual Clauses + UK addendum executed; data residency maintained per region
- Audit cadence: Annual ISO 27001 surveillance audit (last 2025-11, next 2026-11); SOC 2 Type II annual (last Feb 2026, next Feb 2027); internal compliance review quarterly
- Open compliance items: NIS2 implementation programme in flight — Member State transposition deadline October 2024 has passed; UK NIS regulations updated 2024-04; Helios is finishing the formal incident-reporting playbook (24-hour early-warning) — target 2026-Q3 completion

## 10 — Sell-side specific (engagement-context section)

- Defensible-story themes the team would highlight to buyers: (1) autonomous dispatch as a moat — 4 years of production training data; (2) cross-market arbitrage breadth (UK + DE + NL + AU); (3) sticky customer base — net revenue retention 124% trailing 12 months
- Known weaknesses the data room will expose: (1) Python forecasting tech-debt — being addressed via Rust rewrite, target FY27-Q3; (2) Top-3 customer concentration at 22% — flagged and being de-risked via mid-market sales push; (3) Reinforcement-learning research is exciting but not revenue-bearing — frame as optionality, not a 12-month commitment
- Open items: ESG-disclosure framework still informal; FY28 product roadmap not yet board-approved
