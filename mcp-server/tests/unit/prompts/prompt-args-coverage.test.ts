/**
 * Keeps `tests/helpers/prompt-args.ts` in step with the prompt registry.
 *
 * Both `prompts/get` rendering suites iterate the LIVE registry and look up
 * minimal args per prompt, so a newly registered prompt with no entry fails
 * inside whichever lane happens to run first — a Worker-lane failure pointing
 * at a missing test fixture reads like a rendering bug. This test fails first
 * and names the file to edit.
 *
 * It also catches the reverse: an entry left behind after a prompt is renamed
 * or retired, which would otherwise sit unused and misleading indefinitely.
 */

import { describe, it, expect } from 'vitest';
import { ALL_PROMPTS } from '../../../src/prompts/_registry';
import { MINIMAL_PROMPT_ARGS } from '../../helpers/prompt-args';

describe('minimal prompt-args coverage', () => {
  it('has an entry for every registered prompt, and no entries for prompts that no longer exist', () => {
    const registered = ALL_PROMPTS.map((p) => p.name).sort();
    const covered = Object.keys(MINIMAL_PROMPT_ARGS).sort();

    const missing = registered.filter((n) => !covered.includes(n));
    const orphaned = covered.filter((n) => !registered.includes(n));

    expect(
      missing,
      `Prompts with no entry in tests/helpers/prompt-args.ts — add minimal VALID args (not {}, several prompts have required fields): ${missing.join(', ')}`
    ).toEqual([]);
    expect(
      orphaned,
      `Entries in tests/helpers/prompt-args.ts for prompts that are no longer registered — remove them: ${orphaned.join(', ')}`
    ).toEqual([]);
  });
});
