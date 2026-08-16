// Specimen gallery — GST typography utilities (src/styles/typography.css).
// Ported from src/components/brand/BrandTypography.astro + BrandUILibrary.astro.
import * as React from 'react';
import { Stack, Row } from './_kit';

export const TypographySpecimen = () => (
  <Stack>
    <Row label="Headings">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
        <span className="brutal-heading-xl">Heading XL</span>
        <span className="brutal-heading-lg">Heading LG</span>
        <span className="brutal-heading-md">Heading MD</span>
        <span className="brutal-heading-sm">Heading SM</span>
      </div>
    </Row>
    <Row label="Body">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
        <span className="brutal-text-base">
          Body base — technical diligence for private equity investors.
        </span>
        <span className="brutal-text-small">Body small — supporting detail and captions.</span>
        <span className="brutal-text-tiny">Body tiny — footnotes and metadata.</span>
      </div>
    </Row>
    <Row label="Labels">
      <span className="brutal-label">Brutal Label</span>
      <span className="brutal-label-small">Label Small</span>
      <span className="brutal-content-label">Section Content Label</span>
    </Row>
    <Row label="Data (monospace)">
      <span className="brutal-data">42.7%</span>
      <span className="brutal-data-sm">1,204 units</span>
    </Row>
  </Stack>
);
