/**
 * Generated-bundle freshness guard (origin: `d4ceada6`, 2026-08-28 — no BL id).
 *
 * `mcp-server/src/content/*.generated.ts` embed the website's library articles,
 * the IRL generator source, and all 123 regulation records. They are produced by
 * `mcp-server/scripts/generate-regulations-index.mjs` and committed.
 *
 * THE SILENT FAILURE MODE: a bundle can be committed stale. In `d4ceada6` a
 * rename shortened a name inside a markdown table in
 * `src/data/library/irl-tool-input-mapping/article.md`; the pre-commit prettier
 * hook then reflowed that table's column padding AFTER the codegen had already
 * run, so the commit shipped `library-data.generated.ts` whose embedded copy no
 * longer matched the article. The codegen skips on an input-hash match, so
 * nothing announced it, and nothing compared a committed bundle to its
 * committed source. Cosmetic that time; the mechanism is not.
 *
 * This spawns the codegen's `--check` mode, which renders all three outputs in
 * memory and diffs them against disk. Running the REAL emitter, rather than
 * re-comparing embedded content here, is deliberate: it reuses the transform
 * instead of re-implementing it, and it therefore also catches banner drift,
 * prettier-config drift, and hand-edits of a generated file — none of which a
 * content comparison can see. The spawn pattern follows
 * `mcp-root-program-boundary.test.ts`, which spawns `tsc` the same way.
 *
 * WHY THIS LIVES IN THE WEBSITE WORKSPACE — this is load-bearing, not taste.
 * `mcp-server`'s `pretest` runs this same codegen, so by the time that
 * workspace's suite executes the bundles have already been rewritten from
 * current sources: a copy of this guard under `mcp-server/tests/` could never
 * fail. Root `test:run` / `test:docs` have no such hook, so they observe the
 * bundles as committed. Moving this file "next to the code" would silently
 * neuter it.
 *
 * WHY IT IS IN `test:docs` AND NOT ONLY `test:run`: the sources it guards are
 * MARKDOWN (the library articles and the IRL generator source), and
 * `.github/workflows/test.yml`'s `changes` gate excludes every markdown path —
 * so the dangerous commit (edit an article, forget to regenerate) is a
 * docs-only diff that skips the entire Unit & Integration job.
 * `docs-integrity.yml` runs on every PR and its "Verify doc links" job is a
 * required check.
 *
 * NOTE THE THREE-WAY RELATIONSHIP on `irl-tool-input-mapping/article.md`:
 * `mcp-server/tests/integration/sop-dual-source-drift-guard.test.ts` binds it to
 * `mcp-server/src/docs/library/irl-tool-input-mapping.md`, and this guard binds
 * it to the generated bundle. One edit to that article can trip both guards;
 * update the mirror AND regenerate.
 *
 * There is no drift at HEAD, so this guard passes on arrival — a green first run
 * is not evidence it works. Its mutation proof is (recorded in the commit):
 * editing each of the three source kinds without regenerating, and hand-editing
 * a generated banner, each turn it red.
 *
 * To retire it, delete this test in the same commit that stops committing the
 * generated files, and say what replaced them.
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CODEGEN = resolve(REPO_ROOT, 'mcp-server/scripts/generate-regulations-index.mjs');

describe('mcp-server generated bundles', () => {
  it('match what their sources would produce right now', () => {
    const result = spawnSync(process.execPath, [CODEGEN, '--check'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });

    // stdout AND stderr. Drift is printed to stderr by --check, but the
    // script's hard failures are uncaught throws (the BL-073 alias-collision
    // `throw`, or a prettier parse error) which Node also writes to stderr —
    // and a stdout-only message would pair `expected 1 to be 0` with an empty
    // string, making the worst failure the least diagnosable.
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

    // Vacuity guard: a spawn that failed to start would report status null and
    // no output, and asserting only on `status === 0` would then... not pass,
    // but would report nothing useful. Assert we actually ran the script.
    expect(result.error, `failed to spawn the codegen: ${result.error?.message}`).toBeUndefined();
    expect(output.trim(), 'the codegen produced no output — did it run?').not.toBe('');

    expect(result.status, output).toBe(0);
  });
});
