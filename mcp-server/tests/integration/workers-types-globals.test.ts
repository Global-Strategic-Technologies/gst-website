/**
 * The mechanical check that replaces the `@cloudflare/workers-types` version pin
 * (BL-137, ADR-0020).
 *
 * ─── What this guards ───────────────────────────────────────────────────────
 *
 * `mcp-server/src/worker.ts:1` carries
 * `/// <reference types="@cloudflare/workers-types" />`, which loads the
 * package's `index.d.ts`. That file is a global SCRIPT: every top-level
 * `declare` in it lands in the global scope of the whole TypeScript program,
 * and wins over `@types/node`. In 5.20260807.2 Cloudflare added
 * `declare const Buffer: any` and `declare const process: any`, which silently
 * retyped every `Buffer.byteLength(...)` and `process.env` in this workspace as
 * `any`. Nothing failed. `any` never fails.
 *
 * That was worked around with exact version pins. BL-137 removed the
 * dependence instead — no bare `Buffer`/`process`/`global` anywhere in
 * `mcp-server` (enforced by eslint), so the declarations are now inert. This
 * test is what makes the pins removable: it is the thing that notices when a
 * FUTURE version adds a global we DO depend on.
 *
 * ─── Why the key is the whole name set, not the `any`-typed subset ──────────
 *
 * The harm is SHADOWING A `@types/node` GLOBAL, not the `any`. The pinned
 * 5.20260804.1 already ships `declare const console: Console`,
 * `declare var Response`, `declare var Request` — all typed, all shadowing —
 * and contains zero `declare const X: any` lines. A future
 * `declare const process: { env: Record<string, string> }` would re-break
 * `process.exit()` while never matching an `any`-keyed regex. So the snapshot
 * below records every top-level `declare` statement's name.
 *
 * **Scope limit, deliberate.** The snapshot covers `declare …` statements only.
 * The file also holds ~800 top-level `interface` / `type` declarations written
 * WITHOUT the keyword, which are equally global. They are excluded from the
 * snapshot because an 800-name baseline gets regenerated rather than read — but
 * they ARE scanned for the collision check below, which is the assertion that
 * matters. Type-space declarations mostly MERGE with `@types/node` rather than
 * shadow it, and a conflicting `type` alias is a loud TS2300, so the snapshot's
 * narrower scope costs little.
 *
 * ─── Two assertions, doing different jobs ───────────────────────────────────
 *
 *   1. COLLISION (sharp, no churn): a hard-coded list of `@types/node` globals
 *      that must not be shadowed. Anything on it appearing in `index.d.ts` is a
 *      finding unless it is in `ACCEPTED_SHADOWS` with a written reason. This
 *      is the assertion with teeth; read it first.
 *   2. SNAPSHOT (broad, churns on every bump): every `declare`d name. It catches
 *      a collision our hard-coded list never anticipated. It WILL fail on
 *      routine version bumps, mostly on `Base_Ai_Cf_*` model types.
 *
 * ─── If assertion 2 fails on a version bump ─────────────────────────────────
 *
 * Do not regenerate it mechanically — that defeats it. For each ADDED name ask:
 * does `@types/node` also declare this at global scope? If no, add it to the
 * snapshot. If yes, it belongs in assertion 1's `ACCEPTED_SHADOWS` with a
 * reason, or the bump gets held. Removals can be deleted freely; a name
 * disappearing cannot shadow anything.
 *
 * ─── Reading the right copy ─────────────────────────────────────────────────
 *
 * Two copies of this package exist in the tree: `mcp-server/node_modules/…` at
 * 5.x (the direct devDependency) and a root-hoisted `node_modules/…` at 4.x
 * (pulled transitively via `agents → partyserver`). The package ships NO
 * `main`, `types`, or `exports` field, so `require.resolve` cannot pick for us.
 * The subpath is resolved explicitly and the version asserted, otherwise a
 * hoist change would let this validate the v4 tree and pass vacuously.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_ROOT = resolve(__dirname, '..', '..');
const REPO_ROOT = resolve(MCP_ROOT, '..');
const PKG = '@cloudflare/workers-types';

/**
 * `@types/node` names that must never be shadowed by a workers-types global.
 *
 * Not every Node global — the ones whose loss would be silent and damaging
 * here. `Buffer` and `process` are on it because they are exactly what BL-137
 * was about; the rest are the same failure mode waiting to happen.
 */
const NODE_GLOBALS_AT_RISK = [
  'Buffer',
  'process',
  'global',
  'require',
  'module',
  'exports',
  '__dirname',
  '__filename',
  'NodeJS',
  'setImmediate',
  'clearImmediate',
] as const;

/**
 * Shadowed names we have inspected and accepted, each with the reason it is
 * harmless HERE. An entry is a claim that nothing in `mcp-server` depends on
 * the `@types/node` meaning of that name — kept true by the
 * `no-restricted-globals` / `no-restricted-syntax` pair in `eslint.config.mjs`.
 *
 * These five arrived with 5.20260807.2 / 5.20260822.1 and are the whole reason
 * BL-137 existed. They are tolerable now, and ONLY now, because nothing reaches
 * for them as bare globals any more. Deleting the eslint rules re-arms every
 * one of them.
 */
const ACCEPTED_SHADOWS: Readonly<Record<string, string>> = {
  Buffer:
    'declare const Buffer: any — the original BL-137 break. No bare use remains: the six ' +
    'Buffer.byteLength call sites moved to utf8ByteLength() (src/lib/utf8-bytes.ts), and the ' +
    'tests that still need it import from node:buffer. Banned in value AND type position.',
  process:
    'declare const process: any — cost src/index.ts its `never` narrowing on process.exit(1). ' +
    'The three call sites now `import process from "node:process"`. Banned as a bare global.',
  global:
    'declare const global: ServiceWorkerGlobalScope — not what @types/node means by `global`. ' +
    'Never used bare in this workspace (verified at BL-137 time); `globalThis` is the idiom ' +
    'here. Banned as a bare global.',
  setImmediate:
    'Typed, not `any`, and the Workers signature is the one that would actually apply under ' +
    'nodejs_compat. Unused in this workspace, so the shadow is inert either way.',
  clearImmediate: 'Same as setImmediate — typed, unused here.',
};

/**
 * Every top-level `declare` name in the pinned `index.d.ts`, sorted. Generated
 * once against 5.20260804.1 and curated by hand since — see the header before
 * editing, including its note on why bare `interface`/`type` are out of scope
 * here but in scope for the collision check.
 */
const DECLARED_GLOBALS: ReadonlySet<string> = new Set([
  'AbortController',
  'AbortSignal',
  'AgentMemoryNamespace',
  'AgentMemoryProfile',
  'Ai',
  'AiGateway',
  'AiSearchInstance',
  'AiSearchItem',
  'AiSearchItems',
  'AiSearchJob',
  'AiSearchJobs',
  'AiSearchNamespace',
  'AutoRAG',
  'BaseAiAutomaticSpeechRecognition',
  'BaseAiImageClassification',
  'BaseAiImageTextToText',
  'BaseAiImageToText',
  'BaseAiMultimodalEmbeddings',
  'BaseAiObjectDetection',
  'BaseAiSentenceSimilarity',
  'BaseAiSummarization',
  'BaseAiTextClassification',
  'BaseAiTextEmbeddings',
  'BaseAiTextGeneration',
  'BaseAiTextToImage',
  'BaseAiTextToSpeech',
  'BaseAiTranslation',
  'Base_Ai_Cf_Ai4Bharat_Indictrans2_En_Indic_1B',
  'Base_Ai_Cf_Aisingapore_Gemma_Sea_Lion_V4_27B_It',
  'Base_Ai_Cf_Baai_Bge_Base_En_V1_5',
  'Base_Ai_Cf_Baai_Bge_Large_En_V1_5',
  'Base_Ai_Cf_Baai_Bge_M3',
  'Base_Ai_Cf_Baai_Bge_Reranker_Base',
  'Base_Ai_Cf_Baai_Bge_Small_En_V1_5',
  'Base_Ai_Cf_Black_Forest_Labs_Flux_1_Schnell',
  'Base_Ai_Cf_Black_Forest_Labs_Flux_2_Dev',
  'Base_Ai_Cf_Black_Forest_Labs_Flux_2_Klein_4B',
  'Base_Ai_Cf_Black_Forest_Labs_Flux_2_Klein_9B',
  'Base_Ai_Cf_Deepgram_Aura_1',
  'Base_Ai_Cf_Deepgram_Aura_2_En',
  'Base_Ai_Cf_Deepgram_Aura_2_Es',
  'Base_Ai_Cf_Deepgram_Flux',
  'Base_Ai_Cf_Deepgram_Nova_3',
  'Base_Ai_Cf_Google_Gemma_3_12B_It',
  'Base_Ai_Cf_Google_Gemma_4_26B_A4B_IT',
  'Base_Ai_Cf_Leonardo_Lucid_Origin',
  'Base_Ai_Cf_Leonardo_Phoenix_1_0',
  'Base_Ai_Cf_Meta_Llama_3_2_11B_Vision_Instruct',
  'Base_Ai_Cf_Meta_Llama_3_3_70B_Instruct_Fp8_Fast',
  'Base_Ai_Cf_Meta_Llama_4_Scout_17B_16E_Instruct',
  'Base_Ai_Cf_Meta_Llama_Guard_3_8B',
  'Base_Ai_Cf_Meta_M2M100_1_2B',
  'Base_Ai_Cf_Mistralai_Mistral_Small_3_1_24B_Instruct',
  'Base_Ai_Cf_Moonshotai_Kimi_K2_5',
  'Base_Ai_Cf_Moonshotai_Kimi_K2_6',
  'Base_Ai_Cf_Nvidia_Nemotron_3_120B_A12B',
  'Base_Ai_Cf_Openai_Gpt_Oss_120B',
  'Base_Ai_Cf_Openai_Gpt_Oss_20B',
  'Base_Ai_Cf_Openai_Whisper',
  'Base_Ai_Cf_Openai_Whisper_Large_V3_Turbo',
  'Base_Ai_Cf_Openai_Whisper_Tiny_En',
  'Base_Ai_Cf_Pfnet_Plamo_Embedding_1B',
  'Base_Ai_Cf_Pipecat_Ai_Smart_Turn_V2',
  'Base_Ai_Cf_Qwen_Qwen2_5_Coder_32B_Instruct',
  'Base_Ai_Cf_Qwen_Qwen3_30B_A3B_Fp8',
  'Base_Ai_Cf_Qwen_Qwen3_Embedding_0_6B',
  'Base_Ai_Cf_Qwen_Qwq_32B',
  'Base_Ai_Cf_Unum_Uform_Gen2_Qwen_500M',
  'Base_Ai_Cf_Zai_Org_Glm_4_7_Flash',
  'Blob',
  'Body',
  'BrowserRun',
  // +5.20260807.2 — `declare const Buffer: any`. Shadows @types/node; see
  // ACCEPTED_SHADOWS.
  'Buffer',
  'ByteLengthQueuingStrategy',
  'Cache',
  'CacheStorage',
  'CertVerificationStatus',
  'CloseEvent',
  'Cloudflare',
  'CloudflareWorkersModule',
  'ColoLocalActorNamespace',
  'CompressionStream',
  'ContinentCode',
  'CountQueuingStrategy',
  'Crypto',
  'CryptoKey',
  'CustomEvent',
  'D1Database',
  'D1DatabaseSession',
  'D1PreparedStatement',
  'DOMException',
  'DecompressionStream',
  'DigestStream',
  'DurableObjectNamespace',
  'EmailEvent',
  'EmailExportedHandler',
  'ErrorEvent',
  'Event',
  'EventSource',
  'EventTarget',
  'ExtendableEvent',
  'FetchEvent',
  'File',
  'FixedLengthStream',
  'Flagship',
  'FormData',
  'HTMLRewriter',
  'Headers',
  'IdentityTransformStream',
  'IncomingRequestCfPropertiesEdgeRequestKeepAliveStatus',
  'Iso3166Alpha2Code',
  'MessageChannel',
  'MessageEvent',
  'MessagePort',
  'Navigator',
  'Performance',
  // +5.20260822.1 — the Performance Observer surface. @types/node declares
  // these too (node:perf_hooks lifts them to globals), so they ARE shadows.
  // Kept out of NODE_GLOBALS_AT_RISK rather than added to ACCEPTED_SHADOWS:
  // nothing in mcp-server references any of them, in value or type position,
  // and the Workers definitions are the ones that would apply at runtime
  // anyway. Revisit if this workspace ever measures with perf_hooks.
  'PerformanceEntry',
  'PerformanceMark',
  'PerformanceMeasure',
  'PerformanceObserver',
  'PerformanceObserverEntryList',
  'PerformanceResourceTiming',
  'PromiseRejectionEvent',
  'R2Object',
  'ReadableByteStreamController',
  'ReadableStream',
  'ReadableStreamBYOBReader',
  'ReadableStreamBYOBRequest',
  'ReadableStreamDefaultController',
  'ReadableStreamDefaultReader',
  'Request',
  'Response',
  'Rpc',
  'ScheduledEvent',
  'Span',
  'SqlStorageCursor',
  'SqlStorageStatement',
  'SubtleCrypto',
  'TailEvent',
  'TailStream',
  'TextDecoder',
  'TextDecoderStream',
  'TextEncoder',
  'TextEncoderStream',
  'ToMarkdownService',
  'TransformStream',
  'TransformStreamDefaultController',
  'URL',
  'URLPattern',
  'URLSearchParams',
  'Vectorize',
  'VectorizeIndex',
  'WebAssembly',
  'WebSearch',
  'WebSocket',
  'WebSocketPair',
  'WebSocketRequestResponsePair',
  'WorkerGlobalScope',
  'Workflow',
  'WorkflowInstance',
  'WritableStream',
  'WritableStreamDefaultController',
  'WritableStreamDefaultWriter',
  'addEventListener',
  'atob',
  'btoa',
  'caches',
  // +5.20260822.1 — see ACCEPTED_SHADOWS (typed, unused here).
  'clearImmediate',
  'clearInterval',
  'clearTimeout',
  'console',
  'crypto',
  'dispatchEvent',
  'fetch',
  // +5.20260822.1 — `ServiceWorkerGlobalScope`, not @types/node's `global`.
  // See ACCEPTED_SHADOWS.
  'global',
  'navigator',
  'onmessage',
  'origin',
  'performance',
  // +5.20260807.2 — `declare const process: any`. See ACCEPTED_SHADOWS.
  'process',
  'queueMicrotask',
  'removeEventListener',
  'reportError',
  'scheduler',
  'self',
  // +5.20260822.1 — see ACCEPTED_SHADOWS (typed, unused here).
  'setImmediate',
  'setInterval',
  'setTimeout',
  'structuredClone',
]);

/**
 * Ambient module declarations (`declare module "cloudflare:workers"`, …).
 * Tracked separately: these are the ONLY place the `cloudflare:*` specifiers
 * are declared, which is half the reason the reference directive in `worker.ts`
 * cannot simply be deleted. They are scoped, so they shadow nothing.
 */
const DECLARED_MODULES: ReadonlySet<string> = new Set([
  'assets:*',
  'cloudflare:email',
  'cloudflare:node',
  'cloudflare:pipelines',
  'cloudflare:sockets',
  'cloudflare:workers',
  'cloudflare:workflows',
]);

// --- Locating and parsing the installed copy ---------------------------------

/** Numeric-tuple compare, so `5.20260822.1` > `5.20260804.1` and 5 > 4. */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Resolve the copy that `mcp-server` actually compiles against.
 *
 * Preference order matches Node resolution from `mcp-server/src`: the nested
 * copy first, the hoisted root copy second. Whichever is found must satisfy the
 * declared devDependency range — that is the check that makes a hoist change
 * fail loudly instead of silently validating the wrong tree.
 */
function locateInstalledTypes(): { dir: string; version: string; spec: string } {
  const mcpPkg = JSON.parse(readFileSync(resolve(MCP_ROOT, 'package.json'), 'utf-8'));
  const spec: string | undefined = mcpPkg.devDependencies?.[PKG];
  expect(spec, `${PKG} is not a devDependency of @gst/mcp-server`).toBeTruthy();

  const candidates = [
    resolve(MCP_ROOT, 'node_modules', PKG),
    resolve(REPO_ROOT, 'node_modules', PKG),
  ];
  const found = candidates.filter((d) => existsSync(resolve(d, 'package.json')));
  expect(found, `${PKG} is not installed under ${candidates.join(' or ')}`).not.toEqual([]);

  const min = (spec as string).replace(/^[\^~>=\s]+/, '');
  for (const dir of found) {
    const version: string = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf-8')).version;
    // Same major AND at least the declared floor. The 4.x hoisted copy fails
    // the major test; a stale nested copy fails the floor test.
    if (version.split('.')[0] === min.split('.')[0] && compareVersions(version, min) >= 0) {
      return { dir, version, spec: spec as string };
    }
  }

  const seen = found
    .map((d) => `${d} @ ${JSON.parse(readFileSync(resolve(d, 'package.json'), 'utf-8')).version}`)
    .join('\n  ');
  throw new Error(
    `No installed ${PKG} satisfies the declared spec "${spec}".\n` +
      `Found:\n  ${seen}\n` +
      `Run npm install. This check exists so a hoist change cannot make the ` +
      `assertions below validate the wrong copy and pass vacuously.`
  );
}

const GLOBAL_RE =
  /^declare\s+(?:abstract\s+)?(?:var|const|let|function|class|namespace|type|interface|enum)\s+([A-Za-z_$][\w$]*)/;
const MODULE_RE = /^declare\s+module\s+"([^"]+)"/;

/**
 * Top-level declarations written WITHOUT the `declare` keyword.
 *
 * In a `.d.ts` global script, `interface Console { … }` at column 0 is just as
 * global as `declare var console` — the keyword is optional for type-space
 * declarations. The installed file has ~800 of them.
 *
 * They are deliberately kept OUT of the churny name snapshot (an 800-name
 * baseline would be re-generated rather than read, which defeats it) but they
 * ARE fed to the sharp `NODE_GLOBALS_AT_RISK` collision check, because type
 * space is not harmless here: the three `NodeJS.Process` annotations that keep
 * `process` typed depend on the `NodeJS` namespace, and a future top-level
 * `namespace NodeJS { … }` without the keyword would otherwise slip both
 * assertions — the exact failure this file exists to catch.
 */
const BARE_TYPE_RE =
  /^(?:abstract\s+)?(?:class|namespace|type|interface|enum)\s+([A-Za-z_$][\w$]*)/;

interface Parsed {
  /** Names from `declare …` statements — the snapshot key. */
  globals: Set<string>;
  /** `globals` PLUS bare top-level type-space declarations — the collision key. */
  allNames: Set<string>;
  modules: Set<string>;
  unparsed: string[];
}

/**
 * Collect every TOP-LEVEL `declare` in the global script.
 *
 * Column-0 anchoring is the whole trick: declarations nested inside a
 * `declare module { … }` block are indented, so they never match, which is
 * correct — they are scoped and shadow nothing.
 */
function parseGlobalScript(source: string): Parsed {
  const out: Parsed = { globals: new Set(), allNames: new Set(), modules: new Set(), unparsed: [] };
  for (const line of source.split(/\r?\n/)) {
    if (!line.startsWith('declare ')) {
      // Column-0 anchoring again: a bare `interface Foo` nested inside a
      // `declare module { … }` block is indented, so it never matches here.
      const bare = BARE_TYPE_RE.exec(line);
      if (bare) out.allNames.add(bare[1]);
      continue;
    }
    const m = MODULE_RE.exec(line);
    if (m) {
      out.modules.add(m[1]);
      continue;
    }
    const g = GLOBAL_RE.exec(line);
    if (g) {
      out.globals.add(g[1]);
      out.allNames.add(g[1]);
      continue;
    }
    out.unparsed.push(line.slice(0, 120));
  }
  return out;
}

// --- The assertions -----------------------------------------------------------

describe('@cloudflare/workers-types global script', () => {
  const { dir, version, spec } = locateInstalledTypes();
  const indexDts = resolve(dir, 'index.d.ts');
  const parsed = parseGlobalScript(readFileSync(indexDts, 'utf-8'));

  it(`parses the installed index.d.ts (package.json declares "${spec}")`, () => {
    // Non-vacuity. A parser that silently matched nothing would make every
    // assertion below pass. BL-124 and BL-125 both shipped guards that
    // asserted over an empty set; this file does not get to be the third.
    expect(
      parsed.globals.size,
      `no top-level declarations parsed from ${indexDts}`
    ).toBeGreaterThan(100);
    expect(parsed.modules.size, 'no ambient cloudflare:* modules parsed').toBeGreaterThan(0);
    // The bare type-space scan feeds the collision check; if BARE_TYPE_RE ever
    // stops matching, that check silently narrows back to `declare`-only.
    expect(
      parsed.allNames.size - parsed.globals.size,
      'BARE_TYPE_RE matched no top-level interface/type declarations, so the ' +
        'collision assertion below has quietly narrowed to `declare`-only'
    ).toBeGreaterThan(100);
    expect(
      parsed.unparsed,
      `lines beginning "declare " that the parser did not understand. The name ` +
        `set is therefore incomplete and a new global could hide in here — ` +
        `extend GLOBAL_RE rather than ignoring them.`
    ).toEqual([]);
    // Pins WHICH copy was read, so the report is unambiguous when this fails.
    expect(version, `read ${indexDts} (spec ${spec})`).toBeTruthy();
  });

  it('does not shadow a @types/node global we depend on', () => {
    // `allNames`, not `globals`: this check must also see top-level type-space
    // declarations written without the `declare` keyword. See BARE_TYPE_RE.
    const shadowed = NODE_GLOBALS_AT_RISK.filter((n) => parsed.allNames.has(n));
    const unaccepted = shadowed.filter((n) => !(n in ACCEPTED_SHADOWS));

    expect(
      unaccepted,
      `${PKG}@${version} declares these at global scope, shadowing @types/node:\n` +
        `  ${unaccepted.join(', ')}\n\n` +
        `Because worker.ts's reference directive loads this file program-wide, ` +
        `every bare use of those names in mcp-server loses its @types/node type ` +
        `— silently if the declaration is 'any'.\n\n` +
        `To accept a bump: confirm nothing in mcp-server uses the name as a bare ` +
        `global (eslint.config.mjs's no-restricted-globals + no-restricted-syntax ` +
        `pair enforces this), then add it to ACCEPTED_SHADOWS with that reason. ` +
        `Do NOT delete it from NODE_GLOBALS_AT_RISK.`
    ).toEqual([]);
  });

  it('declares exactly the recorded set of globals and ambient modules', () => {
    const added = [...parsed.globals].filter((n) => !DECLARED_GLOBALS.has(n)).sort();
    const removed = [...DECLARED_GLOBALS].filter((n) => !parsed.globals.has(n)).sort();

    expect(
      added,
      `${PKG}@${version} declares globals this snapshot has not seen:\n` +
        `  ${added.join(', ')}\n\n` +
        `For EACH one, check whether @types/node also declares it globally. If ` +
        `it does, it belongs in ACCEPTED_SHADOWS (with a reason) or the bump is ` +
        `held. If it does not, add it to DECLARED_GLOBALS. Regenerating this ` +
        `list mechanically defeats the test — see the file header.`
    ).toEqual([]);
    expect(
      removed,
      `these names are in the snapshot but no longer declared by ${PKG}@${version}. ` +
        `Safe to delete from DECLARED_GLOBALS — a name that is gone cannot shadow ` +
        `anything.`
    ).toEqual([]);

    expect(
      [...parsed.modules].sort(),
      `the ambient cloudflare:* module set changed. These specifiers exist ONLY ` +
        `in this global script, which is half the reason worker.ts's reference ` +
        `directive cannot be removed (see mcp-server/src/env.ts).`
    ).toEqual([...DECLARED_MODULES].sort());
  });
});
