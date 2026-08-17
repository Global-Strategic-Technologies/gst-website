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

    <Row label="Slider (bounded numeric)">
      {/* Ported from tech-debt-calculator/index.astro: __header holds __label
          + live __value; __input is a real <input type="range">; __hints holds
          the optional __direct number entry; __clamp-msg is a status line JS
          shows when a typed value is clamped. */}
      <div className="brutal-slider" style={{ width: '100%', maxWidth: '360px' }}>
        <div className="brutal-slider__header">
          <label className="brutal-slider__label" htmlFor="spec-slider">
            Team size
          </label>
          <span className="brutal-slider__value">8</span>
        </div>
        <input
          id="spec-slider"
          type="range"
          min="0"
          max="100"
          step="1"
          defaultValue="14"
          className="brutal-slider__input"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={14}
          aria-valuetext="8 engineers"
        />
        <div className="brutal-slider__hints">
          <input
            type="number"
            className="brutal-slider__direct"
            min="1"
            max="500"
            step="1"
            defaultValue="8"
            aria-label="Number of engineers"
          />
        </div>
        <span
          className="brutal-slider__clamp-msg brutal-text-tiny"
          role="status"
          aria-live="polite"
        >
          Clamped to the 1–500 range.
        </span>
      </div>
    </Row>

    <Row label="Filter drawer (static panel)">
      {/* BrandUILibrary.astro § Filter Drawer — a bordered filter panel with
          its own header/close/clear/section/label children; slide-out
          positioning is the page's job. Pairs with .brutal-filter-chips. */}
      <div className="brutal-filter-drawer">
        <div className="brutal-filter-drawer__header">
          <h2 className="brutal-filter-drawer__title">Filters</h2>
          <button className="brutal-filter-drawer__close" aria-label="Close" type="button">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="brutal-filter-drawer__content">
          <button className="brutal-filter-drawer__clear" type="button">
            Clear All
          </button>
          <div className="brutal-filter-drawer__section">
            <div className="brutal-filter-drawer__label">Growth Stage</div>
            <div className="brutal-filter-chips">
              <button className="brutal-filter-chip brutal-filter-chip--active" type="button">
                All
              </button>
              <button className="brutal-filter-chip" type="button">
                Growth
              </button>
              <button className="brutal-filter-chip" type="button">
                Mature
              </button>
            </div>
          </div>
        </div>
      </div>
    </Row>
  </Stack>
);
