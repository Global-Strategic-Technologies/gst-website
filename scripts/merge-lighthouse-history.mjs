#!/usr/bin/env node
/**
 * Appends a new Lighthouse metrics snapshot to the cumulative history file.
 *
 * Usage: node merge-lighthouse-history.js <history-file> <new-snapshot-file>
 *
 * - Creates the history file (and parent directories) if it doesn't exist.
 * - Reads the new snapshot from the second argument.
 * - Appends the snapshot to the "runs" array and writes back.
 */
import fs from 'fs';
import path from 'path';

const [historyPath, snapshotPath] = process.argv.slice(2);
if (!historyPath || !snapshotPath) {
  console.error('Usage: node merge-lighthouse-history.js <history-file> <snapshot-file>');
  process.exit(1);
}

// Read or initialize history
let history = { version: 1, runs: [] };
if (fs.existsSync(historyPath)) {
  history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
}

// Read new snapshot
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

// Append
history.runs.push(snapshot);

// Write back
const dir = path.dirname(historyPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}
fs.writeFileSync(historyPath, JSON.stringify(history, null, 2) + '\n');

console.log(`Appended run ${history.runs.length} (${snapshot.timestamp}) to ${historyPath}`);
