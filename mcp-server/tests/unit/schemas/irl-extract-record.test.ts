/**
 * The IRL extract record schema.
 *
 * **What these tests are actually protecting.** The record's whole premise is
 * that a consumer can resolve its own inputs from it without a mapping table
 * and without re-reading the IRL. Two properties carry that, and both fail
 * SILENTLY when broken:
 *
 *   1. **The ref is the workbook `Reference` column, and only that.** Four ref
 *      builders exist in this repo and three of them produce the `NN-II`
 *      exclusion key (`00-03`) rather than the workbook value (`0-03`). A
 *      record keyed on the wrong one parses, looks canonical, and never matches
 *      the reference the target quoted. So the tests reuse `buildReferenceId`
 *      — the generator's own function — rather than restating the format.
 *
 *   2. **Coverage is counted, not claimed.** `_meta.coverage.answered` and
 *      `facts.length` are the same set counted twice; a divergence means one of
 *      them was asserted.
 *
 * **What is deliberately NOT validated: membership in the generator source.** A
 * "every ref resolves to a canonical bullet" guard would reject legitimate
 * rows. `customRequests` append at `ordinal = base + 1 + k`, so a custom on §00
 * is `0-11` — present in the filled workbook, absent from the source — and
 * `customRequests` is a first-class `gst_information_request_list` argument, so
 * the strict form would fail on every engagement that used one. The admission
 * rule is grammar plus section resolvability, and it must tolerate the
 * `canonicalBulletCount ?? reduce-max-over-bullets` fallback that hand-built
 * articles take.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  IrlExtractRecordSchema,
  IrlExtractFactSchema,
  IRL_EXTRACT_EXCERPT_CAP_CHARS,
  IRL_EXTRACT_EXCERPT_MIN_CHARS,
  IRL_EXTRACT_RECORD_VERSION,
  IRL_EXTRACT_REF_FORMAT,
  IRL_EXTRACT_RECORD_DIRECTIVE,
  IRL_REF_PATTERN,
  resolveRefSection,
  refForBullet,
} from '../../../src/schemas/irl-extract-record';
import { parseIrlArticle } from '../../../../src/utils/irl/parse-article';
import { customizeIrlArticle } from '../../../../src/utils/irl/customize-article';
import { buildReferenceId } from '../../../../src/utils/irl/generate-xlsx';
import { loadIrlSourceBody } from '../../../src/content/irl-source-loader';
import type { IRLArticle } from '../../../../src/utils/irl/types';

/**
 * The workbook-shape fixture — the one filled IRL in the repo that renders the
 * `- <ref> <request> [<STATUS>] — <answer>` bullet form the column contract
 * defines, and therefore the only one a record can be built from mechanically.
 */
const NORTHWIND = readFileSync('tests/fixtures/northwind-workbook-columns-filled-irl.md', 'utf8');

const BULLET = /^- (\d{1,2}-\d{2}) (.+?) \[(OPEN|PARTIAL|CLOSED)\] — (.*)$/;
const TRAILERS = /\s*\((?:Source|Note): [^)]*\)\s*$/;

function stripTrailers(answer: string): string {
  let a = answer;
  let prev: string;
  do {
    prev = a;
    a = a.replace(TRAILERS, '');
  } while (a !== prev);
  return a.trim();
}

/** Cap on a word boundary — the rule the directive states, applied here so the fixture record is conformant. */
function capExcerpt(text: string): { excerpt: string; truncated: boolean } {
  if (text.length <= IRL_EXTRACT_EXCERPT_CAP_CHARS) return { excerpt: text, truncated: false };
  const slice = text.slice(0, IRL_EXTRACT_EXCERPT_CAP_CHARS - 1);
  const lastSpace = slice.lastIndexOf(' ');
  const kept = lastSpace > IRL_EXTRACT_EXCERPT_MIN_CHARS ? slice.slice(0, lastSpace) : slice;
  return { excerpt: `${kept}…`, truncated: true };
}

/** Build the record a conformant extract-only run would emit for a workbook-shape body. */
function buildRecordFromBody(body: string, over: Record<string, unknown> = {}) {
  const facts: Array<Record<string, unknown>> = [];
  let rowsPresent = 0;
  for (const line of body.split(/\r?\n/)) {
    const m = BULLET.exec(line);
    if (!m) continue;
    rowsPresent += 1;
    const [, ref, request, status, rawAnswer] = m;
    const answer = stripTrailers(rawAnswer);
    if (!answer || answer === '<NO RESPONSE>') continue;
    const { excerpt, truncated } = capExcerpt(answer);
    facts.push({
      ref,
      request,
      status,
      excerpt,
      ...(truncated ? { excerptTruncated: true } : {}),
      tier: 2,
    });
  }
  return {
    _meta: {
      recordVersion: IRL_EXTRACT_RECORD_VERSION,
      refFormat: IRL_EXTRACT_REF_FORMAT,
      irlBodyHash: '0123456789abcdef',
      irlSource: 'partner-paste-verbatim',
      generatedAt: '2026-08-20T09:00:00.000Z',
      generatedAtSource: 'server-witnessed',
      promptVersion: '0.29.0',
      excerptCapChars: IRL_EXTRACT_EXCERPT_CAP_CHARS,
      coverage: { answered: facts.length, rowsPresent },
      ...(over._meta as object),
    },
    facts,
  };
}

describe('IrlExtractRecordSchema — a record built from a real filled fixture', () => {
  const record = buildRecordFromBody(NORTHWIND);

  it('parses, and the fixture actually produced facts (an empty set would pass vacuously)', () => {
    expect(
      record.facts.length,
      'the fixture yielded no facts — the probe is empty'
    ).toBeGreaterThan(10);
    expect(IrlExtractRecordSchema.safeParse(record).success).toBe(true);
  });

  it('round-trips the three self-describing _meta fields a travelling artifact needs', () => {
    const parsed = IrlExtractRecordSchema.parse(record);
    expect(parsed._meta.generatedAt).toBe('2026-08-20T09:00:00.000Z');
    expect(parsed._meta.generatedAtSource).toBe('server-witnessed');
    expect(parsed._meta.promptVersion).toBe('0.29.0');
  });

  it.each([
    ['generatedAt', 'generatedAt'],
    ['generatedAtSource', 'generatedAtSource'],
    ['promptVersion', 'promptVersion'],
    ['irlBodyHash', 'irlBodyHash'],
    ['refFormat', 'refFormat'],
    ['excerptCapChars', 'excerptCapChars'],
    ['coverage', 'coverage'],
  ])('REQUIRES _meta.%s — nothing server-side can supply it later', (_label, key) => {
    const meta = { ...record._meta } as Record<string, unknown>;
    delete meta[key];
    const result = IrlExtractRecordSchema.safeParse({ ...record, _meta: meta });
    expect(result.success, `_meta.${key} was optional`).toBe(false);
  });

  it('rejects a model-asserted timestamp labelled as a server witness only by enum, not by lie', () => {
    // The discriminator is carried, not inferred — so the schema's job is to
    // force a CHOICE, not to police which one. An invented third value is what
    // it refuses.
    const bad = {
      ...record,
      _meta: { ...record._meta, generatedAtSource: 'probably-server' },
    };
    expect(IrlExtractRecordSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a promptVersion that is not semver (the mcp-server package version is a common substitution)', () => {
    const bad = { ...record, _meta: { ...record._meta, promptVersion: 'v0.29' } };
    expect(IrlExtractRecordSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a hand-computed-looking irlBodyHash (wrong length / non-hex)', () => {
    for (const hash of ['0123456789abcde', 'ZZZZ456789abcdef', '0123456789ABCDEF']) {
      expect(
        IrlExtractRecordSchema.safeParse({
          ...record,
          _meta: { ...record._meta, irlBodyHash: hash },
        }).success,
        `accepted ${hash}`
      ).toBe(false);
    }
  });
});

describe('ref grammar — the workbook Reference column, and only that', () => {
  it('every ref in the fixture record is exactly what buildReferenceId would produce', () => {
    // Reuses the generator's own function rather than restating the format, so
    // the record's key is the workbook's key by construction.
    const record = buildRecordFromBody(NORTHWIND);
    let checked = 0;
    for (const fact of record.facts) {
      const parts = resolveRefSection(fact.ref as string);
      expect(parts, `unparseable ref ${String(fact.ref)}`).not.toBeNull();
      expect(refForBullet(parts!.sectionNumber, parts!.ordinal)).toBe(fact.ref);
      checked += 1;
    }
    expect(checked, 'the ref probe iterated an empty set').toBeGreaterThan(10);
  });

  it('accepts the workbook form and REJECTS the NN-II exclusion key list_irl_requests returns', () => {
    expect(IRL_REF_PATTERN.test('0-03')).toBe(true);
    expect(IRL_REF_PATTERN.test('9-11')).toBe(true);
    // Engagement-specific sections real workbooks carry and the source does not.
    expect(IRL_REF_PATTERN.test('10-01')).toBe(true);
    expect(IRL_REF_PATTERN.test('11-02')).toBe(true);
    // The exclusion key. This is the silent-failure case the pattern exists for.
    expect(IRL_REF_PATTERN.test('00-03')).toBe(false);
    expect(IRL_REF_PATTERN.test('02-03')).toBe(false);
    // Junk.
    expect(IRL_REF_PATTERN.test('0-3')).toBe(false);
    expect(IRL_REF_PATTERN.test('12-01')).toBe(false);
    expect(IRL_REF_PATTERN.test('Section 00')).toBe(false);
  });

  it('resolveRefSection reports canonical vs engagement-specific sections without rejecting either', () => {
    expect(resolveRefSection('0-03')).toEqual({
      sectionDigit: '0',
      sectionNumber: '00',
      ordinal: 3,
      canonicalSection: true,
    });
    expect(resolveRefSection('10-01')?.canonicalSection).toBe(false);
    expect(resolveRefSection('00-03')).toBeNull();
  });

  it('admits a customRequests ref PAST canonicalBulletCount — the strict form would fail every engagement that used one', () => {
    const article = parseIrlArticle(loadIrlSourceBody());
    const section00 = article.sections.find((s) => s.number === '00');
    expect(section00?.canonicalBulletCount, 'section 00 must exist to test the append').toBeTypeOf(
      'number'
    );

    const customized = customizeIrlArticle(article, {
      excludeRequests: ['00-02'],
      customRequests: [{ section: '00', text: 'Bespoke: prior-year audit adjustments' }],
    });
    const customSection = customized.sections.find((s) => s.number === '00')!;
    const appended = customSection.bullets[customSection.bullets.length - 1];
    const ref = buildReferenceId('00', appended.ordinal!);

    // The custom sits past the canonical count and is still a well-formed ref.
    expect(appended.ordinal!).toBeGreaterThan(section00!.canonicalBulletCount!);
    expect(IRL_REF_PATTERN.test(ref)).toBe(true);
    expect(resolveRefSection(ref)?.canonicalSection).toBe(true);

    // And a record carrying it parses.
    const record = buildRecordFromBody(NORTHWIND);
    record.facts.push({
      ref,
      request: 'Bespoke: prior-year audit adjustments',
      status: 'CLOSED',
      excerpt: 'Two adjustments, both booked in the FY25 restatement',
      tier: 2,
    });
    record._meta.coverage.answered += 1;
    record._meta.coverage.rowsPresent += 1;
    expect(IrlExtractRecordSchema.safeParse(record).success).toBe(true);
  });

  it('an excludeRequests gap leaves refs STABLE rather than renumbering — which is what a travelling record needs', () => {
    const article = parseIrlArticle(loadIrlSourceBody());
    const customized = customizeIrlArticle(article, { excludeRequests: ['00-02'] });
    const section = customized.sections.find((s) => s.number === '00')!;
    const refs = section.bullets.map((b) => buildReferenceId('00', b.ordinal!));
    // The removed question leaves an intentional GAP; ARR keeps its ref.
    expect(refs).toContain('0-01');
    expect(refs).not.toContain('0-02');
    expect(refs).toContain('0-03');
  });

  it('tolerates the reduce-max ordinal fallback for a hand-built article with no canonicalBulletCount', () => {
    // `addCustomRequests` falls back to `max(ordinal) ?? length` when
    // `canonicalBulletCount` is absent. The admission rule must not depend on
    // the field being present.
    const handBuilt = {
      title: 'Hand-built',
      intro: 'x',
      sections: [
        {
          number: '03',
          title: 'Infrastructure & Operations',
          bullets: [
            { text: 'a', ordinal: 1 },
            { text: 'b', ordinal: 2 },
          ],
        },
      ],
    } as unknown as IRLArticle;
    const customized = customizeIrlArticle(handBuilt, {
      customRequests: [{ section: '03', text: 'Bespoke hosting question' }],
    });
    const appended = customized.sections[0].bullets.at(-1)!;
    const ref = buildReferenceId('03', appended.ordinal!);
    expect(ref).toBe('3-03');
    expect(IRL_REF_PATTERN.test(ref)).toBe(true);
  });
});

describe('excerpt cap — a floor and a token-preservation rule, not a byte count', () => {
  const base = {
    ref: '0-03',
    request: 'Annual recurring revenue',
    status: 'CLOSED' as const,
    tier: 2 as const,
  };

  it('the cap can never be set below the tier-1 citation floor', () => {
    // `diligence-audit.ts` rejects a post-em-dash excerpt under 20 characters
    // outright, so a record declaring a shorter cap could not cite at all.
    expect(IRL_EXTRACT_EXCERPT_CAP_CHARS).toBeGreaterThanOrEqual(IRL_EXTRACT_EXCERPT_MIN_CHARS);
    const record = buildRecordFromBody(NORTHWIND);
    record._meta.excerptCapChars = IRL_EXTRACT_EXCERPT_MIN_CHARS - 1;
    expect(IrlExtractRecordSchema.safeParse(record).success).toBe(false);
  });

  it('rejects an excerpt past the declared cap', () => {
    const record = buildRecordFromBody(NORTHWIND);
    record.facts[0].excerpt = 'x'.repeat(IRL_EXTRACT_EXCERPT_CAP_CHARS + 5);
    expect(IrlExtractRecordSchema.safeParse(record).success).toBe(false);
  });

  it('rejects a truncation FLAG on a span that was plainly not truncated', () => {
    // A flag on a complete citation tells a consumer to distrust a citation it
    // could have used at tier 1 — the same defect as the missing flag, inverted.
    const record = buildRecordFromBody(NORTHWIND);
    record.facts[0].excerpt = 'short but complete answer text';
    record.facts[0].excerptTruncated = true;
    expect(IrlExtractRecordSchema.safeParse(record).success).toBe(false);
  });

  it('carries a genuinely short answer whole, with no flag', () => {
    expect(IrlExtractFactSchema.safeParse({ ...base, excerpt: '212 as of June' }).success).toBe(
      true
    );
  });

  it('the word-boundary rule keeps the last token intact', () => {
    // A byte-only cut through `productized-platform` demotes a tier-1 citation
    // to tier 2, which is the reason the excerpt is carried at all.
    const long = `The buyer runs a ${'filler '.repeat(40)}productized-platform model`;
    const { excerpt, truncated } = capExcerpt(long);
    expect(truncated).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(IRL_EXTRACT_EXCERPT_CAP_CHARS);
    // Every token before the ellipsis is a whole word from the source.
    const tokens = excerpt.replace(/…$/, '').trim().split(/\s+/);
    for (const t of tokens) {
      expect(long.split(/\s+/), `severed token: ${t}`).toContain(t);
    }
  });
});

describe('coverage is counted, not claimed', () => {
  it('rejects a coverage.answered that disagrees with facts.length', () => {
    const record = buildRecordFromBody(NORTHWIND);
    record._meta.coverage.answered += 1;
    expect(IrlExtractRecordSchema.safeParse(record).success).toBe(false);
  });

  it('rejects more answered rows than the workbook contains', () => {
    const record = buildRecordFromBody(NORTHWIND);
    record._meta.coverage.rowsPresent = record.facts.length - 1;
    expect(IrlExtractRecordSchema.safeParse(record).success).toBe(false);
  });

  it('rejects two facts claiming the same ref', () => {
    const record = buildRecordFromBody(NORTHWIND);
    record.facts.push({ ...record.facts[0] });
    record._meta.coverage.answered += 1;
    expect(IrlExtractRecordSchema.safeParse(record).success).toBe(false);
  });
});

describe('normalization is to units and scalars, never to a consumer enum', () => {
  const base = {
    ref: '0-03',
    request: 'Annual recurring revenue',
    status: 'CLOSED' as const,
    excerpt: 'Implied ARR run-rate ~$31M CAD as of Apr-2026',
    tier: 2 as const,
  };

  it('accepts a USD-normalized figure carrying its conversion basis', () => {
    const parsed = IrlExtractFactSchema.parse({
      ...base,
      value: {
        normalized: 22600000,
        unit: 'USD/yr',
        basis: { native: '31000000 CAD', usdRate: 0.73 },
      },
    });
    expect(parsed.value?.basis?.usdRate).toBe(0.73);
  });

  it('accepts an ISO date and an integer count as scalars', () => {
    expect(
      IrlExtractFactSchema.safeParse({
        ...base,
        value: { normalized: '2024-11-01', unit: 'ISO-8601' },
      }).success
    ).toBe(true);
    expect(
      IrlExtractFactSchema.safeParse({ ...base, value: { normalized: 58, unit: 'FTE' } }).success
    ).toBe(true);
  });

  it('omits value entirely for a narrative answer', () => {
    expect(IrlExtractFactSchema.safeParse(base).success).toBe(true);
  });

  it('requires a unit whenever a scalar is present — a bare number is not a fact', () => {
    expect(IrlExtractFactSchema.safeParse({ ...base, value: { normalized: 58 } }).success).toBe(
      false
    );
  });
});

describe('the body directive and the schema cannot state different numbers', () => {
  it('the rendered directive interpolates the cap and floor from the schema constants', () => {
    expect(IRL_EXTRACT_RECORD_DIRECTIVE).toContain(`${IRL_EXTRACT_EXCERPT_CAP_CHARS} characters`);
    expect(IRL_EXTRACT_RECORD_DIRECTIVE).toContain(`${IRL_EXTRACT_EXCERPT_MIN_CHARS} characters`);
    expect(IRL_EXTRACT_RECORD_DIRECTIVE).toContain(
      `"excerptCapChars": ${IRL_EXTRACT_EXCERPT_CAP_CHARS}`
    );
    expect(IRL_EXTRACT_RECORD_DIRECTIVE).toContain(
      `"recordVersion": "${IRL_EXTRACT_RECORD_VERSION}"`
    );
    expect(IRL_EXTRACT_RECORD_DIRECTIVE).toContain(`"refFormat": "${IRL_EXTRACT_REF_FORMAT}"`);
  });

  it('states the token-preservation rule, not just a byte cap', () => {
    expect(IRL_EXTRACT_RECORD_DIRECTIVE).toMatch(/word boundary/i);
    expect(IRL_EXTRACT_RECORD_DIRECTIVE).toMatch(/never mid-token/i);
  });

  it("warns against the NN-II key, which is the record's silent-failure mode", () => {
    expect(IRL_EXTRACT_RECORD_DIRECTIVE).toContain('list_irl_requests');
    expect(IRL_EXTRACT_RECORD_DIRECTIVE).toContain('00-03');
  });
});
