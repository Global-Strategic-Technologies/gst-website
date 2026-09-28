/**
 * The IRL citation form and the partner-supplied sentinel citation, shared by
 * the Diligence and TechPar `_audit` schemas.
 *
 * `CITATION_FORM_RE` is the one "Section NN — <excerpt>" shape both
 * `citationSchema`s enforce. `PARTNER_SUPPLIED_DEFAULT_CITATION` is the Tier-3
 * citation the two partner-supplied builders (`buildPartnerSuppliedAudit`,
 * `buildPartnerSuppliedTechParAudit`) stamp on every field; the literal `--`
 * section marks "no IRL section". Prompt bodies and `.describe()` strings that
 * spell the sentinel out stay literal — they are published text.
 */

/** "Section NN — <excerpt of ≥20 characters>", or `Section --` for partner-supplied input. */
export const CITATION_FORM_RE = /^Section (\d{2}|--)[^—]*—.{20,}$/;

export const PARTNER_SUPPLIED_DEFAULT_CITATION =
  'Section -- — partner-supplied form input — value sourced from prompt form, no IRL provenance available';
