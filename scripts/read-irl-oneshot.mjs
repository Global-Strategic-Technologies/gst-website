// One-shot reader for verifying an IRL xlsx during BL-045 PR B review.
// Not wired into npm scripts — invoke directly:
//   node scripts/read-irl-oneshot.mjs <absolute-path-to-xlsx>
//
// This file is intentionally not committed.
import xlsx from 'xlsx-js-style';

const path = process.argv[2];
if (!path) {
  console.error('usage: node scripts/read-irl-oneshot.mjs <path-to-xlsx>');
  process.exit(1);
}

const wb = xlsx.readFile(path);
console.log('# Workbook:', path);
console.log('# Sheets:', wb.SheetNames.join(' | '));

for (const name of wb.SheetNames) {
  const sheet = wb.Sheets[name];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
  console.log(`\n=== SHEET: ${name} (${rows.length} rows) ===`);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].map((c) => (typeof c === 'string' ? c.replace(/\s+/g, ' ').trim() : c));
    if (row.every((c) => c === '' || c === null || c === undefined)) continue;
    console.log(`${String(i + 1).padStart(3, ' ')} | ${row.join(' || ')}`);
  }
}
