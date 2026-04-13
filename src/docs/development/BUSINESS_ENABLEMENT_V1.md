# Business Enablement V1

A follow-on initiative to [PLATFORM_HARDENING_V1.md](./PLATFORM_HARDENING_V1.md) focused on business-facing capabilities: GDPR compliance via cookie consent, and lead capture via email signup. Planned to execute **after** the platform hardening initiative completes.

**Status**: Proposed (post-hardening)
**Created**: April 10, 2026
**Priority**: Medium-High (compliance risk for Cookie Consent; lead-gen opportunity for Email Capture)
**Effort**: ~4 days across 2 initiatives
**Prerequisite**: Platform Hardening V1 must be complete

---

## Table of Contents

1. [Context](#context)
2. [Initiative 1: Cookie Consent & GDPR Compliance](#initiative-1-cookie-consent--gdpr-compliance)
3. [Initiative 2: Email Capture](#initiative-2-email-capture)
4. [Summary Timeline](#summary-timeline)
5. [Key Design Decisions](#key-design-decisions)
6. [Commit Strategy](#commit-strategy)
7. [Related Documentation](#related-documentation)

---

## Context

These two initiatives were originally scoped as Phases 6 and 8 of [PLATFORM_HARDENING_V1.md](./PLATFORM_HARDENING_V1.md) but have been refactored into a separate post-hardening initiative for the following reasons:

1. **Scope separation** — Platform hardening is infrastructure work (data validation, CI/CD, code structure, test coverage, SEO, security). Cookie consent and email capture are net-new **business capabilities** that introduce new user-facing UI, new vendor integrations (email service provider), and new legal/compliance obligations. Grouping them with refactoring work mixes concerns.

2. **Stable foundation first** — both initiatives benefit from the platform hardening work being complete before they start:
   - Cookie Consent relies on the hardened CI pipeline (Phase 2) and accessibility testing (Phase 4) to catch regressions
   - Email Capture relies on Zod validation (Phase 1), the hardened CI pipeline (Phase 2), and the refactored footer/CTA components (Phase 3)
   - Both will be instrumented with error monitoring from hardening Phase 7 if issues arise

3. **Decision cadence** — both initiatives require external decisions (email service provider selection, privacy policy legal review, consent banner copy approval) that are better handled as a focused conversation than embedded in a multi-week infrastructure sprint.

### Known gaps that persist until this initiative runs

- **GDPR exposure**: GA4 continues to load unconditionally for EU visitors until Initiative 1 ships. The privacy policy (`src/pages/privacy.astro`) mentions cookies and GDPR rights but provides no consent mechanism. This is a pre-existing gap — not created by Platform Hardening V1 — but remains uncorrected until this initiative runs.
- **Lead capture**: Calendly remains the only conversion path. Prospects not ready to book a call have no alternative way to express interest until Initiative 2 ships.

Both gaps are acceptable to defer because they are not worsened by the hardening work, and hardening delivers more leveraged value in the same calendar time.

---

## Initiative 1: Cookie Consent & GDPR Compliance

**Status**: Proposed
**Priority**: High (compliance)
**Effort**: 2 days
**Dependencies**: Platform Hardening V1 complete (specifically: CI pipeline from Phase 2, accessibility testing from Phase 4, documentation normalization from Phase 8)

### Problem

GA4 currently loads unconditionally via `src/components/GoogleAnalytics.astro` — EU visitors are tracked without explicit consent. The privacy policy (`src/pages/privacy.astro`) mentions cookies and GDPR rights but provides no consent mechanism. This is a GDPR compliance gap.

Additionally, by the time this initiative runs, the hardening initiative will have standardized and expanded tool analytics (hardening Phase 6) and added client-side error monitoring (hardening Phase 7). Those systems currently load without consent — this initiative retroactively gates all tracking behind user consent.

### Scope

- **Create `src/components/CookieConsent.astro`**:
  - Minimal banner rendered in `BaseLayout.astro` (after Header, before main content)
  - Two buttons: "Accept" and "Decline"
  - Built with existing design system (`.brutal-btn`, frosted glass, CSS variables) — no external dependency
  - Stores preference in `localStorage('cookie-consent')`: `'accepted'` | `'declined'`
  - Banner re-appears if no stored preference
  - WCAG 2.1 AA compliant (focus trap, keyboard dismissal, screen reader announcements) — verified by axe-core from hardening Phase 4
- **Gate GA4 on consent** — modify `src/components/GoogleAnalytics.astro`:
  - Check `localStorage('cookie-consent')` before loading gtag script
  - Implement GA4 Consent Mode: `gtag('consent', 'default', { analytics_storage: 'denied' })` on page load; update to `'granted'` on acceptance
  - If declined: GA4 does not load
- **Gate error monitoring on consent** — modify `src/components/ErrorTracking.astro` (created in hardening Phase 7) to respect the same consent preference, OR confirm it uses Sentry's privacy-first config (no PII, errors only) and can run pre-consent under legitimate interest
- **Update privacy policy** — expand `src/pages/privacy.astro` cookie section:
  - Explain the consent banner, what "Accept" enables, how to change preference, data retention
  - Document GA4 Consent Mode behavior
  - Document error monitoring behavior (if Sentry runs pre-consent)
- **Footer preference link** — add "Cookie Preferences" link in `src/components/Footer.astro` that re-opens the consent banner, allowing users to change their choice
- **Tests**:
  - Unit: GA4 does not fire events when consent declined; consent state persists across page loads
  - E2E: banner appears on first visit, disappears after choice, does not reappear; GA4 loads only after acceptance
  - axe-core: consent banner passes WCAG 2.1 AA checks

**Not pursuing**: Heavy cookie consent libraries (Klaro, Osano, CookieConsent.js) — the site uses one tracking tool (GA4) plus error monitoring (Sentry); a custom lightweight component is simpler and avoids an external dependency.

### Commits

```
feat(consent): add CookieConsent component with accept/decline
feat(consent): gate GA4 loading on cookie consent via Consent Mode API
feat(consent): gate error monitoring on cookie consent
docs(privacy): update privacy policy with consent mechanism disclosure
feat(consent): add Cookie Preferences link to footer
test(consent): add unit and E2E tests for consent flow
test(consent): verify banner passes axe-core WCAG 2.1 AA checks
```

### Success Criteria

- GA4 does not load until user explicitly accepts
- Error monitoring respects consent (or runs under documented privacy-first config)
- Consent preference persists across page loads
- Banner does not appear for returning users who have chosen
- "Cookie Preferences" link in footer allows changing choice
- Privacy policy reflects the consent mechanism
- Consent banner passes WCAG 2.1 AA accessibility audit
- Zero GDPR consent violations for EU visitors

---

## Initiative 2: Email Capture

**Status**: Proposed
**Priority**: Medium (lead generation)
**Effort**: 2 days
**Dependencies**: Initiative 1 (consent must gate signup tracking), Platform Hardening V1 complete (specifically: Zod schemas from Phase 1, refactored Footer/CTASection from Phase 3)

### Problem

No lead capture mechanism exists beyond Calendly. For PE firms, many decision-makers want to evaluate GST before committing to a calendar slot. Currently they either book or bounce — there is no middle ground. Email capture creates a low-friction alternative and builds a contact database over time.

### Scope

- **Choose email service** — evaluate Mailchimp, ConvertKit, Buttondown, or Resend:
  - Selection criteria: free tier adequate for low volume, API-based submission (no embed iframes), GDPR-compliant data handling, simple POST endpoint
  - Document the decision with evaluation rationale
- **Create `src/components/EmailSignup.astro`**:
  - Minimal form: email input + submit button + privacy link
  - Scoped `<style>` following design system (`.brutal-btn`, `--color-primary`, frosted glass)
  - Inline `<script>` handles submission via `fetch()` to email service API
  - States: default, submitting (disabled button), success, error
  - No full name required — minimize friction
  - WCAG 2.1 AA compliant: proper label association, error announcements via `aria-live`, focus management on state change
- **Integrate into Footer** — add `<EmailSignup />` to `src/components/Footer.astro` below existing links. Brief copy: "Get GST insights delivered" or similar — one line, not a paragraph. Visible on every page.
- **Evaluate CTA section integration** — optionally add to `src/components/CTASection.astro` as secondary action alongside Calendly: "Not ready to talk? Get updates instead." Decision depends on whether dual CTAs dilute the primary conversion
- **Track signups** — `trackEvent({ event: 'email_signup', category: 'engagement', source: 'footer' | 'cta-section' })` — respects cookie consent from Initiative 1
- **Update privacy policy** — add email collection disclosure to `src/pages/privacy.astro`: what data is collected (email only), how it's used (periodic updates), how to unsubscribe, which service stores it
- **Zod validation** — validate email format with Zod schemas from hardening Phase 1 (or simple regex if Zod isn't loaded client-side); reuse the build-time validation infrastructure
- **Tests**:
  - Unit: form validation (empty, invalid email, valid email); correct API call payload
  - E2E: form renders in footer, submit shows success state, error state on network failure
  - axe-core: form passes WCAG 2.1 AA checks including label association and error announcements

### Commits

```
docs(email): document email service evaluation and selection
feat(email): add EmailSignup component with Zod validation
feat(email): integrate EmailSignup into Footer
feat(analytics): add email_signup event tracking gated on consent
docs(privacy): add email collection disclosure to privacy policy
test(email): add unit tests for form validation and API payload
test(email): add E2E tests for footer form and error states
test(email): verify form passes axe-core WCAG 2.1 AA checks
```

### Success Criteria

- Email signup form visible in footer on all pages
- Successful submissions recorded in chosen email service
- GA4 event fires on signup (only when consent granted — verified by Initiative 1 tests)
- Privacy policy updated with email collection disclosure
- Form handles error states gracefully (network failure, API error, validation error)
- Zero PII stored in client-side code or localStorage
- Form passes WCAG 2.1 AA accessibility audit

---

## Summary Timeline

| Initiative | Scope                            | Effort     | Prerequisite                                          |
| ---------- | -------------------------------- | ---------- | ----------------------------------------------------- |
| 1          | Cookie Consent & GDPR Compliance | 2 days     | Platform Hardening V1 complete                        |
| 2          | Email Capture                    | 2 days     | Initiative 1 + Platform Hardening V1 complete         |
|            | **Total**                        | **4 days** | **~1 week at full focus, ~2 weeks at 50% allocation** |

---

## Key Design Decisions

1. **Custom cookie consent, no external library** — site uses one tracking tool (GA4) plus error monitoring with no ad cookies; a custom Astro component is simpler and faster than Klaro/Osano/CookieConsent.js; uses GA4 Consent Mode API for standards-compliant gating

2. **Email capture in footer, not modal/popup** — always visible, zero-friction, no interruption; avoids aggressive popup patterns that conflict with the professional PE advisory brand

3. **Consent banner before any tracking, not just GA4** — Initiative 1 must gate _all_ tracking mechanisms (GA4, Sentry error monitoring, any future analytics), not just the one that existed when consent was originally designed. This prevents "add tracking later, forget to gate it" regressions.

4. **Email validation via Zod** — reuses the schema infrastructure from Platform Hardening V1 Phase 1; avoids duplicate validation logic between client and potential future server-side handling

5. **Accessibility is mandatory, not optional** — both user-facing components (consent banner, email form) must pass the axe-core WCAG 2.1 AA checks established in Platform Hardening V1 Phase 4. No regression allowed.

---

## Commit Strategy

Follow the same atomic commit discipline as [PLATFORM_HARDENING_V1.md](./PLATFORM_HARDENING_V1.md#commit-strategy):

- **Format**: `type(scope): description` per Conventional Commits
- **One concern per commit** — a new component and its tests may share a commit, but don't mix consent logic with email signup
- **Tests travel with the code they test**
- **Each commit should build**
- **Infrastructure before features** — consent gating must land before new tracking events are added that depend on it

### Example: Initiative 1 commit sequence

```
# Component foundation
feat(consent): add CookieConsent component with accept/decline

# Gate existing tracking systems
feat(consent): gate GA4 loading on cookie consent via Consent Mode API
feat(consent): gate error monitoring on cookie consent

# User controls
feat(consent): add Cookie Preferences link to footer

# Documentation
docs(privacy): update privacy policy with consent mechanism disclosure

# Tests (may be combined with feature commits if small)
test(consent): add unit and E2E tests for consent flow
test(consent): verify banner passes axe-core WCAG 2.1 AA checks
```

### Example: Initiative 2 commit sequence

```
# Decision record
docs(email): document email service evaluation and selection

# Component foundation
feat(email): add EmailSignup component with Zod validation

# Integration
feat(email): integrate EmailSignup into Footer
feat(analytics): add email_signup event tracking gated on consent

# Documentation
docs(privacy): add email collection disclosure to privacy policy

# Tests
test(email): add unit tests for form validation and API payload
test(email): add E2E tests for footer form and error states
test(email): verify form passes axe-core WCAG 2.1 AA checks
```

---

## Related Documentation

- [PLATFORM_HARDENING_V1.md](./PLATFORM_HARDENING_V1.md) — Prerequisite hardening initiative; this document is the "next steps" referenced there
- [DEVELOPMENT_OPPORTUNITIES.md](./DEVELOPMENT_OPPORTUNITIES.md) — Performance monitoring initiatives
- [GOOGLE_ANALYTICS.md](../analytics/GOOGLE_ANALYTICS.md) — Current GA4 integration guide (will be updated by Initiative 1)
- [BRAND_GUIDELINES.md](../styles/BRAND_GUIDELINES.md) — Brand voice and design philosophy (governs banner/form copy tone)
- [STYLES_GUIDE.md](../styles/STYLES_GUIDE.md) — CSS conventions for new components
- [TEST_STRATEGY.md](../testing/TEST_STRATEGY.md) — Test patterns by component type
- Privacy Policy: `src/pages/privacy.astro` — to be updated by both initiatives

---

**Created**: April 10, 2026
