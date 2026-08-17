// Specimen gallery — GST card families (src/styles/components/cards.css).
// Ported from src/components/brand/BrandUILibrary.astro § Cards, the hub
// library gateway (src/pages/hub/library/index.astro), the Diligence Machine
// option grid (src/pages/hub/tools/diligence-machine/index.astro) and the
// services FAQ (src/pages/services.astro).
//
// Note: there is no generic .brutal-card. Cards are a named family and each
// carries its own BEM sub-elements.
import * as React from 'react';
import { Stack, Row, Delta } from './_kit';

export const CardSpecimen = () => (
  <Stack>
    <Row label="Recommendation card">
      {/* Sizing lives on a wrapper, never on the card — the grid owns the
          columns (BrandUILibrary.astro puts max-width on the wrapper too). */}
      <div style={{ maxWidth: '600px', width: '100%' }}>
        <div className="brutal-rec-card">
          <div className="brutal-rec-card__body">
            <div className="brutal-rec-card__title">
              <span className="brutal-rec-card__badge brutal-rec-card__badge--high">High</span>
              <span className="brutal-rec-card__badge brutal-rec-card__badge--effort">
                Quick Win
              </span>
              <button className="brutal-rec-card__na" type="button" title="Mark as not applicable">
                N/A
              </button>
              Deploy a cloud cost visibility dashboard
              <Delta className="delta-chevron" />
            </div>
            <div className="brutal-rec-card__desc">
              Implement AWS Cost Explorer, GCP Billing dashboards, or a FinOps platform. Engineering
              leads need direct access with no approval gate.
            </div>
          </div>
        </div>
      </div>
    </Row>

    <Row label="Attention card">
      <div style={{ maxWidth: '600px', width: '100%' }}>
        <div className="brutal-attention-card brutal-attention-card--high">
          <div className="brutal-attention-card__header">
            <h3 className="brutal-attention-card__title">Key-Person Technical Dependencies</h3>
            <button className="brutal-na-btn" type="button" title="Mark as not applicable">
              N/A
            </button>
            <Delta className="delta-chevron" />
          </div>
          <p className="brutal-attention-card__desc">
            Small engineering teams in on-premise environments often concentrate critical knowledge
            in 1–2 individuals. Assess key person dependencies and knowledge gaps before close.
          </p>
        </div>
      </div>
    </Row>

    <Row label="Option cards (choice)">
      {/* Ported from diligence-machine/index.astro § transaction step: real
          <button>s with aria-pressed; .options-grid owns the column. Modifiers:
          --selected-outline (chosen), --unsure (the "not sure" peer), --compact
          (dense text-only groups, e.g. a stage picker). */}
      <div className="options-grid">
        <button className="brutal-option-card" type="button" aria-pressed="false">
          <span className="brutal-option-card__label">
            <Delta className="brutal-option-card__icon" />
            Full Acquisition
          </span>
          <span className="brutal-option-card__description">
            Complete purchase of the target entity
          </span>
        </button>
        <button
          className="brutal-option-card brutal-option-card--selected-outline"
          type="button"
          aria-pressed="true"
        >
          <span className="brutal-option-card__label">
            <Delta className="brutal-option-card__icon" />
            Minority Investment
          </span>
          <span className="brutal-option-card__description">
            Partial stake with board or observer rights
          </span>
        </button>
        <button
          className="brutal-option-card brutal-option-card--unsure"
          type="button"
          aria-pressed="false"
        >
          <span className="brutal-option-card__label">
            <Delta className="brutal-option-card__icon" />
            Not sure
          </span>
        </button>
      </div>
      <div
        role="radiogroup"
        aria-label="Company stage"
        style={{ display: 'flex', gap: 'var(--spacing-sm)' }}
      >
        <button
          className="brutal-option-card brutal-option-card--compact brutal-option-card--selected"
          type="button"
          role="radio"
          aria-checked="true"
        >
          <span className="brutal-option-card__label">Series A</span>
          <span className="brutal-option-card__description">45–75%</span>
        </button>
        <button
          className="brutal-option-card brutal-option-card--compact"
          type="button"
          role="radio"
          aria-checked="false"
        >
          <span className="brutal-option-card__label">Series B–C</span>
          <span className="brutal-option-card__description">35–55%</span>
        </button>
      </div>
    </Row>

    <Row label="Gateway card">
      {/* Structure ported from src/pages/hub/library/index.astro — the real
          consumer. Note the BEM sub-elements and that the CTA is
          `cta-button brutal-gateway-card__cta`, not a .brutal-btn. A card with
          no live CTA carries a __badge instead (hub/tools/index.astro). */}
      <div className="brutal-gateway-grid">
        <article className="brutal-gateway-card brutal-frosted">
          <div className="brutal-gateway-card__header">
            <h2>Business &amp; Technology Architectures</h2>
          </div>
          <ul className="brutal-gateway-card__features">
            <li>
              <Delta className="bullet-icon" />
              How architecture choices cascade into business outcomes
            </li>
            <li>
              <Delta className="bullet-icon" />
              Five layers from software foundations to industry forces
            </li>
            <li>
              <Delta className="bullet-icon" />
              Diligence focus areas for investors, executives &amp; founders
            </li>
          </ul>
          <a href="#" className="cta-button brutal-gateway-card__cta">
            Read Article
          </a>
        </article>
        <article className="brutal-gateway-card brutal-frosted">
          <div className="brutal-gateway-card__header">
            <h2>Acquisition Integration Priority Matrix</h2>
          </div>
          <ul className="brutal-gateway-card__features">
            <li>
              <Delta className="bullet-icon" />
              Map the tech stacks of two merging companies
            </li>
          </ul>
          <span className="brutal-gateway-card__badge">Planned</span>
        </article>
      </div>
    </Row>

    <Row label="Teaser card">
      {/* Ported from BrandUILibrary.astro § Teaser Card: __header > h2 (element
          selector), __features <ul> with bullet deltas, __badge, and a __cta
          that is also a .brutal-btn. */}
      <article className="brutal-teaser-card">
        <div className="brutal-teaser-card__header">
          <h2>Technology Cost Benchmarking</h2>
        </div>
        <ul className="brutal-teaser-card__features">
          <li>
            <Delta className="bullet-icon" />
            Revenue-normalized cost analysis
          </li>
          <li>
            <Delta className="bullet-icon" />
            Stage-aware benchmark ranges
          </li>
        </ul>
        <span className="brutal-teaser-card__badge">Live</span>
        <button className="brutal-btn brutal-btn--primary brutal-teaser-card__cta" type="button">
          Launch Tool
        </button>
      </article>
    </Row>

    <Row label="Trust card">
      {/* BrandUILibrary.astro § Trust Card — keys on bare h3 + p, no BEM children. */}
      <div style={{ maxWidth: '360px' }}>
        <div className="brutal-trust-card">
          <h3>Vendor-Neutral Analysis</h3>
          <p>
            Independent assessment without platform bias. Recommendations based solely on
            organizational fit and strategic alignment.
          </p>
        </div>
      </div>
    </Row>

    <Row label="FAQ (accordion)">
      {/* Ported from src/pages/services.astro: native <details>/<summary>; the
          [open] attribute drives the border, so the elements are not optional.
          Production co-applies .brutal-frosted on each item and puts a
          .delta-chevron in the summary (rotates via details[open]). */}
      <div className="brutal-faq brutal-faq--lg" style={{ width: '100%', maxWidth: '600px' }}>
        <details className="brutal-faq__item brutal-frosted" open>
          <summary className="brutal-faq__question">
            <span>How long does a technical diligence engagement take?</span>
            <Delta className="delta-chevron" />
          </summary>
          <div className="brutal-faq__answer">
            <p>Two to three weeks from data-room access to executive readout.</p>
          </div>
        </details>
        <details className="brutal-faq__item brutal-frosted">
          <summary className="brutal-faq__question">
            <span>Do you work buy-side and sell-side?</span>
            <Delta className="delta-chevron" />
          </summary>
          <div className="brutal-faq__answer">
            <p>Both, plus post-close value creation.</p>
          </div>
        </details>
      </div>
    </Row>
  </Stack>
);
