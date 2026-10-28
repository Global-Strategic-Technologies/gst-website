#!/usr/bin/env node
/**
 * Rewrite the English `regulatory-map-data` catalog from the regulation files.
 *
 * `src/data/regulatory-map/*.json` stays English: the MCP server bundles it and
 * returns it verbatim. The es and pt-BR pages read the regulation texts from
 * `src/i18n/<locale>/regulatory-map-data.json`, keyed by regulation id, and the
 * English catalog is the schema those translations are checked against. This
 * script keeps that English a faithful copy of the files:
 *
 *   reg.<id>.name, reg.<id>.summary, reg.<id>.scope (when present),
 *   reg.<id>.req.<n> (n from 1, in file order), reg.<id>.penalties (when present)
 *
 * After it runs, any translation whose English moved is stale until it is
 * retranslated and re-stamped (`npm run i18n:stamp`). Stamping stays the
 * reviewer's act; this script only writes English.
 *
 * Usage:
 *   node scripts/sync-regulatory-map-catalog.mjs          # rewrite the English catalog
 *   node scripts/sync-regulatory-map-catalog.mjs --check  # exit 1 if it is out of date
 *
 * `tests/unit/regulatory-map-catalog.test.ts` runs the same comparison.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'src', 'data', 'regulatory-map');
const CATALOG = join(ROOT, 'src', 'i18n', 'en', 'regulatory-map-data.json');

export function catalogFromRegulations(regulations) {
  const out = {};
  for (const reg of [...regulations].sort((a, b) => a.id.localeCompare(b.id))) {
    const key = `reg.${reg.id}`;
    out[`${key}.name`] = reg.name;
    out[`${key}.summary`] = reg.summary;
    if (reg.scope) out[`${key}.scope`] = reg.scope;
    (reg.keyRequirements ?? []).forEach((req, i) => {
      out[`${key}.req.${i + 1}`] = req;
    });
    if (reg.penalties) out[`${key}.penalties`] = reg.penalties;
  }
  return out;
}

function readRegulations() {
  return readdirSync(DATA)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(DATA, f), 'utf8')));
}

function main(argv) {
  const text = JSON.stringify(catalogFromRegulations(readRegulations()), null, 2) + '\n';
  if (argv.includes('--check')) {
    if (readFileSync(CATALOG, 'utf8') !== text) {
      console.error(
        'src/i18n/en/regulatory-map-data.json is out of date: run npm run i18n:sync-regulatory-map'
      );
      process.exit(1);
    }
    return;
  }
  writeFileSync(CATALOG, text);
  console.log(`Wrote ${Object.keys(JSON.parse(text)).length} keys to ${CATALOG}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
