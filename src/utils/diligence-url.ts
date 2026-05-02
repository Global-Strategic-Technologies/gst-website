/**
 * Diligence Machine — URL state serialisation.
 *
 * Mirrors TechPar's readable-params convention (per BL-031.95 Phase 2):
 * each of the 13 UserInputs fields encodes to a single-letter URL
 * parameter; the `geographies` array is comma-joined.
 *
 * Imported by both:
 *   - the website page (`src/pages/hub/tools/diligence-machine/index.astro`)
 *     for syncing URL state on input changes and hydrating from URL on
 *     page-load init (URL takes precedence over localStorage)
 *   - the MCP tool wrapper (`mcp-server/src/tools/diligence.ts`) for
 *     emitting the `deeplink` field that opens the wizard pre-populated
 *
 * The encoder is the single source of truth for diligence URL state.
 *
 * Schema validation (including the BL-031.95 `'unknown'` sentinel) lives
 * at the engine boundary in `src/schemas/diligence.ts`; this module
 * silently drops invalid-shape values on decode and lets the wizard /
 * engine surface validation errors at use time.
 */

import type { UserInputs } from './diligence-engine';

/**
 * Compact single-letter URL keys → UserInputs field names. The encoded
 * URL is short enough to share via Slack / email even with all 13
 * dimensions populated.
 */
export const PARAM_KEYS = {
  tt: 'transactionType',
  pt: 'productType',
  ta: 'techArchetype',
  hc: 'headcount',
  rr: 'revenueRange',
  gs: 'growthStage',
  ca: 'companyAge',
  ge: 'geographies',
  bm: 'businessModel',
  si: 'scaleIntensity',
  ts: 'transformationState',
  ds: 'dataSensitivity',
  om: 'operatingModel',
} as const;

const FIELD_TO_KEY: Record<keyof UserInputs, string> = {
  transactionType: 'tt',
  productType: 'pt',
  techArchetype: 'ta',
  headcount: 'hc',
  revenueRange: 'rr',
  growthStage: 'gs',
  companyAge: 'ca',
  geographies: 'ge',
  businessModel: 'bm',
  scaleIntensity: 'si',
  transformationState: 'ts',
  dataSensitivity: 'ds',
  operatingModel: 'om',
};

/**
 * Serialize partial diligence inputs to URL search params. Empty / null
 * fields are omitted (so a freshly-started wizard yields an empty URL,
 * not `?tt=&pt=&...`). The `geographies` array is comma-joined.
 */
export function serializeToParams(inputs: Partial<UserInputs>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [field, key] of Object.entries(FIELD_TO_KEY) as [keyof UserInputs, string][]) {
    const value = inputs[field];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(','));
    } else if (typeof value === 'string' && value.length > 0) {
      params.set(key, value);
    }
  }
  return params;
}

/**
 * Deserialize URL search params into partial diligence inputs. Empty
 * values are dropped; comma-separated `geographies` are split. Invalid
 * enum values are NOT validated here — schema validation happens at the
 * engine / MCP boundary, where a value like `'unknown'` (BL-031.95
 * sentinel) is accepted but a typo would be rejected.
 */
export function deserializeFromParams(params: URLSearchParams): Partial<UserInputs> {
  const out: Partial<UserInputs> = {};
  const get = (key: string) => {
    const v = params.get(key);
    return v && v.length > 0 ? v : undefined;
  };

  const tt = get('tt');
  if (tt) out.transactionType = tt;
  const pt = get('pt');
  if (pt) out.productType = pt;
  const ta = get('ta');
  if (ta) out.techArchetype = ta;
  const hc = get('hc');
  if (hc) out.headcount = hc;
  const rr = get('rr');
  if (rr) out.revenueRange = rr;
  const gs = get('gs');
  if (gs) out.growthStage = gs;
  const ca = get('ca');
  if (ca) out.companyAge = ca;
  const ge = get('ge');
  if (ge) {
    const items = ge
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length > 0) out.geographies = items;
  }
  const bm = get('bm');
  if (bm) out.businessModel = bm;
  const si = get('si');
  if (si) out.scaleIntensity = si;
  const ts = get('ts');
  if (ts) out.transformationState = ts;
  const ds = get('ds');
  if (ds) out.dataSensitivity = ds;
  const om = get('om');
  if (om) out.operatingModel = om;

  return out;
}
