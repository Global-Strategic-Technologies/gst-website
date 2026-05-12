/**
 * Wire-tolerant version of UserInputsSchema's shape, scoped to the two
 * prompts that surface the full 13-field diligence-wizard payload as MCP
 * arguments (`gst_diligence_kickoff`, `gst_diligence_handoff_memo`).
 *
 * Each enum field is wrapped in `enumFromWire` so users typing
 * `"B2B-SaaS"` (or any other case variant) at the form-fill stage in
 * Claude Desktop don't trip Zod's strict enum check; the `geographies`
 * array's inner enum gets the same treatment, composed with
 * `arrayFromWire` so the array itself can also arrive as a JSON-encoded
 * or comma-separated string.
 *
 * **BL-031.95 Phase 2.D — `'unknown'` defaulting**: every field is
 * `.optional().default('unknown')` (or `['unknown']` for `geographies`)
 * so an analyst invoking `gst_diligence_kickoff` at deal kickoff with
 * only the target name supplied gets a coherent, intentionally-broad
 * agenda rather than being forced to guess. The engine treats
 * `'unknown'` as a non-eliminating value — agendas widen conservatively
 * when input is incomplete, mirroring ICG's `-1` "Not sure" pattern.
 *
 * Optional/default placement INSIDE `enumFromWire` is intentional: the
 * preprocess turns empty form-field strings into `undefined`, and the
 * `.default()` then catches that undefined to yield `'unknown'`. Putting
 * the optional/default outside the wire wrapper would mis-route the
 * empty-string path (see `wire-shape.ts` doc comments for the V7-trial-
 * (b) discussion).
 *
 * Spread `...userInputsShapeFromWire()` into a prompt's argsSchema
 * instead of `...UserInputsSchema.shape` so the wire-tolerant version is
 * the one the prompt validates against.
 */

import { z } from 'zod';
import { UserInputsSchema } from '../schemas';
import { GEOGRAPHY_IDS } from '../../../src/data/diligence-machine/wizard-config';
import { arrayFromWire, enumFromWire } from './wire-shape';

const UNKNOWN = 'unknown' as const;

export function userInputsShapeFromWire() {
  const s = UserInputsSchema.shape;
  return {
    transactionType: enumFromWire(s.transactionType.optional().default(UNKNOWN)),
    productType: enumFromWire(s.productType.optional().default(UNKNOWN)),
    techArchetype: enumFromWire(s.techArchetype.optional().default(UNKNOWN)),
    headcount: enumFromWire(s.headcount.optional().default(UNKNOWN)),
    revenueRange: enumFromWire(s.revenueRange.optional().default(UNKNOWN)),
    growthStage: enumFromWire(s.growthStage.optional().default(UNKNOWN)),
    companyAge: enumFromWire(s.companyAge.optional().default(UNKNOWN)),
    geographies: arrayFromWire(
      z
        .array(enumFromWire(z.enum([...GEOGRAPHY_IDS, UNKNOWN] as const)))
        .min(1)
        .optional()
        .default([UNKNOWN])
    ),
    businessModel: enumFromWire(s.businessModel.optional().default(UNKNOWN)),
    scaleIntensity: enumFromWire(s.scaleIntensity.optional().default(UNKNOWN)),
    transformationState: enumFromWire(s.transformationState.optional().default(UNKNOWN)),
    dataSensitivity: enumFromWire(s.dataSensitivity.optional().default(UNKNOWN)),
    operatingModel: enumFromWire(s.operatingModel.optional().default(UNKNOWN)),
  };
}
