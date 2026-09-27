/**
 * BL-166 — helper unit tests for `scripts/migrate-radar-scope.mjs`.
 *
 * The migration's decisions all live in the pure `planMigration`, so this file
 * exercises it directly; nothing here touches the network or the admin API.
 * What matters is which records get patched (and with exactly what array, since
 * PATCH replaces rather than merges), which are only listed, and that a second
 * run finds nothing to do.
 */

import {
  parseArgs,
  planMigration,
  renderPlan,
  TOOL_ALL,
  TOOL_RADAR_ALL,
} from '../../../scripts/migrate-radar-scope.mjs';
import { BASE_URLS } from '../../../scripts/provision-client.mjs';
import { SCOPES, TRIAL_SCOPES } from '../../../src/auth/scopes';

const pilot = {
  clientId: 'm2m_pilot',
  name: 'Acme Capital',
  tier: 'free-pilot',
  allowedScopes: ['tool:*', 'resource:regulations:read'],
};
const converted = {
  clientId: 'm2m_conv',
  name: 'trial',
  tier: 'paid',
  allowedScopes: [...TRIAL_SCOPES],
};
const trial = {
  clientId: 'm2m_trial',
  name: 'trial',
  tier: 'trial',
  allowedScopes: [...TRIAL_SCOPES],
};
const narrow = {
  clientId: 'm2m_narrow',
  name: 'Narrow',
  tier: 'paid',
  allowedScopes: ['tool:search_portfolio'],
};
const offCatalog = {
  clientId: 'm2m_unsafe',
  name: 'Unsafe',
  tier: 'enterprise',
  allowedScopes: ['tool:*', 'tool:portfolio:*'],
};
const migrated = {
  clientId: 'm2m_done',
  name: 'Done',
  tier: 'paid',
  allowedScopes: ['tool:*', 'tool:radar:*'],
};

describe('migrate-radar-scope — parity with the server', () => {
  it('mirrors the scope strings from src/auth/scopes.ts', () => {
    expect(TOOL_ALL).toBe(SCOPES.TOOL_ALL);
    expect(TOOL_RADAR_ALL).toBe(SCOPES.TOOL_RADAR_ALL);
  });
});

describe('migrate-radar-scope — parseArgs', () => {
  it('is a production dry run by default', () => {
    expect(parseArgs([])).toEqual({ env: 'production', apply: false });
  });

  it('takes --apply and --env', () => {
    expect(parseArgs(['--env', 'staging', '--apply'])).toEqual({ env: 'staging', apply: true });
  });

  it('rejects unknown flags, an unknown env, and a swallowed flag', () => {
    expect(() => parseArgs(['--yes'])).toThrow(/Unknown argument/);
    expect(() => parseArgs(['--env', 'dev'])).toThrow(/--env must be one of/);
    expect(() => parseArgs(['--env', '--apply'])).toThrow(/requires a value/);
    expect(Object.keys(BASE_URLS)).toContain('staging');
  });

  it('has no flag for the admin key (Directive 15)', () => {
    expect(() => parseArgs(['--admin-key', 'x'])).toThrow(/Unknown argument/);
  });
});

describe('migrate-radar-scope — planMigration', () => {
  const plan = planMigration([pilot, converted, trial, narrow, offCatalog, migrated]);
  const ids = (rows: Array<{ clientId: string }>) => rows.map((r) => r.clientId);

  it('patches a non-trial tool:* record, appending tool:radar:* to the full array', () => {
    expect(ids(plan.patch)).toEqual(['m2m_pilot']);
    expect(plan.patch[0]!.newScopes).toEqual([
      'tool:*',
      'resource:regulations:read',
      'tool:radar:*',
    ]);
  });

  it('patches a converted trial in its own group', () => {
    expect(ids(plan.convertedTrialPatch)).toEqual(['m2m_conv']);
    expect(plan.convertedTrialPatch[0]!.newScopes).toEqual([...TRIAL_SCOPES, 'tool:radar:*']);
  });

  it('leaves trial-tier records alone', () => {
    expect(ids(plan.trialsSkipped)).toEqual(['m2m_trial']);
  });

  it('lists a record without tool:* for review, and does not patch it', () => {
    expect(ids(plan.review)).toEqual(['m2m_narrow']);
  });

  it('lists a record with off-catalog scopes as unpatchable, naming them', () => {
    expect(ids(plan.unpatchable)).toEqual(['m2m_unsafe']);
    expect(plan.unpatchable[0]!.offCatalog).toEqual(['tool:portfolio:*']);
  });

  it('counts a record that already holds tool:radar:* as done', () => {
    expect(ids(plan.alreadyMigrated)).toEqual(['m2m_done']);
  });

  it('treats a record with no tier as non-trial', () => {
    const { tier: _tier, ...untiered } = pilot;
    expect(ids(planMigration([untiered]).patch)).toEqual(['m2m_pilot']);
  });

  it('is idempotent: applying the plan and re-planning finds nothing to patch', () => {
    const after = [pilot, converted, trial, narrow, offCatalog, migrated].map((c) => {
      const hit = [...plan.patch, ...plan.convertedTrialPatch].find(
        (p) => p.clientId === c.clientId
      );
      return hit ? { ...c, allowedScopes: hit.newScopes } : c;
    });
    const second = planMigration(after);
    expect(second.patch).toEqual([]);
    expect(second.convertedTrialPatch).toEqual([]);
    expect(ids(second.alreadyMigrated)).toEqual(['m2m_pilot', 'm2m_conv', 'm2m_done']);
  });

  it('does not mutate the input records', () => {
    const input = [{ ...pilot, allowedScopes: [...pilot.allowedScopes] }];
    planMigration(input);
    expect(input[0]!.allowedScopes).toEqual(['tool:*', 'resource:regulations:read']);
  });
});

describe('migrate-radar-scope — renderPlan', () => {
  it('names every group and the environment', () => {
    const out = renderPlan(planMigration([pilot, converted, narrow, offCatalog]), 'staging');
    expect(out).toContain('staging');
    expect(out).toContain('m2m_pilot');
    expect(out).toContain('converted trial');
    expect(out).toContain('m2m_narrow');
    expect(out).toContain('off-catalog=tool:portfolio:*');
    expect(out).toContain('--allow-radar');
  });

  it('says none for an empty group', () => {
    expect(renderPlan(planMigration([]), 'production')).toContain('Patch (add tool:radar:*): none');
  });
});
