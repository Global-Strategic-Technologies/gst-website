// Specimen gallery — GST data-display classes (tiles, callouts, progress).
// Markup ported verbatim from src/components/brand/BrandUILibrary.astro,
// including the BEM sub-element classes (__value, __label, __title, __fill).
import * as React from 'react';
import { Stack, Row } from './_kit';

export const DataSpecimen = () => (
  <Stack>
    <Row label="Stat tiles">
      <div className="brutal-stat-tile">
        <div className="brutal-stat-tile__value">6</div>
        <div className="brutal-stat-tile__label">domains</div>
      </div>
      <div className="brutal-stat-tile">
        <div className="brutal-stat-tile__value">20</div>
        <div className="brutal-stat-tile__label">questions</div>
      </div>
      <div className="brutal-stat-tile">
        <div className="brutal-stat-tile__value">5-7 min</div>
        <div className="brutal-stat-tile__label">to complete</div>
      </div>
    </Row>

    <Row label="Progress bar">
      <div className="brutal-progress-bar" style={{ minWidth: '320px' }}>
        <div className="brutal-progress-bar__track">
          <div className="brutal-progress-bar__fill" style={{ width: '66%' }} />
        </div>
        <span className="brutal-progress-bar__label">4 of 6</span>
      </div>
    </Row>

    <Row label="Callout">
      <div className="brutal-callout" style={{ maxWidth: '500px' }}>
        <span className="brutal-callout__title">Who should complete this assessment.</span> This
        tool takes 5 to 7 minutes. PE investors and executives should complete this alongside their
        engineering lead.
      </div>
    </Row>

    <Row label="Callout — warning">
      <div className="brutal-callout brutal-callout--warning" style={{ maxWidth: '500px' }}>
        <span className="brutal-callout__title">Foundational domain scored below threshold</span>{' '}
        Without foundational visibility in place, scores in other domains may understate the true
        optimization gap.
      </div>
    </Row>
  </Stack>
);
