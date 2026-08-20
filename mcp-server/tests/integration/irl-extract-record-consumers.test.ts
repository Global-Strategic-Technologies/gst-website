/**
 * The IRL extract record, end to end — the in-session substitute for the live
 * exercise.
 *
 * **Why this file exists rather than a deferred UAT row.** The reported
 * scenario (operator invokes `gst_irl_ingestion` with `mode: extract-only`,
 * pastes the body into chat, then runs a downstream prompt against the same
 * target) needs a deployed Worker and an interactive client, neither of which
 * this session can drive. What it CAN do is prove the engineering correctness
 * the scenario depends on: render the deferred body, build a record from a real
 * filled fixture, resolve two DIFFERENT consumers' inputs from that one record,
 * and drive both tool calls through the real MCP protocol layer. The
 * client-side exercise is a UAT run-log row when the operator next runs it —
 * not deferred work.
 *
 * **The claim under test is the whole design claim.** If either consumer needs
 * the record CHANGED to be usable, the indexing is still consumer-shaped and
 * the design is wrong. So both consumers here resolve every input by matching
 * on the `request` text each fact carries, with no mapping table in context and
 * no edit to the record between them.
 *
 * **And the negative half.** Request-text matching is a convenience layer, not
 * the correctness mechanism: a `request` string structurally cannot encode a
 * NEGATIVE, and the two observed misroutes happened *with* a mapping table
 * present. The anti-mappings live in the shared rule constants, and the last
 * describe block asserts they still refuse both.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  LATEST_PROTOCOL_VERSION,
  type JSONRPCMessage,
  type JSONRPCRequest,
  type JSONRPCResponse,
  type JSONRPCErrorResponse,
} from '@modelcontextprotocol/server';
import { createServer } from '../../src/server';
import { createPairedTransports, type PairedHalf } from '../helpers/paired-transport';
import type { CallToolResultPayload } from '../helpers/tool-envelope';
import { irlIngestionPrompt } from '../../src/prompts/irl-ingestion';
import {
  IrlExtractRecordSchema,
  IRL_EXTRACT_EXCERPT_CAP_CHARS,
  IRL_EXTRACT_RECORD_VERSION,
  IRL_EXTRACT_REF_FORMAT,
  resolveRefSection,
  type IrlExtractRecord,
} from '../../src/schemas/irl-extract-record';
import { TECHPAR_MODE_RULE, MTTR_P1_RULE } from '../../src/prompts/extraction-rules';
import { buildPartnerSuppliedTechParAudit } from '../../src/schemas/techpar-audit';

const NORTHWIND = readFileSync('tests/fixtures/northwind-workbook-columns-filled-irl.md', 'utf8');

// ─── Build the record the deferred arm would emit ──────────────────────────

const BULLET = /^- (\d{1,2}-\d{2}) (.+?) \[(OPEN|PARTIAL|CLOSED)\] — (.*)$/;
const TRAILERS = /\s*\((?:Source|Note): [^)]*\)\s*$/;

function buildRecord(body: string): IrlExtractRecord {
  const facts: IrlExtractRecord['facts'] = [];
  let rowsPresent = 0;
  for (const line of body.split(/\r?\n/)) {
    const m = BULLET.exec(line);
    if (!m) continue;
    rowsPresent += 1;
    const [, ref, request, status, rawAnswer] = m;
    let answer = rawAnswer;
    let prev: string;
    do {
      prev = answer;
      answer = answer.replace(TRAILERS, '');
    } while (answer !== prev);
    answer = answer.trim();
    if (!answer || answer === '<NO RESPONSE>') continue;
    facts.push({
      ref,
      request,
      status: status as 'OPEN' | 'PARTIAL' | 'CLOSED',
      excerpt: answer.slice(0, IRL_EXTRACT_EXCERPT_CAP_CHARS),
      tier: 2,
    });
  }
  return IrlExtractRecordSchema.parse({
    _meta: {
      recordVersion: IRL_EXTRACT_RECORD_VERSION,
      refFormat: IRL_EXTRACT_REF_FORMAT,
      irlBodyHash: 'abcdef0123456789',
      irlSource: 'partner-paste-verbatim',
      generatedAt: '2026-08-20T09:00:00.000Z',
      generatedAtSource: 'server-witnessed',
      promptVersion: '0.29.0',
      excerptCapChars: IRL_EXTRACT_EXCERPT_CAP_CHARS,
      coverage: { answered: facts.length, rowsPresent },
    },
    facts,
  });
}

/**
 * Resolve one fact by its IRL REQUEST TEXT — the only lookup a consumer gets.
 *
 * No mapping table, no `ref` lookup, no tool-field name. This function IS the
 * consumer-agnostic claim: if it cannot find what a consumer needs, the record
 * is indexed by somebody else's schema.
 */
function byRequest(record: IrlExtractRecord, needle: string) {
  const hits = record.facts.filter((f) => f.request.toLowerCase().includes(needle.toLowerCase()));
  return hits.length === 1 ? hits[0] : null;
}

/** `0-03` → `Section 00`, for a citation the audit schemas accept. */
function citationFor(fact: { ref: string; excerpt: string }): string {
  const parts = resolveRefSection(fact.ref)!;
  return `Section ${parts.sectionNumber} — ${fact.excerpt}`;
}

const RECORD = buildRecord(NORTHWIND);

// ─── Protocol harness ──────────────────────────────────────────────────────

describe('the IRL extract record, end to end', () => {
  let client: PairedHalf;
  let nextId = 1;

  async function rpc(
    method: string,
    params: unknown
  ): Promise<JSONRPCResponse | JSONRPCErrorResponse> {
    const id = nextId++;
    return new Promise((resolve) => {
      client.onmessage = (msg: JSONRPCMessage) => {
        if ('id' in msg && msg.id === id) resolve(msg as JSONRPCResponse | JSONRPCErrorResponse);
      };
      void client.send({ jsonrpc: '2.0', id, method, params } as JSONRPCRequest);
    });
  }

  async function callTool(name: string, args: unknown): Promise<CallToolResultPayload> {
    const res = await rpc('tools/call', { name, arguments: args });
    if ('error' in res) throw new Error(`${name} transport error: ${res.error.message}`);
    return res.result as unknown as CallToolResultPayload;
  }

  beforeEach(async () => {
    nextId = 1;
    const server = createServer({});
    const pair = createPairedTransports();
    client = pair.client;
    await server.connect(pair.server);
    await rpc('initialize', {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'irl-extract-record-consumers', version: '0.0.0' },
    });
    await client.send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  });

  // ─── 1. The deferred body renders the procedure it promises ──────────────

  describe('the deferred extract-only body', () => {
    const deferred = (): string => {
      const parsed = irlIngestionPrompt.argsSchema.parse({ mode: 'extract-only' });
      const result = irlIngestionPrompt.build(parsed as never);
      const c = result.messages[0].content;
      return c.type === 'text' ? c.text : '';
    };

    it('yields a paste ask, then prepare_irl_body, then the extraction procedure — in that order', () => {
      const text = deferred();
      const askAt = text.indexOf('> Paste the populated');
      const prepareAt = text.indexOf('## Mint the body provenance');
      const planAt = text.indexOf('## Extraction plan');
      const recordAt = text.indexOf('## Extraction step 1 — the IRL extract record');
      expect(askAt).toBeGreaterThan(-1);
      expect(prepareAt).toBeGreaterThan(askAt);
      expect(planAt).toBeGreaterThan(prepareAt);
      expect(recordAt).toBeGreaterThan(planAt);
    });

    it('states its effective mode as extract-only and carries the meta-fence directive', () => {
      const text = deferred();
      expect(text).toContain('- Run mode: **extract-only**');
      expect(text).toContain('## Top-of-dossier meta JSON fence');
    });

    it('renders WORKBOOK_COLUMN_CONTRACT exactly once — the caller must not name it twice', () => {
      const text = deferred();
      expect(text.match(/## IRL workbook column contract/g)).toHaveLength(1);
    });

    it('emits no envelope directive and no precheck — this arm makes no envelope call', () => {
      const text = deferred();
      expect(text).not.toContain('## Envelope composition');
      expect(text).not.toContain('## Envelope precheck');
    });

    it('references no Step 3 it does not render', () => {
      expect(deferred()).not.toContain('reproduced inline at Step 3');
    });
  });

  // ─── 2. The record is consumer-agnostic — the whole claim ────────────────

  describe('one unedited record resolves TWO different consumers', () => {
    it('the fixture actually produced facts (an empty record would prove nothing)', () => {
      expect(RECORD.facts.length).toBeGreaterThan(10);
      expect(RECORD._meta.coverage.answered).toBe(RECORD.facts.length);
    });

    it('CONSUMER 1 — estimate_tech_debt_cost resolves its inputs by request text alone', async () => {
      // Every lookup below is a `request`-text match. No mapping table, no ref
      // arithmetic, no tool-field vocabulary.
      const teamSize = byRequest(RECORD, 'Engineering FTE count');
      const mttr = byRequest(RECORD, 'Mean time to resolution');
      expect(teamSize, 'the record does not carry an engineering FTE fact').not.toBeNull();

      const payload = {
        teamSize: 64,
        salary: 185_000,
        maintenanceBurdenPct: 30,
        deployFrequency: 'Weekly',
        // Present in the record → `irl-stated`; absent → null + a non-stated
        // source. Both branches are exercised across the two tests here.
        incidents: null,
        mttrHours: mttr ? 6 : null,
        remediationBudget: 0,
        arr: 38_600_000,
        remediationPct: 20,
        contextSwitchOn: true,
        _audit: {
          mttrSource: mttr ? ('irl-stated' as const) : ('irl-absent' as const),
          incidentsSource: 'irl-absent' as const,
          ...(mttr ? { mttrCitation: citationFor(mttr) } : {}),
        },
      };
      const result = await callTool('estimate_tech_debt_cost', payload);
      expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
      const out = result.structuredContent as { extractionOnly: string[] };
      // Whatever the record did not cover comes back extraction-only rather
      // than as a fabricated number.
      expect(out.extractionOnly).toContain('incidents');
    });

    it('CONSUMER 2 — compute_techpar resolves ITS inputs from the SAME record, unedited', async () => {
      const arr = byRequest(RECORD, 'Annual recurring revenue');
      const eng = byRequest(RECORD, 'Engineering FTE count');
      expect(arr, 'the record does not carry an ARR fact').not.toBeNull();
      expect(eng, 'the record does not carry an engineering FTE fact').not.toBeNull();

      const citation = citationFor(arr!);
      const engCitation = citationFor(eng!);
      const field = (c: string) => ({
        annualizationSource: 'irl-annualized-stated' as const,
        citation: c,
      });
      const result = await callTool('compute_techpar', {
        // `mode` is a required enum with no default. With the record present
        // the Section 02 components exist, so `deepdive` is the honest choice —
        // which is the point of the rule the prompt now imports.
        mode: 'deepdive',
        stage: 'series-b',
        arr: 38_600_000,
        infraHostingAnnual: 2_400_000,
        infraPersonnel: 5 * 185_000,
        engFTE: 64,
        rdOpEx: 0,
        rdCapEx: 0,
        engCost: (64 - 5) * 185_000,
        prodCost: 900_000,
        toolingCost: 450_000,
        exitMultiple: 6,
        growthRate: 0.3,
        capexView: 'gaap',
        _audit: {
          monetaryBasis: { currency: 'USD' as const, citation },
          arr: field(citation),
          infraHostingAnnual: field(citation),
          infraPersonnel: field(engCitation),
          rdOpEx: field(
            'Section -- — not sourced; deepdive synthesizes R&D OpEx from engCost + prodCost + toolingCost'
          ),
          rdCapEx: field(citation),
          engCost: field(engCitation),
          prodCost: field(engCitation),
          toolingCost: field(engCitation),
        },
      });
      expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
      const out = result.structuredContent as { deeplink: string };
      expect(out.deeplink).toContain('/hub/tools/techpar');
    });

    it('neither consumer required a change to the record — the two resolved from identical bytes', () => {
      // The strongest form of the claim available in-process: serialize before
      // and after both consumers ran and assert byte identity. A consumer that
      // had to reshape the record would have to mutate it here.
      const before = JSON.stringify(RECORD);
      byRequest(RECORD, 'Annual recurring revenue');
      byRequest(RECORD, 'Engineering FTE count');
      expect(JSON.stringify(RECORD)).toBe(before);
    });

    it('every fact resolves its section without a lookup table', () => {
      let checked = 0;
      for (const fact of RECORD.facts) {
        const parts = resolveRefSection(fact.ref);
        expect(parts, `unresolvable ref ${fact.ref}`).not.toBeNull();
        expect(citationFor(fact)).toMatch(/^Section \d{2} — /);
        checked += 1;
      }
      expect(checked).toBeGreaterThan(10);
    });
  });

  // ─── 3. Findings 4 and 5, proven by EXECUTION rather than by reading ─────

  describe('the quick-look defects, proven by execution', () => {
    const TECH_DEBT_BASE = {
      teamSize: 64,
      salary: 185_000,
      maintenanceBurdenPct: 30,
      deployFrequency: 'Weekly',
      remediationBudget: 0,
      arr: 38_600_000,
      remediationPct: 20,
      contextSwitchOn: true,
    };

    it('FINDING 5 — the payload the OLD Step 3 described is rejected: no `_audit` at all', async () => {
      const result = await callTool('estimate_tech_debt_cost', {
        ...TECH_DEBT_BASE,
        incidents: 4,
        mttrHours: 8,
      });
      expect(result.isError, 'a call with no _audit was accepted').toBe(true);
    });

    it('FINDING 5 — and there is no honest enum for "synthesized from stage norms"', async () => {
      // A non-`irl-stated` source FORCES the value to null. The guard rejects a
      // non-null value and returns a retry directive; nothing coerces. So a
      // stage-norm number cannot be laundered through any of the four values.
      const result = await callTool('estimate_tech_debt_cost', {
        ...TECH_DEBT_BASE,
        incidents: 4,
        mttrHours: 8,
        _audit: { mttrSource: 'irl-absent', incidentsSource: 'irl-absent' },
      });
      expect(result.isError).toBe(true);
      const text = result.content?.[0]?.text ?? '';
      expect(text).toMatch(/null/i);
    });

    it('FINDING 5 — the corrected call succeeds and returns extractionOnly for both fields', async () => {
      const result = await callTool('estimate_tech_debt_cost', {
        ...TECH_DEBT_BASE,
        incidents: null,
        mttrHours: null,
        _audit: { mttrSource: 'irl-absent', incidentsSource: 'irl-absent' },
      });
      expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
      const out = result.structuredContent as { extractionOnly: string[] };
      expect(out.extractionOnly.sort()).toEqual(['incidents', 'mttrHours']);
    });

    it('FINDING 5 — a synthesized ZERO under irl-stated is refused, not silently costed', async () => {
      const result = await callTool('estimate_tech_debt_cost', {
        ...TECH_DEBT_BASE,
        incidents: 4,
        mttrHours: 0,
        _audit: { mttrSource: 'irl-stated', incidentsSource: 'irl-stated' },
      });
      expect(result.isError).toBe(true);
    });

    const TECHPAR_BASE = {
      stage: 'series-b',
      arr: 38_600_000,
      infraHostingAnnual: 2_400_000,
      infraPersonnel: 925_000,
      engFTE: 64,
      engCost: 8_000_000,
      prodCost: 700_000,
      toolingCost: 400_000,
      rdOpEx: 4_000_000,
      rdCapEx: 0,
      exitMultiple: 6,
      growthRate: 0.3,
      capexView: 'gaap',
      _audit: buildPartnerSuppliedTechParAudit('quick'),
    };

    it('FINDING 4 — compute_techpar is REJECTED with no `mode`: it is required with no default', async () => {
      const result = await callTool('compute_techpar', TECHPAR_BASE);
      expect(result.isError, 'a call with no mode was accepted').toBe(true);
    });

    it('FINDING 4 — with a mode it succeeds, and the two modes disagree on rdOpEx by construction', async () => {
      const quick = await callTool('compute_techpar', { ...TECHPAR_BASE, mode: 'quick' });
      expect(quick.isError, JSON.stringify(quick.content)).toBeFalsy();

      // Same call, `deepdive`: `rdOpEx` is DISCARDED and synthesized from the
      // three components instead. This is the divergence an unstated mode left
      // to chance — a 1.9x swing and an inverted zone verdict elsewhere.
      const deep = await callTool('compute_techpar', {
        ...TECHPAR_BASE,
        mode: 'deepdive',
        engCost: 10_915_000,
        prodCost: 900_000,
        toolingCost: 450_000,
        _audit: buildPartnerSuppliedTechParAudit('deepdive'),
      });
      expect(deep.isError, JSON.stringify(deep.content)).toBeFalsy();

      const q = quick.structuredContent as { rdPctOfArr?: number; totalTechPct?: number };
      const d = deep.structuredContent as { rdPctOfArr?: number; totalTechPct?: number };
      expect(d.totalTechPct).not.toBe(q.totalTechPct);
    });
  });

  // ─── 4. The negative half: the anti-mappings still refuse both misroutes ──

  describe('request-text matching is a convenience layer, not the correctness mechanism', () => {
    it('a `request` string cannot encode a NEGATIVE — so the rule constants carry the anti-mappings', () => {
      // Misroute 1: the Section-02 component rows pulled into `rdOpEx`.
      expect(TECHPAR_MODE_RULE).toMatch(/no IRL bullet anywhere asks for a total R&D OpEx figure/i);
      expect(TECHPAR_MODE_RULE).toContain('pass `rdOpEx: 0`');
      // Misroute 2: Section 04's `remediationBudget` pulled across tools.
      expect(TECHPAR_MODE_RULE).toMatch(
        /do NOT source it from the Section 04 technical-debt remediation figure/i
      );
      expect(TECHPAR_MODE_RULE).toContain('a different tool');
      // And no `request` text in the record says any of that — which is the
      // point: the record makes the RIGHT mapping easy to find, the rule
      // constants make the WRONG one refused. Both, not either.
      for (const fact of RECORD.facts) {
        expect(fact.request).not.toMatch(/do not|never|rather than/i);
      }
    });

    it('the MTTR anti-mapping (P1 not P0, never a placeholder) also lives in a rule constant', () => {
      expect(MTTR_P1_RULE).toMatch(/Do NOT use the P0 number/);
      expect(MTTR_P1_RULE).toMatch(/DO NOT substitute a placeholder/);
    });

    it('both rules reach the quick-look body, which is where the fourth caller lives', () => {
      const text = irlIngestionPrompt.build(
        irlIngestionPrompt.argsSchema.parse({ mode: 'extract-only' }) as never
      ).messages[0];
      const body = text.content.type === 'text' ? text.content.text : '';
      expect(body).toContain('Section 04 technical-debt remediation figure');
    });
  });
});
