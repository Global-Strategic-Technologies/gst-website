// Specimen gallery — GST frosted-glass utilities (src/styles/global.css).
// Ported from src/components/brand/BrandUILibrary.astro § Frosted Glass Variants.
//
// Rendered over a tinted backdrop, because a blur utility on a flat white
// background is indistinguishable from no blur at all.
import * as React from 'react';

const PANE: React.CSSProperties = {
  padding: 'var(--spacing-lg)',
  minHeight: '60px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'var(--font-family-mono)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-primary)',
};

export const FrostedSpecimen = () => (
  // The backdrop is deliberately high-frequency: blurring a smooth gradient is
  // visually identical to not blurring it, so a stripe pattern is the only way
  // the four blur strengths actually read apart.
  <div
    style={{
      position: 'relative',
      padding: 'var(--spacing-2xl) var(--spacing-lg)',
      background:
        'repeating-linear-gradient(45deg, var(--color-primary) 0 8px, var(--bg-light) 8px 16px)',
    }}
  >
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: 'var(--gap-normal)',
      }}
    >
      <div className="brutal-frosted" style={PANE}>
        Base frost
      </div>
      <div className="brutal-frosted brutal-frosted--heavy" style={PANE}>
        Heavy frost
      </div>
      <div className="brutal-frosted brutal-frosted--blur-only" style={PANE}>
        Blur only
      </div>
      <div className="brutal-frosted brutal-frosted--overlay" style={PANE}>
        Overlay frost
      </div>
    </div>
  </div>
);
