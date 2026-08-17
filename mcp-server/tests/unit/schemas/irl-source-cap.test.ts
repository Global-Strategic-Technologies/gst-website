/**
 * BL-123 — `capIrlSource`, the monotone downgrade.
 *
 * **Why this file gets the sharpest assertions in the change.** The first
 * design of this feature had the server DERIVE `irlSource` from provenance
 * metadata rather than cap it. That would have inverted the BL-070
 * `requireVerbatimBody` gate: `mintedBy: 'prepare-tool'` is produced
 * identically by an interactive partner paste relayed through
 * `prepare_irl_body` and by a model reconstruction from xlsx, so a derived
 * value could never be `model-reconstruction-from-xlsx` — every reconstruction
 * run would have derived to a partner-paste form and PASSED the gate that
 * exists to catch it. UAT-07.6 classifies that as "the gate is not enforcing →
 * Fail — escalate".
 *
 * The assertion that would have caught it is `passes reconstruction assertions
 * through untouched under every metadata value`. It is the reason this suite
 * exists, so it is written first and explicitly.
 */

import { describe, it, expect } from 'vitest';
import {
  capIrlSource,
  computeIrlBodyHash,
  runComposeDossierEnvelope,
  type IrlSource,
} from '../../../src/schemas/compose-dossier-envelope';
import type { IrlBodyMintedBy } from '../../../src/cache/irl-body-provenance';

const ALL_METADATA: readonly (IrlBodyMintedBy | null)[] = ['prompt-render', 'prepare-tool', null];

const NON_PREPOP: readonly IrlSource[] = [
  'partner-paste-verbatim',
  'model-reconstruction-from-xlsx',
  'model-reconstruction-trimmed',
  'placeholder',
];

describe('capIrlSource', () => {
  describe('the inversion guard', () => {
    it('passes reconstruction and placeholder assertions through untouched under EVERY metadata value', () => {
      // If this fails, the gate at compose-dossier-envelope.ts stops separating
      // operator-supplied bodies from model-reconstructed ones, and every
      // reconstruction run silently acquires a partner-paste grade.
      for (const asserted of NON_PREPOP) {
        for (const mintedBy of ALL_METADATA) {
          const result = capIrlSource(asserted, mintedBy);
          expect(result.irlSource, `${asserted} under ${String(mintedBy)}`).toBe(asserted);
          expect(result.capped).toBe(false);
        }
      }
    });

    it('never promotes a weaker assertion, even when the metadata would support more', () => {
      // The server witnessing a prompt-render mint does not license upgrading a
      // claim the model deliberately made weaker — the model may know something
      // about the body's origin that the server cannot see.
      const result = capIrlSource('partner-paste-verbatim', 'prompt-render');
      expect(result.irlSource).toBe('partner-paste-verbatim');
      expect(result.capped).toBe(false);
    });
  });

  describe('the cap itself', () => {
    it('caps an asserted -prepop to partner-paste-verbatim when the body came from the tool', () => {
      const result = capIrlSource('partner-paste-verbatim-prepop', 'prepare-tool');
      expect(result.irlSource).toBe('partner-paste-verbatim');
      expect(result.capped).toBe(true);
    });

    it('leaves an asserted -prepop intact when the prompt render minted the body', () => {
      const result = capIrlSource('partner-paste-verbatim-prepop', 'prompt-render');
      expect(result.irlSource).toBe('partner-paste-verbatim-prepop');
      expect(result.capped).toBe(false);
    });

    it('leaves an asserted -prepop intact when no record is readable, rather than downgrading', () => {
      // `null` means "cannot verify", not "refuted". Downgrading on an
      // unreadable store would punish an honest run for a KV outage; the claim
      // stands and the gap list discloses that it is unverified.
      const result = capIrlSource('partner-paste-verbatim-prepop', null);
      expect(result.irlSource).toBe('partner-paste-verbatim-prepop');
      expect(result.capped).toBe(false);
    });
  });

  it('only ever weakens — the output is never stronger than the assertion', () => {
    // The property the two existing consumers depend on. The gate accepts both
    // partner-paste forms, so a cap can never change a gate outcome; and the
    // reconstruction disclosure can never be silenced by capping.
    const STRENGTH: Record<IrlSource, number> = {
      'partner-paste-verbatim-prepop': 3,
      'partner-paste-verbatim': 2,
      'model-reconstruction-from-xlsx': 1,
      'model-reconstruction-trimmed': 1,
      placeholder: 0,
    };
    const everyAsserted = [...NON_PREPOP, 'partner-paste-verbatim-prepop' as const];
    for (const asserted of everyAsserted) {
      for (const mintedBy of ALL_METADATA) {
        const { irlSource } = capIrlSource(asserted, mintedBy);
        expect(
          STRENGTH[irlSource],
          `${asserted} under ${String(mintedBy)} produced ${irlSource}`
        ).toBeLessThanOrEqual(STRENGTH[asserted]);
      }
    }
  });
});

describe('BL-123 additivity guard — the engine appends nothing without an audit field', () => {
  it('adds no BL-123 gap entry when `irlSourceAudit` is absent', () => {
    // THE guard that keeps this change additive. `irlSourceAudit` is supplied
    // only by the tool handler, never by engine-level tests — so every existing
    // case takes no append path here and its rendered (J) is byte-unchanged.
    //
    // If this fails, the scoping rule was implemented wrong and roughly a dozen
    // exact gap-list assertions across the suite would need rebaselining: an
    // unreadable diff in place of a reviewable one.
    const filledIrl = '# Sample\n\n## 00 — Basics\n- ARR: $45.2M\n'.padEnd(300, '.');
    const result = runComposeDossierEnvelope(
      {
        promptName: 'gst_irl_ingestion',
        promptVersion: '0.17.0',
        modelVersion: 'claude-opus-4-8',
        mode: 'full',
        auditLevel: 'debug',
        transactionContext: 'value-creation',
        fillRatio: { percent: 92, substantiveCells: 46, totalCells: 50, status: 'ok' },
        gatesPassed: ['generate_diligence_agenda'],
        gatesElided: [],
        conditionalTriggersFired: [],
        defaultFiredFrameworks: [],
        forceToolsApplied: [],
        claims: [{ claim: 'ARR ~$45.2M', citation: 'Section 00 — Basics', tier: '3' }],
        gaps: [],
        irlBodyHash: computeIrlBodyHash(filledIrl),
        irlSource: 'partner-paste-verbatim-prepop',
        requireVerbatimBody: false,
        filledIrl,
      },
      { promptVersion: '0.17.0' }
    );
    expect(result.gapListMarkdown).not.toContain('irlSource downgraded by the server');
    expect(result.gapListMarkdown).not.toContain('could not be verified');
  });
});
