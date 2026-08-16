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
      {/* .brutal-field__label is the field's own label class — it already
          stacks above the control (display:flex + margin-bottom). */}
      <div className="brutal-field" style={{ minWidth: '280px' }}>
        <label className="brutal-field__label" htmlFor="spec-field">
          Portfolio company
        </label>
        <input
          id="spec-field"
          className="brutal-input"
          type="text"
          defaultValue="Kestrel Retail Systems"
        />
      </div>
    </Row>
  </Stack>
);
