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
export const EXPECTED_PROMPT_COUNT = 9;

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
