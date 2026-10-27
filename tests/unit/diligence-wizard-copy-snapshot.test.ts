/**
 * Temporary (BL-153 Tier B): the wizard's English prose, pinned to a file
 * (`fixtures/diligence-wizard-en.json`) while it still lived in
 * `wizard-config.ts`. It now lives in the `diligence-machine` catalog; this
 * proves the move left every English string byte-identical. It is deleted
 * once that is on record.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import EN from '../../src/i18n/en/diligence-machine.json';

const pinned = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/diligence-wizard-en.json'), 'utf-8')
) as Record<string, string>;

describe('Diligence Machine wizard English (moved to the catalog)', () => {
  it('the catalog carries every pinned key with the pinned English', () => {
    const catalog = EN as Record<string, string>;
    const moved = Object.fromEntries(Object.keys(pinned).map((k) => [k, catalog[k]]));
    expect(moved).toEqual(pinned);
  });
});
