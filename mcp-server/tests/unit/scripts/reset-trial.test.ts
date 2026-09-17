/**
 * BL-152 follow-up — helper unit tests for `scripts/reset-trial.mjs`.
 *
 * Every exported helper is pure, so this file exercises them directly; nothing
 * here touches the network or the admin API. The value of the wrapper is its
 * guardrails (preview-before-delete, trial-only, a clientId that must exist),
 * so that is what these assert.
 */

import { describe, it, expect } from 'vitest';
import {
  parseArgs,
  renderPreview,
  renderTrialList,
  TRIAL_CLIENT_NAME,
} from '../../../scripts/reset-trial.mjs';
import { TRIAL_CLIENT_NAME as SERVER_TRIAL_NAME } from '../../../src/trial/signup';
import { BASE_URLS } from '../../../scripts/provision-client.mjs';

describe('reset-trial — parity with the server', () => {
  it('mirrors TRIAL_CLIENT_NAME from src/trial/signup.ts', () => {
    // The .mjs cannot import the TypeScript module at runtime, so it carries a
    // hand-written mirror; this is the only thing stopping it drifting. If it
    // drifted, `--client` would refuse every real trial.
    expect(TRIAL_CLIENT_NAME).toBe(SERVER_TRIAL_NAME);
  });
});

describe('reset-trial — parseArgs', () => {
  it('defaults to production and requires an action', () => {
    expect(parseArgs(['--client', 'c-1'])).toEqual({
      client: 'c-1',
      env: 'production',
      list: false,
      yes: false,
    });
    expect(() => parseArgs([])).toThrow(/--client .* required/);
  });

  it('never lets a flag be swallowed as a value', () => {
    // `--client --yes` would otherwise parse as client='--yes' with yes UNSET:
    // a delete aimed at a clientId that cannot exist, from an invocation the
    // operator believed named one.
    expect(() => parseArgs(['--client', '--yes'])).toThrow(/requires a value/);
  });

  it('rejects an unknown env and unknown flags', () => {
    expect(() => parseArgs(['--client', 'c-1', '--env', 'dev'])).toThrow(/--env must be one of/);
    expect(() => parseArgs(['--client', 'c-1', '--force'])).toThrow(/Unknown argument/);
    expect(Object.keys(BASE_URLS)).toContain('staging');
  });

  it('takes --list with no clientId', () => {
    expect(parseArgs(['--list']).list).toBe(true);
  });
});

describe('reset-trial — rendering', () => {
  const trial = {
    clientId: 'c-1',
    name: 'trial',
    tier: 'trial',
    createdAt: '2026-09-09T01:21:00.000Z',
    expiresAt: '2026-09-12T01:21:00.000Z',
  };

  it('lists only trial records', () => {
    const out = renderTrialList([trial, { clientId: 'c-2', name: 'Acme', tier: 'paid' }]);
    expect(out).toContain('c-1');
    expect(out).not.toContain('c-2');
    expect(out).toContain('1 trial record');
  });

  it('says so plainly when there are none', () => {
    expect(renderTrialList([{ clientId: 'c-2', name: 'Acme' }])).toBe('No trial records exist.\n');
  });

  it('shows the fields an operator needs to recognise the right trial', () => {
    const out = renderPreview(trial, 'production');
    // Creation and expiry are how you tell your own test trial from a
    // stranger's — the whole failure mode the wrapper exists to prevent.
    expect(out).toContain('2026-09-09T01:21:00.000Z');
    expect(out).toContain('2026-09-12T01:21:00.000Z');
    expect(out).toContain('production');
    expect(out).toMatch(/--yes/);
  });

  it('renders a never-expiring record without printing undefined', () => {
    expect(renderPreview({ clientId: 'c-3', name: 'trial', tier: 'trial' }, 'staging')).toContain(
      'expires    never'
    );
  });
});
