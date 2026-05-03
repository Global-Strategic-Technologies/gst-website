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
});
