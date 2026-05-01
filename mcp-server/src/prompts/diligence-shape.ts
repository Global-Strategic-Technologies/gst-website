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
 * Spread `...userInputsShapeFromWire()` into a prompt's argsSchema
 * instead of `...UserInputsSchema.shape` so the wire-tolerant version is
 * the one the prompt validates against.
 */

import { z } from 'zod';
import { UserInputsSchema } from '../schemas';
import { GEOGRAPHY_IDS } from '../../../src/data/diligence-machine/wizard-config';
import { arrayFromWire, enumFromWire } from './wire-shape';

export function userInputsShapeFromWire() {
  const s = UserInputsSchema.shape;
  return {
    transactionType: enumFromWire(s.transactionType),
    productType: enumFromWire(s.productType),
    techArchetype: enumFromWire(s.techArchetype),
    headcount: enumFromWire(s.headcount),
    revenueRange: enumFromWire(s.revenueRange),
    growthStage: enumFromWire(s.growthStage),
    companyAge: enumFromWire(s.companyAge),
    geographies: arrayFromWire(z.array(enumFromWire(z.enum(GEOGRAPHY_IDS))).min(1)),
    businessModel: enumFromWire(s.businessModel),
    scaleIntensity: enumFromWire(s.scaleIntensity),
    transformationState: enumFromWire(s.transformationState),
    dataSensitivity: enumFromWire(s.dataSensitivity),
    operatingModel: enumFromWire(s.operatingModel),
  };
}
