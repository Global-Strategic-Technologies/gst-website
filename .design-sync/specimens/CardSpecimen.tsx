// Specimen gallery — GST card families (src/styles/components/cards.css).
// Ported from src/components/brand/BrandUILibrary.astro § Cards.
//
// Note: there is no generic .brutal-card. Cards are a named family and each
// carries its own BEM sub-elements.
import * as React from 'react';
import { Stack, Row } from './_kit';

// The GST delta bullet — DeltaIcon.astro rendered inline. stroke="currentColor"
// so it follows theme and palette; .bullet-icon carries the primary color.
const BulletDelta = () => (
  <svg
    className="bullet-icon"
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
  >
    <path
      d="M32 12 L52 52 L12 52 Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="6"
      strokeLinejoin="miter"
    />
  </svg>
);

const DeltaChevron = () => (
  <svg className="delta-chevron" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M32 12 L52 52 L12 52 Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="6"
      strokeLinejoin="miter"
    />
  </svg>
);

export const CardSpecimen = () => (
  <Stack>
    <Row label="Recommendation card">
      <div className="brutal-rec-card" style={{ maxWidth: '600px' }}>
        <div className="brutal-rec-card__body">
          <div className="brutal-rec-card__title">
            <span className="brutal-rec-card__badge brutal-rec-card__badge--high">High</span>
            <span className="brutal-rec-card__badge brutal-rec-card__badge--effort">Quick Win</span>
            <button className="brutal-rec-card__na" type="button" title="Mark as not applicable">
              N/A
            </button>
            Deploy a cloud cost visibility dashboard
            <DeltaChevron />
          </div>
          <div className="brutal-rec-card__desc">
            Implement AWS Cost Explorer, GCP Billing dashboards, or a FinOps platform. Engineering
            leads need direct access with no approval gate.
          </div>
        </div>
      </div>
    </Row>

    <Row label="Attention card">
      <div
        className="brutal-attention-card brutal-attention-card--high"
        style={{ maxWidth: '600px' }}
      >
        <div className="brutal-attention-card__header">
          <h3 className="brutal-attention-card__title">Key-Person Technical Dependencies</h3>
          <button className="brutal-na-btn" type="button" title="Mark as not applicable">
            N/A
          </button>
          <DeltaChevron />
        </div>
        <p className="brutal-attention-card__desc">
          Small engineering teams in on-premise environments often concentrate critical knowledge in
          1–2 individuals. Assess key person dependencies and knowledge gaps before close.
        </p>
      </div>
    </Row>

    <Row label="Gateway card">
      {/* Structure ported from src/pages/hub/library/index.astro — the real
          consumer. Note the BEM sub-elements and that the CTA is
          `cta-button brutal-gateway-card__cta`, not a .brutal-btn. */}
      <div className="brutal-gateway-grid">
        <article className="brutal-gateway-card brutal-frosted">
          <div className="brutal-gateway-card__header">
            <h2>Business &amp; Technology Architectures</h2>
          </div>
          <ul className="brutal-gateway-card__features">
            <li>
              <BulletDelta />
              How architecture choices cascade into business outcomes
            </li>
            <li>
              <BulletDelta />
              Five layers from software foundations to industry forces
            </li>
            <li>
              <BulletDelta />
              Diligence focus areas for investors, executives &amp; founders
            </li>
          </ul>
          <a href="#" className="cta-button brutal-gateway-card__cta">
            Read Article
          </a>
        </article>
      </div>
    </Row>
  </Stack>
);
