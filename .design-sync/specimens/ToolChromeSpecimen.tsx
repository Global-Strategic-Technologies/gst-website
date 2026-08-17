// Specimen gallery — the shared furniture of every GST hub tool
// (src/styles/components/tool-ui.css, progress.css, table.css). Ported from the
// production consumers: infrastructure-cost-governance (action bar, bench
// note, methodology), techpar (tab bar, bench table) and diligence-machine
// (wizard stepper). ToolShellSpecimen shows the container these sit inside.
import * as React from 'react';
import { Stack, Row } from './_kit';

// The wizard step glyph is the 64×64 delta with an SVG <text> number inside;
// state colouring keys on the path (completed) and the <text> fill.
const WizardStep = ({
  n,
  label,
  state,
}: {
  n: number;
  label: string;
  state?: 'active' | 'completed';
}) => (
  <div className={`tool-wizard-step${state ? ` tool-wizard-step--${state}` : ''}`}>
    <svg className="tool-wizard-step__icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path
        d="M32 12 L52 52 L12 52 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="miter"
      />
      <text
        x="32"
        y="40"
        textAnchor="middle"
        dominantBaseline="middle"
        className="tool-wizard-step__number"
      >
        {n}
      </text>
    </svg>
    <span className="tool-wizard-step__label">{label}</span>
  </div>
);

export const ToolChromeSpecimen = () => (
  <Stack>
    <Row label="Action bar (results footer)">
      {/* infrastructure-cost-governance/index.astro § results — a row of
          .brutal-btn actions; --center/--end align, --bordered adds the top
          hairline, --frosted the surface, --stack collapses at 480px. */}
      <div
        className="tool-action-bar tool-action-bar--center tool-action-bar--bordered tool-action-bar--stack"
        style={{ width: '100%' }}
      >
        <button type="button" className="brutal-btn brutal-btn--secondary">
          Copy summary
        </button>
        <button type="button" className="brutal-btn brutal-btn--secondary">
          Copy link
        </button>
        <a href="#" className="brutal-btn brutal-btn--secondary">
          Send to engineering lead
        </a>
      </div>
    </Row>

    <Row label="Tab bar (in-tool panels)">
      {/* techpar/index.astro § tabs — sticky + frosted by default (position
          overridden here only so the gallery card lays out); keep aria-selected
          in sync with --active yourself, the CSS keys on the class alone. */}
      <div
        className="tool-tab-bar"
        role="tablist"
        aria-label="Sections"
        style={{ position: 'static', width: '100%' }}
      >
        <button className="tool-tab tool-tab--active" type="button" role="tab" aria-selected="true">
          <svg
            className="tool-tab__icon"
            width="16"
            height="16"
            viewBox="0 0 64 64"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinejoin="miter"
            aria-hidden="true"
          >
            <rect x="12" y="12" width="40" height="40" />
          </svg>
          <span className="tool-tab__label">Profile</span>
        </button>
        <button className="tool-tab" type="button" role="tab" aria-selected="false">
          <svg
            className="tool-tab__icon"
            width="16"
            height="16"
            viewBox="0 0 64 64"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            aria-hidden="true"
          >
            <circle cx="32" cy="32" r="20" />
          </svg>
          <span className="tool-tab__label">Costs</span>
        </button>
        <button className="tool-tab" type="button" role="tab" aria-selected="false">
          <span className="tool-tab__label">Results</span>
        </button>
      </div>
    </Row>

    <Row label="Wizard stepper (multi-step tools)">
      {/* diligence-machine/index.astro — states are --completed (done),
          --active (current), --reachable (visited-ahead), else faded. Ships
          desktop-only; the page swaps in .tool-wizard-progress-mobile at 480px. */}
      <div
        className="tool-wizard-progress"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={5}
        aria-valuenow={2}
        aria-label="Wizard progress"
        style={{ width: '100%' }}
      >
        <WizardStep n={1} label="Transaction" state="completed" />
        <WizardStep n={2} label="Product" state="active" />
        <WizardStep n={3} label="Tech Stack" />
        <WizardStep n={4} label="Team" />
        <WizardStep n={5} label="Results" />
      </div>
    </Row>

    <Row label="Bench table + note">
      {/* techpar/index.astro § benchmarks — two <td>s per row, no <thead>;
          __active on the user's row, __label pills appended in the first cell,
          then a .tool-bench-note (always paired with brutal-text-tiny). */}
      <div style={{ width: '100%', maxWidth: '520px' }}>
        <table className="brutal-bench-table">
          <tbody>
            <tr>
              <td>Seed / Pre-A</td>
              <td>60–100%</td>
            </tr>
            <tr className="brutal-bench-table__active">
              <td>
                Series A{' '}
                <span className="brutal-bench-table__label brutal-bench-table__label--stage">
                  Your stage
                </span>{' '}
                <span className="brutal-bench-table__label brutal-bench-table__label--score">
                  Your ratio
                </span>
              </td>
              <td>45–75%</td>
            </tr>
            <tr>
              <td>Series B–C</td>
              <td>35–55%</td>
            </tr>
          </tbody>
        </table>
        <div className="tool-bench-note brutal-text-tiny">
          Ranges reflect illustrative patterns from GST diligence engagements. Individual results
          vary with team maturity and infrastructure complexity.
        </div>
      </div>
    </Row>

    <Row label="Methodology disclosure">
      {/* infrastructure-cost-governance/index.astro § methodology — must be
          <details>/<summary>: the marker rotation keys on [open] and the
          direct-child combinator. --delta swaps the ▶ glyph for the GST delta. */}
      <details className="tool-methodology tool-methodology--delta" style={{ width: '100%' }} open>
        <summary className="tool-methodology__trigger">How the assessment works</summary>
        <div className="tool-methodology__body">
          <h4 className="tool-methodology__heading">Scoring model</h4>
          <p>
            Six domains, each scored 0–4 against maturity criteria; the composite is unweighted.
          </p>
          <p className="tool-methodology__updated">Methodology last updated March 2026</p>
          <div className="tool-methodology__author">
            <span className="tool-methodology__author-name">Reid Peryam</span>
            <span className="tool-methodology__author-sep">&middot;</span>
            <span>Strategic Technology Advisor</span>
          </div>
        </div>
      </details>
    </Row>
  </Stack>
);
