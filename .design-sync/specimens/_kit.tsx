// Shared layout helpers for the GST specimen galleries.
//
// NOT exported from index.tsx — these are scaffolding for the specimen cards,
// not part of the GST design system. Only the *Specimen galleries are merged
// onto window.GST.
import * as React from 'react';

export const Stack = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--spacing-lg)',
      padding: 'var(--spacing-lg)',
    }}
  >
    {children}
  </div>
);

export const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
    <span
      style={{
        fontFamily: 'var(--font-family-mono)',
        fontSize: 'var(--text-2xs)',
        textTransform: 'uppercase',
        letterSpacing: '.1em',
        color: 'var(--text-muted)',
      }}
    >
      {label}
    </span>
    <div
      style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--gap-normal)', alignItems: 'center' }}
    >
      {children}
    </div>
  </div>
);
