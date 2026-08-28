/**
 * Shared readers for the `mcp-server` tool / prompt registry.
 *
 * Several guards in this directory need to know what the server actually
 * registers — the UAT coverage guard here, and the `/hub/mcp/` marketing-page
 * guard on the BL-093 branch. Extracting them keeps one definition of "what is
 * registered", so a tool rename cannot be half-caught.
 *
 * These are deliberately SOURCE READERS, not imports. `mcp-server/src/server.ts`
 * pulls in the Worker runtime, Upstash bindings and the whole tool graph; a
 * website-side test importing it would drag that in to answer a question that
 * regex over the registration call sites answers exactly as well.
 *
 * `resolve()` is cwd-based and `vitest.config.ts` sets no custom `root`, so the
 * repo-root-relative constants below behave the same from any test file.
 * `vitest.config.ts` includes only `tests/**\/*.test.ts`, so this file is a
 * module, not a suite.
 */
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

export const SERVER_PATH = 'mcp-server/src/server.ts';
export const LOCAL_ONLY_PATH = 'mcp-server/src/tools/_local-only.ts';
export const TOOLS_DIR = 'mcp-server/src/tools';
export const PROMPTS_DIR = 'mcp-server/src/prompts';

/**
 * Vacuity guards. An extraction that silently found nothing would make every
 * downstream assertion pass, so both consumers assert these counts first.
 */
export const EXPECTED_REMOTE_TOOL_COUNT = 16; // BL-140 added fill_information_request_list_xlsx
export const EXPECTED_PROMPT_COUNT = 12; // gst_irl_sweep + gst_irl_extract added (coexistence window with gst_irl_ingestion)

export function read(path: string): string {
  return readFileSync(resolve(path), 'utf-8');
}

/**
 * Tool names registered by a module, anchored on `server.registerTool(`'s first
 * argument. Anchoring matters: four modules repeat their own name inside a
 * `withToolMetrics(...)` call, so a loose snake_case scan overshoots.
 */
export function toolNamesIn(modulePath: string): string[] {
  const src = read(modulePath);
  const re = /\bserver\.registerTool\(\s*'([a-z0-9_]+)'/g;
  const names = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) names.add(m[1]);
  return [...names];
}

/**
 * Resolve `register*` imports in an entrypoint to their modules under
 * `mcp-server/src/tools/`, then collect the names those modules register.
 *
 * The path filter is the discriminator: `server.ts` also imports
 * `registerLibraryResources` / `registerRegulationResources` /
 * `registerRadarResources` from `./resources/*` and `registerPrompts` from
 * `./prompts/_registry`, none of which register tools.
 */
export function registeredToolNames(entrypoint: string): string[] {
  const src = read(entrypoint);
  const available = new Set(
    readdirSync(resolve(TOOLS_DIR))
      .filter((f) => f.endsWith('.ts'))
      .map((f) => f.replace(/\.ts$/, ''))
  );

  const names = new Set<string>();
  const importRe = /import\s*\{[^}]*\}\s*from\s*'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(src)) !== null) {
    const spec = m[1];
    const moduleName = spec.replace(/^\.\.?\//, '').replace(/^tools\//, '');
    // Only specifiers that resolve into the tools directory.
    const isToolsImport =
      spec.startsWith('./tools/') || (spec.startsWith('./') && entrypoint === LOCAL_ONLY_PATH);
    if (!isToolsImport || !available.has(moduleName)) continue;
    for (const name of toolNamesIn(`${TOOLS_DIR}/${moduleName}.ts`)) names.add(name);
  }
  return [...names];
}

/**
 * The tool names `gst_irl_sweep` orchestrates, read from its
 * `SWEEP_ORCHESTRATED_TOOLS` const. The onboarding guide publishes this count
 * ("drives up to nine GST engines"), so the guard needs the source list.
 */
export function sweepOrchestratedToolNames(): string[] {
  const src = read(`${PROMPTS_DIR}/irl-sweep.ts`);
  const block = src.match(/SWEEP_ORCHESTRATED_TOOLS = \[([\s\S]*?)\]/)?.[1] ?? '';
  return [...block.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
}

/**
 * The tool names `gst_target_quick_look` orchestrates, read from its prompt
 * module's `orchestrates` literal. `/hub/mcp/docs/` publishes that list on the
 * prompt's contract, so the guard needs the source of it.
 *
 * Anchored on `orchestrates: [` rather than on a named const: unlike the sweep,
 * this prompt declares the array inline in its definition.
 */
export function targetQuickLookOrchestratedToolNames(): string[] {
  const src = read(`${PROMPTS_DIR}/target-quick-look.ts`);
  const block = src.match(/orchestrates: \[([\s\S]*?)\]/)?.[1] ?? '';
  return [...block.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
}

/**
 * The published resource inventory: 4 library + 123 regulations + 6 radar.
 *
 * Derived rather than asserted, and derived HERE rather than in a suite, because
 * both `/hub/mcp/` and `/hub/mcp/docs/` publish these numbers and two private
 * derivations could disagree while both passing. Same single-definition policy
 * the tool and prompt readers above follow.
 *
 * Radar is `fyi/latest` + `wire/latest` + one wire feed per category.
 */
export function resourceInventory(): {
  library: number;
  regulations: number;
  radar: number;
  total: number;
} {
  const library = (
    read('mcp-server/src/content/library-loader.ts').match(/uri: 'gst:\/\/library\//g) ?? []
  ).length;
  const regulations = readdirSync(resolve('src/data/regulatory-map')).filter((f) =>
    f.endsWith('.json')
  ).length;
  const radarCategories = (
    read('mcp-server/src/content/radar-transform.ts')
      .match(/export const RADAR_CATEGORIES[\s\S]*?\]/)?.[0]
      .match(/'[a-z-]+'/g) ?? []
  ).length;
  const radar = 2 + radarCategories;
  return { library, regulations, radar, total: library + regulations + radar };
}

/**
 * The sweep's completeness-check rule text (`IRL_COMPLETENESS_CHECK`), whose
 * halt predicate — zero substantive cells OR ratio below 5% — the onboarding
 * guide restates. Returned raw so a guard can pin both arms.
 */
export function irlCompletenessCheckText(): string {
  return read(`${PROMPTS_DIR}/extraction-rules.ts`).match(
    /IRL_COMPLETENESS_CHECK = \[([\s\S]*?)\]\.join/
  )![1];
}

/**
 * Prompt names, read from the `PROMPT_NAME` literal each prompt module declares.
 * Scoped to the modules the registry actually imports, so an orphaned file in
 * the directory cannot inflate the set.
 */
export function registeredPromptNames(): string[] {
  const registry = read(`${PROMPTS_DIR}/_registry.ts`);
  const names = new Set<string>();
  const importRe = /from\s*'\.\/([a-z0-9-]+)'/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(registry)) !== null) {
    let src: string;
    try {
      src = read(`${PROMPTS_DIR}/${m[1]}.ts`);
    } catch {
      continue;
    }
    const nameMatch = src.match(/const PROMPT_NAME = '(gst_[a-z_]+)'/);
    if (nameMatch) names.add(nameMatch[1]);
  }
  return [...names];
}
