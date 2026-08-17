// Specimen gallery — GST form controls (src/styles/components/form.css,
// filter.css). Ported from src/components/brand/BrandUILibrary.astro
// § Form Controls.
import * as React from 'react';
import { Stack, Row } from './_kit';

export const FormSpecimen = () => (
  <Stack>
    <Row label="Text input">
      <input className="brutal-input" type="text" placeholder="Brutalist text input" />
    </Row>

    <Row label="Filter chips">
      <div className="brutal-filter-chips">
        <button className="brutal-filter-chip brutal-filter-chip--active" type="button">
          All
        </button>
        <button className="brutal-filter-chip" type="button">
          Diligence
        </button>
        <button className="brutal-filter-chip" type="button">
          Infrastructure
        </button>
        <button className="brutal-filter-chip" type="button">
          Regulatory
        </button>
      </div>
    </Row>

    <Row label="Segmented control">
      <div className="brutal-segmented">
        <button className="brutal-segmented__btn brutal-segmented__btn--active" type="button">
          Overview
        </button>
        <button className="brutal-segmented__btn" type="button">
          Detail
        </button>
        <button className="brutal-segmented__btn" type="button">
          Sources
        </button>
      </div>
    </Row>

    <Row label="Field">
      {/* Ported from BrandComponents.astro § Form Field. The field's own
          sub-elements, not .brutal-input: __label stacks above the control,
          __input is the full-width field variant (both are dashed, solid on focus), __req marks
          a required field, __hint sits below. */}
      <div className="brutal-field" style={{ minWidth: '280px' }}>
        <label className="brutal-field__label" htmlFor="spec-field">
          Portfolio company <span className="brutal-field__req">(required)</span>
        </label>
        <input
          id="spec-field"
          className="brutal-field__input"
          type="text"
          defaultValue="Kestrel Retail Systems"
        />
        <div className="brutal-field__hint brutal-text-tiny">
          Legal entity as it appears in the SPA.
        </div>
      </div>
    </Row>

    <Row label="Field with prefix">
      {/* Ported from src/pages/hub/tools/techpar/index.astro (the ARR input):
          the wrap positions the prefix; the input pads for it. */}
      <div className="brutal-field" style={{ minWidth: '280px' }}>
        <label className="brutal-field__label" htmlFor="spec-field-arr">
          Annual recurring revenue
        </label>
        <div className="brutal-field__input-wrap">
          <span className="brutal-field__prefix">$</span>
          <input
            id="spec-field-arr"
            className="brutal-field__input brutal-field__input--has-prefix"
            type="text"
            inputMode="numeric"
            placeholder="e.g. 12,500,000"
          />
        </div>
      </div>
    </Row>
  </Stack>
);
