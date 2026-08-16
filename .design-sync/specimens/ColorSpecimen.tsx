// Specimen gallery — GST color tokens.
//
// Every swatch reads its color from the live CSS custom property, so this card
// tracks whatever variables.css / palettes.css currently define. It follows
// html.dark-theme and all six html.palette-N classes for free — the same
// property that makes it a useful specimen makes it impossible to drift.
import * as React from 'react';

const Swatch = ({ token }: { token: string }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '104px' }}>
    <div
      style={{
        height: '48px',
        background: `var(${token})`,
        border: '1px solid var(--border-light)',
      }}
    />
    <code
      style={{
        fontFamily: 'var(--font-family-mono)',
        fontSize: 'var(--text-2xs)',
        color: 'var(--text-muted)',
        wordBreak: 'break-all',
      }}
    >
      {token}
    </code>
  </div>
);

const Group = ({ label, tokens }: { label: string; tokens: string[] }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
    <span className="brutal-label-small">{label}</span>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--gap-tight)' }}>
      {tokens.map((t) => (
        <Swatch key={t} token={t} />
      ))}
    </div>
  </div>
);

export const ColorSpecimen = () => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--spacing-lg)',
      padding: 'var(--spacing-lg)',
    }}
  >
    <Group
      label="Brand"
      tokens={['--color-primary', '--color-primary-dark', '--color-secondary', '--color-tertiary']}
    />
    <Group
      label="Status"
      tokens={['--color-success', '--color-warning', '--color-error', '--color-info']}
    />
    <Group
      label="Primary opacity scale"
      tokens={[
        '--color-primary-05',
        '--color-primary-10',
        '--color-primary-20',
        '--color-primary-30',
        '--color-primary-50',
        '--color-primary-65',
      ]}
    />
    <Group
      label="Surfaces"
      tokens={['--bg-light', '--bg-light-alt', '--surface-subtle-bg', '--surface-panel-bg']}
    />
  </div>
);
