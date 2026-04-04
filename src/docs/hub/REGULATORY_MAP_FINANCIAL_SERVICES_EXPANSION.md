# Regulatory Map — Financial Services & Fund Administration Expansion

Evaluate and potentially add six financial services regulations to the Regulatory Map. These regulations govern fund administration, investor due diligence, and tax compliance — a domain adjacent to the current privacy/AI/cybersecurity/compliance coverage but serving a distinct audience (PE fund administrators, fund managers, and domiciliation service providers).

**Status**: Proposed
**Priority**: Medium — expands RegMap relevance for PE fund administration workflows
**Prerequisite**: Regulatory Map v1 (Complete — 120 regulations across 4 categories)
**Last Updated**: April 3, 2026

---

## Proposed Regulations

### 1. SFDR — Sustainable Finance Disclosure Regulation

| Field | Value |
|---|---|
| **Full Name** | Sustainable Finance Disclosure Regulation (EU) 2019/2088 |
| **Category** | `financial-services` (new) or `industry-compliance` (existing) |
| **Regions** | EU member states |
| **Effective Date** | March 10, 2021 (Level 1); January 1, 2023 (Level 2 RTS) |
| **Summary** | Requires fund managers to disclose how funds consider ESG factors. Funds classified as Article 6 (no ESG claim), Article 8 (promotes ESG characteristics), or Article 9 (sustainable investment objective). |
| **Relevance** | PE, RE, and credit fund managers must produce these disclosures. Fund administrators must collect, validate, and report the underlying ESG data — a data workflow that didn't exist before 2021 and requires dedicated system support. |
| **Penalties** | National competent authority enforcement; reputational risk from greenwashing claims |

### 2. ELTIF 2.0 — European Long-Term Investment Fund (Revised)

| Field | Value |
|---|---|
| **Full Name** | Regulation (EU) 2023/606 amending Regulation (EU) 2015/760 (ELTIF) |
| **Category** | `financial-services` (new) or `industry-compliance` (existing) |
| **Regions** | EU member states |
| **Effective Date** | January 10, 2024 |
| **Summary** | Revised fund structure designed to channel capital into long-term, illiquid assets (infrastructure, PE, real estate). The 2023 "2.0" overhaul relaxed eligibility rules significantly — notably allowing retail investors (not just institutions) to invest in ELTIFs. |
| **Relevance** | More ELTIFs being launched means more fund structures to administer, more investor types to onboard (including retail, which brings stricter KYC obligations), and more regulatory reporting to manage. |
| **Penalties** | National competent authority enforcement; fund authorization revocation |

### 3. AML — Anti-Money Laundering (EU Framework)

| Field | Value |
|---|---|
| **Full Name** | EU Anti-Money Laundering Directives (4AMLD, 5AMLD, 6AMLD) + proposed AMLR |
| **Category** | `financial-services` (new) or `industry-compliance` (existing) |
| **Regions** | EU member states (with national transposition variations) |
| **Effective Date** | Ongoing — 4AMLD (2017), 5AMLD (2020), 6AMLD (2021), AMLR (proposed 2025-2026) |
| **Summary** | Laws, regulations, and procedures designed to prevent criminals from disguising illegally obtained money as legitimate income. Fund administrators are legally required to screen clients, monitor transactions, and report suspicious activity. |
| **Relevance** | AML requirements are continuously tightening across the EU. Administrators must keep updating screening systems, procedures, and staff training. One of the heaviest compliance burdens for fund service providers. |
| **Penalties** | Criminal liability for compliance officers; institutional fines up to 10% of annual turnover; license revocation |

### 4. KYC — Know Your Customer

| Field | Value |
|---|---|
| **Full Name** | Know Your Customer (subset of AML framework) |
| **Category** | `financial-services` (new) or `industry-compliance` (existing) |
| **Regions** | EU member states, US, UK, global (varies by jurisdiction) |
| **Effective Date** | Ongoing — embedded within AML directives and national law |
| **Summary** | The process of verifying client identity before and during a business relationship — confirming who they are, who owns them, and where their money comes from. For fund administrators serving PE and RE funds, KYC means vetting not just the fund itself but the investors behind it (LPs), which can be complex multi-layered structures. |
| **Relevance** | System-level tracking is essential because regulators can audit records at any time. Retail investor access (ELTIF 2.0) increases KYC volume and complexity. |
| **Penalties** | Varies by jurisdiction; typically subsumed under AML penalty framework |

**Implementation Note**: KYC is a process obligation within the broader AML framework, not a standalone regulation. Consider whether to represent it as a separate regulation entry or as a sub-requirement within the AML entry. The RegMap currently models each regulation as a standalone card — a sub-requirement model would require schema changes.

### 5. UBO Registry — Ultimate Beneficial Owner Registry

| Field | Value |
|---|---|
| **Full Name** | EU Ultimate Beneficial Owner Registry (per 4AMLD/5AMLD) |
| **Category** | `financial-services` (new) or `industry-compliance` (existing) |
| **Regions** | EU member states (Luxembourg UBO Register specifically relevant) |
| **Effective Date** | 2017 (4AMLD mandate); Luxembourg registry launched 2019 |
| **Summary** | EU-mandated database where companies must register the natural persons who ultimately own or control them (typically anyone with >25% ownership or effective control). |
| **Relevance** | Fund administrators managing corporate domiciliation are often responsible for ensuring UBO filings are current and accurate. Any change in ownership structure at the fund or holding company level triggers an update obligation. |
| **Penalties** | Administrative fines; criminal liability for non-filing; entity dissolution risk |

**Implementation Note**: The CJEU ruled in November 2022 that public access to UBO registers violates EU privacy rights, leading Luxembourg and other states to restrict access. The regulation entry should note this evolving access landscape.

### 6. FATCA — Foreign Account Tax Compliance Act

| Field | Value |
|---|---|
| **Full Name** | Foreign Account Tax Compliance Act (US) |
| **Category** | `financial-services` (new) or `industry-compliance` (existing) |
| **Regions** | Global (applies to all non-US financial institutions with US person accounts); primary enforcement via bilateral IGAs |
| **Effective Date** | July 1, 2014 |
| **Summary** | US law requiring foreign financial institutions to identify and report accounts held by US persons (citizens and residents) to the IRS. Non-compliance triggers a 30% withholding tax on US-source income. |
| **Relevance** | Many fund clients have US investors. Administrators must identify those investors, collect tax documentation (W-9/W-8 forms), and report annually to local tax authorities (who pass data to the US). Requires system tracking by investor nationality and tax status. |
| **Penalties** | 30% withholding tax on US-source payments; reputational and relationship risk with US counterparties |

**Implementation Note**: FATCA is US-origin but enforced globally via Intergovernmental Agreements (IGAs). The RegMap currently models regulations by the jurisdictions they apply to. FATCA could be modeled as applying to Luxembourg (where the administrator is based) or to the US (where the law originates). Recommend modeling it as applying to all IGA signatory jurisdictions with a note about US origin.

---

## Implementation Decisions Required

### 1. Category Strategy

| Option | Pros | Cons |
|---|---|---|
| **A: New `financial-services` category** | Clean separation; distinct audience; own filter chip and color | Adds a 5th category to the filter bar; may dilute the current privacy/AI/cyber/compliance focus |
| **B: Use existing `industry-compliance`** | No schema change; no new filter chip; simpler | `industry-compliance` becomes a catch-all; less discoverable for fund admin audience |
| **C: New `fund-administration` category** | Most specific; clear signal to PE audience | Narrow; may not generalize well if other financial regulations are added later |

**Recommendation**: Option A (`financial-services`) — the regulations share a common domain (fund administration, investor compliance, tax reporting) that is distinct from the current four categories. A dedicated category with its own color makes them discoverable and filterable.

### 2. KYC Modeling

KYC is a process obligation within AML, not a standalone regulation. Options:

| Option | Approach |
|---|---|
| **A: Standalone entry** | Simpler; consistent with current flat model; users can filter/find it |
| **B: Sub-requirement of AML** | More accurate; requires schema extension (`requirements` array or `parentRegulation` field) |

**Recommendation**: Option A for now — keep it as a standalone entry with a note linking it to AML. Schema extensions for parent-child relationships can be a future enhancement.

### 3. FATCA Region Modeling

FATCA originates in the US but applies globally. Options:

| Option | Approach |
|---|---|
| **A: Model as US regulation** | Simple; shows origin |
| **B: Model as applying to IGA signatory countries** | Accurate; shows where compliance is required |
| **C: Both** | US origin + all IGA countries in the `regions` array |

**Recommendation**: Option C — list the US as origin with IGA signatory countries (100+) in the regions array. This means clicking Luxembourg, Ireland, or any major fund domicile shows FATCA alongside local regulations.

### 4. Data Volume Impact

Adding 6 regulations increases the total from 120 to 126. With FATCA applying to 100+ IGA signatories, the region-to-regulation mapping density increases significantly. Verify that the compliance panel and timeline components handle this gracefully.

---

## Implementation Steps (if approved)

1. Create 6 new JSON files in `src/data/regulatory-map/` following the existing Zod schema
2. Add `financial-services` category to `CATEGORIES` in `src/lib/inoreader/transform.ts` (or equivalent RegMap config)
3. Add category color variable `--regmap-category-financial` to `variables.css`
4. Add filter chip for the new category in CategoryFilter
5. Update unit tests in `tests/unit/regulatory-map-data.test.ts` (category count, regulation count)
6. Update E2E tests if filter behavior changes
7. Update `src/docs/hub/REGULATORY_MAP.md` with new category documentation
8. Verify timeline, compliance panel, and mobile layouts with increased regulation density

---

## Related

- [Regulatory Map Technical Documentation](./REGULATORY_MAP.md)
- [Regulatory Map Data Schema](../../data/regulatory-map/) — Zod-validated JSON files
- [Regulatory Map Filter Tests](../../../tests/unit/regulatory-map-data.test.ts)
