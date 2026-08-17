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

// The GST delta — what DeltaIcon.astro emits, attribute for attribute:
// stroke="currentColor" so it follows theme and palette, aria-hidden because it
// is decorative, flex-shrink:0 so a long list item never squashes it. Pass the
// class the consumer uses (.bullet-icon for list bullets, .delta-chevron for a
// collapse toggle, .brutal-option-card__icon inside an option card).
export const Delta = ({ className, size = 14 }: { className: string; size?: number }) => (
  <svg
    className={className}
    viewBox="0 0 64 64"
    fill="none"
    width={size}
    height={size}
    aria-hidden="true"
    style={{ flexShrink: 0 }}
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
