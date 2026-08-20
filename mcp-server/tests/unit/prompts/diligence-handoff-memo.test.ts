import { describe, it, expect } from 'vitest';
import { diligenceHandoffMemoPrompt } from '../../../src/prompts/diligence-handoff-memo';

const VALID_ARGS = {
  targetName: 'Acme Corp',
  transactionType: 'full-acquisition',
  productType: 'b2b-saas',
  techArchetype: 'modern-cloud-native',
  headcount: '51-200',
  revenueRange: '5-25m',
  growthStage: 'scaling',
  companyAge: '5-10yr',
  geographies: ['us'] as const,
  businessModel: 'productized-platform',
  scaleIntensity: 'moderate',
  transformationState: 'mid-migration',
  dataSensitivity: 'high',
  operatingModel: 'centralized-eng',
};

describe('gst_diligence_handoff_memo', () => {
  it('uses the gst_ slash-menu prefix', () => {
    expect(diligenceHandoffMemoPrompt.name).toMatch(/^gst_/);
  });

  it('exposes targetName as the first argsSchema field (form-order contract)', () => {
    expect(Object.keys(diligenceHandoffMemoPrompt.argsSchema.shape)[0]).toBe('targetName');
  });

  it('normalizes UserInputs enum case variants (case-tolerance contract)', () => {
    const r = diligenceHandoffMemoPrompt.argsSchema.safeParse({
      ...VALID_ARGS,
      transactionType: 'FULL-ACQUISITION', // canonical: 'full-acquisition'
      headcount: '51-200', // already canonical, just to cover the spread path
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.transactionType).toBe('full-acquisition');
  });

  it('argsSchema parses a fully-populated payload', () => {
    expect(diligenceHandoffMemoPrompt.argsSchema.safeParse(VALID_ARGS).success).toBe(true);
  });

  it('argsSchema accepts optional pre-generated artifacts', () => {
    expect(
      diligenceHandoffMemoPrompt.argsSchema.safeParse({
        ...VALID_ARGS,
        agendaJson: '{"topics":[]}',
        comparablesJson: '[]',
      }).success
    ).toBe(true);
  });

  it("argsSchema accepts payloads missing diligence fields (BL-031.95 Phase 2.D — they default to 'unknown')", () => {
    const { transactionType: _t, ...withoutType } = VALID_ARGS;
    const result = diligenceHandoffMemoPrompt.argsSchema.safeParse(withoutType);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.transactionType).toBe('unknown');
  });

  it('argsSchema still rejects payloads missing targetName (the only required field)', () => {
    const { targetName: _t, ...withoutTarget } = VALID_ARGS;
    expect(diligenceHandoffMemoPrompt.argsSchema.safeParse(withoutTarget).success).toBe(false);
  });

  it('build() returns at least one message', () => {
    const parsed = diligenceHandoffMemoPrompt.argsSchema.parse(VALID_ARGS);
    expect(diligenceHandoffMemoPrompt.build(parsed).messages.length).toBeGreaterThanOrEqual(1);
  });

  it('message body mentions every orchestrates entry literally', () => {
    const parsed = diligenceHandoffMemoPrompt.argsSchema.parse(VALID_ARGS);
    const allText = diligenceHandoffMemoPrompt
      .build(parsed)
      .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
      .join('\n');
    for (const ref of diligenceHandoffMemoPrompt.orchestrates) {
      expect(allText).toContain(ref);
    }
  });

  it('accepts geographies as a JSON-encoded string (Claude Desktop wire shape)', () => {
    const r = diligenceHandoffMemoPrompt.argsSchema.safeParse({
      ...VALID_ARGS,
      geographies: '["us"]',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.geographies).toEqual(['us']);
  });

  it('normalizes geographies case variants (US -> us)', () => {
    const r = diligenceHandoffMemoPrompt.argsSchema.safeParse({
      ...VALID_ARGS,
      geographies: ['US'],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.geographies).toEqual(['us']);
  });

  it('embeds the canonical VDR Library article as a second message', () => {
    const parsed = diligenceHandoffMemoPrompt.argsSchema.parse(VALID_ARGS);
    const result = diligenceHandoffMemoPrompt.build(parsed);
    expect(result.messages.length).toBeGreaterThanOrEqual(2);
    const second = result.messages[1].content;
    expect(second.type).toBe('resource');
    if (second.type === 'resource') {
      expect(second.resource.uri).toBe('gst://library/vdr-structure');
    }
  });

  it('uses pre-generated artifacts directly when supplied (skips re-generation)', () => {
    const parsed = diligenceHandoffMemoPrompt.argsSchema.parse({
      ...VALID_ARGS,
      agendaJson: '{"topics":["unique-marker-xyz"]}',
    });
    const allText = diligenceHandoffMemoPrompt
      .build(parsed)
      .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
      .join('\n');
    expect(allText).toContain('unique-marker-xyz');
  });

  it('instructs the model to surface the search_portfolio deeplink instead of inventing per-comparable anchor URLs (BL-031.95 Phase 4.B / Phase 5 contract)', () => {
    // V8 sign-off (pre-BL-031.95) pinned per-comparable static anchor
    // URLs of the form `/ma-portfolio/#<codeName-lowercase>`. Those have
    // no website-side handler and were retired in Phase 5 — the canonical
    // click-through is the filtered-grid `deeplink` field returned by
    // `search_portfolio` (BL-031.95 Phase 4.B). Body Step 4 section (4)
    // now instructs the model to use the deeplink, not invent anchors.
    const parsed = diligenceHandoffMemoPrompt.argsSchema.parse(VALID_ARGS);
    const allText = diligenceHandoffMemoPrompt
      .build(parsed)
      .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
      .join('\n');
    expect(allText).toContain('search_portfolio');
    expect(allText).toContain('deeplink');
    // Locking the retirement of the old anchor-URL pattern.
    expect(allText).not.toContain('/ma-portfolio/#');
  });

  describe("BL-031.95 Phase 2.D — 'unknown' defaulting on the 13 wizard fields", () => {
    it("argsSchema accepts a payload with only targetName supplied (all 13 wizard fields default to 'unknown')", () => {
      const result = diligenceHandoffMemoPrompt.argsSchema.safeParse({ targetName: 'Acme Corp' });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.transactionType).toBe('unknown');
      expect(result.data.geographies).toEqual(['unknown']);
      expect(result.data.operatingModel).toBe('unknown');
    });

    it("partial payload — supplied fields keep their values; omitted fields default to 'unknown'", () => {
      const result = diligenceHandoffMemoPrompt.argsSchema.safeParse({
        targetName: 'Acme Corp',
        productType: 'b2b-saas',
      });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.productType).toBe('b2b-saas');
      expect(result.data.transactionType).toBe('unknown');
    });

    it('build() succeeds with a target-name-only payload and embeds unknown values verbatim', () => {
      const parsed = diligenceHandoffMemoPrompt.argsSchema.parse({ targetName: 'Acme Corp' });
      const result = diligenceHandoffMemoPrompt.build(parsed);
      expect(result.messages.length).toBeGreaterThanOrEqual(1);
      const allText = result.messages
        .map((m) => (m.content.type === 'text' ? m.content.text : ''))
        .join('\n');
      expect(allText).toContain('transactionType=unknown');
    });
  });
  // ─── Evidence-conditional `_audit` (the target-quick-look pattern, third instance) ───
  //
  // This prompt hardcoded the required `_audit` as Tier-3
  // `"Section -- — partner-supplied form input"` for every one of the 13
  // dimensions, unconditionally. With the evidence-precedence clause carried,
  // that is a body contradicting its own clause: the clause says resolve from
  // evidence and cite the reference, the block mandated the no-evidence
  // sentinel on every field. No schema work was involved — `diligence-audit.ts`
  // already validates a real citation at tier 1/2 and already couples
  // `unknown` <-> tier 3 bidirectionally.
  describe('evidence-conditional _audit', () => {
    const body = (): string =>
      diligenceHandoffMemoPrompt
        .build(diligenceHandoffMemoPrompt.argsSchema.parse({ targetName: 'Acme Corp' }))
        .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
        .join('\n');

    it('carries the shared evidence-precedence clause and declares the flag', () => {
      expect(diligenceHandoffMemoPrompt.consumesTargetEvidence).toBe(true);
      expect(body()).toContain('Canonical GST target evidence takes precedence over synthesis.');
    });

    it('no longer mandates the Tier-3 sentinel unconditionally', () => {
      const text = body();
      expect(text).not.toContain('every audit entry uses tier "3"');
      expect(text).toMatch(/depends on where its value actually came from/i);
    });

    it('states the evidence branch: cite the record fact, derive the section from its ref', () => {
      const text = body();
      expect(text).toMatch(/Evidence branch/);
      expect(text).toContain('Section NN — ');
      expect(text).toContain('`0-03` → `Section 00`');
      expect(text).toMatch(/whole-token literal/i);
      expect(text).toMatch(/at least 20 characters/i);
      expect(text).toMatch(/EM-DASH/);
    });

    it("preserves 'unknown' + tier-3 for dimensions the evidence does not cover", () => {
      const text = body();
      expect(text).toMatch(/survives the evidence branch/i);
      expect(text).toMatch(/widen(s)? the agenda conservatively/i);
      expect(text).toMatch(/must not suppress that sentinel/i);
      expect(text).toMatch(/bidirectional/i);
    });

    it('keeps the enum mapping in the CONSUMER, not in the record', () => {
      expect(body()).toMatch(
        /record deliberately does not carry this tool's 13-dimension enum set/
      );
    });

    it('scopes the Section -- sentinel to the no-evidence case, and keeps it', () => {
      const text = body();
      expect(text).toMatch(/No-evidence branch/);
      expect(text).toContain('Section -- — partner-supplied form input');
    });
  });
});
