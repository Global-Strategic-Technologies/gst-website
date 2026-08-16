// Specimen gallery — GST hub-tool shell (src/styles/components/tool-shell.css).
// Ported from src/components/brand/BrandComponents.astro.
//
// The shell is the standard container for every hub tool. Width modifiers:
// --narrow (ICG), --wide (Tech Debt Calculator), --document (Diligence
// Machine), --fluid (TechPar).
import * as React from 'react';
import { Stack, Row } from './_kit';

export const ToolShellSpecimen = () => (
  <Stack>
    <Row label="Tool shell">
      <div className="brutal-tool-shell">
        <div className="brutal-tool-shell__content">
          <div className="brutal-tool-shell__authority">Tool Authority Line</div>
          <div className="brutal-tool-shell__section-label">Section Label</div>
          <p className="brutal-text-base">
            Standard hub-tool container: no radius, transparent background, top-border accent.
          </p>
          <button className="brutal-btn brutal-btn--primary">Start assessment</button>
        </div>
      </div>
    </Row>

    <Row label="Skeleton loading">
      <div
        aria-hidden="true"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-sm)',
          minWidth: '320px',
        }}
      >
        <div className="brutal-skeleton-bar" style={{ width: '80%' }} />
        <div
          className="brutal-skeleton-bar brutal-skeleton-bar--sm"
          style={{ width: '40%', animationDelay: '0.3s' }}
        />
        <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
          <div className="brutal-skeleton-dot" />
          <div className="brutal-skeleton-dot" />
          <div className="brutal-skeleton-dot" />
        </div>
      </div>
    </Row>
  </Stack>
);
