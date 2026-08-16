// Specimen gallery — GST buttons.
//
// Buttons are STYLES_GUIDE mechanism 3: the classes live in
// src/styles/components/buttons.css with no .astro component behind them, so
// this markup IS the real thing, not a replica. Ported from
// src/components/brand/BrandComponents.astro.
//
// Only two variants exist — --primary and --secondary. Others were removed
// 2026-08-09 (see BrandComponents.astro).
import * as React from 'react';
import { Stack, Row } from './_kit';

export const ButtonSpecimen = () => (
  <Stack>
    <Row label="Variants">
      <button className="brutal-btn brutal-btn--primary">Primary</button>
      <button className="brutal-btn brutal-btn--secondary">Secondary</button>
      <button className="brutal-btn brutal-btn--primary" disabled>
        Disabled
      </button>
    </Row>
    <Row label="Full width">
      <button className="brutal-btn brutal-btn--primary brutal-btn--full">Full Width</button>
    </Row>
    <Row label="Choice buttons">
      <button className="brutal-choice-btn" type="button">
        Default Choice
      </button>
      <button className="brutal-choice-btn brutal-choice-btn--selected" type="button">
        Selected Choice
      </button>
      <button className="brutal-choice-btn brutal-choice-btn--unsure" type="button">
        Unsure Choice
      </button>
    </Row>
    <Row label="Legacy CTA">
      <a className="cta-button" href="#">
        Request diligence
      </a>
    </Row>
  </Stack>
);
