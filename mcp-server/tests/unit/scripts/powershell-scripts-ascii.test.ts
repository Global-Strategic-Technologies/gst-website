/**
 * Guard for the operator-facing `.ps1` scripts.
 *
 * Every one of these is run by a human, on Windows, following a runbook. The
 * shell that ships with Windows is **Windows PowerShell 5.1**, and 5.1 reads a
 * script file with no byte-order mark using the ANSI code page rather than
 * UTF-8. A non-ASCII character therefore arrives as mojibake, and when one of
 * those bytes happens to land on a quote character the parser loses string
 * parity and the whole file fails to parse — reported as a wall of "missing
 * closing '}'" errors pointing at lines that are perfectly correct.
 *
 * That is not hypothetical. On 2026-09-09 an operator ran
 * `Probe-DashboardSql.ps1` and got seven parse errors. Investigation found
 * **five of the six** tracked scripts failed to parse under 5.1, including
 * `Verify-AeEmission.ps1`, which GRAFANA.md instructs operators to run. Every
 * one of them parsed cleanly under pwsh 7, which is why it went unnoticed:
 * the shell an agent uses is not the shell the operator uses.
 *
 * Two rules, because they fail differently:
 *   1. ASCII only — kills the encoding trap at the source, and unlike adding a
 *      BOM it survives an editor or a tool that rewrites the file.
 *   2. No PowerShell 7-only syntax — `??`, `?.`, ternary and the `&&`/`||`
 *      pipeline chain operators are all parse errors in 5.1. A script that
 *      genuinely needs 7 should say so with `#Requires -Version 7`, which
 *      fails with one clear line instead of a parse-error wall.
 *
 * This does not execute the scripts; it checks the two properties that break
 * them before a single line runs.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

const SCRIPTS_DIR = resolve(__dirname, '../../../scripts');

const scripts = readdirSync(SCRIPTS_DIR)
  .filter((f) => f.toLowerCase().endsWith('.ps1'))
  .map((f) => ({ name: f, text: readFileSync(resolve(SCRIPTS_DIR, f), 'utf-8') }));

/** Characters that keep sneaking in from prose. Suggested ASCII stand-ins. */
const SUBSTITUTIONS: Record<string, string> = {
  '—': '-',
  '–': '-',
  '─': '-',
  '→': '->',
  '…': '...',
  '§': 'section',
  '×': 'x',
  '±': '+/-',
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
};

describe('operator .ps1 scripts — parseable by the shell operators actually have', () => {
  it('finds the scripts at all', () => {
    // Vacuity floor: every rule below iterates `scripts`, so a moved directory
    // would leave this file green while checking nothing.
    expect(scripts.length, `no .ps1 files found under ${SCRIPTS_DIR}`).toBeGreaterThan(0);
  });

  it('contains no non-ASCII characters', () => {
    for (const { name, text } of scripts) {
      const offenders = new Map<string, number>();
      for (const ch of text) {
        if (ch.charCodeAt(0) > 127) offenders.set(ch, (offenders.get(ch) ?? 0) + 1);
      }
      const detail = [...offenders.entries()]
        .map(([ch, n]) => {
          const cp = `U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
          const fix = SUBSTITUTIONS[ch];
          return `${cp} x${n}${fix ? ` (use "${fix}")` : ''}`;
        })
        .join(', ');
      expect(
        offenders.size,
        `${name} contains non-ASCII characters, which Windows PowerShell 5.1 mis-decodes into a parse error for the whole file: ${detail}`
      ).toBe(0);
    }
  });

  it('uses no PowerShell 7-only syntax without declaring #Requires -Version 7', () => {
    // Each pattern is a construct 5.1's PARSER rejects outright, so the script
    // dies before its first statement — there is no graceful degradation to
    // rely on. Comments are stripped first so prose about an operator cannot
    // trip the check.
    const SEVEN_ONLY: [RegExp, string][] = [
      [/\?\?=?/, 'null-coalescing ?? / ??='],
      // Any expression can be the target, not just a bare `$var` — a property
      // chain or an indexer closes with `)`, `]` or `}`.
      [/[\w)\]}]\?\./, 'null-conditional ?.'],
      // Ternary. Deliberately requires whitespace on BOTH the `?` and the `:`,
      // which is what separates it from every other use of a colon in
      // PowerShell — a drive letter (`C:\`), a scheme (`https://`), a scope or
      // type qualifier (`$env:`, `[int]::`), and a named-argument colon all
      // lack the leading space. Checked against all six scripts for false
      // positives, because a guard that cries wolf trains you to ignore it.
      [/\s\?\s+\S[^\n]*?\s:\s/, 'ternary ? :'],
      [/(?<![|&])&&(?![|&])/, 'pipeline chain &&'],
      [/(?<![|&])\|\|(?![|&])/, 'pipeline chain ||'],
    ];
    for (const { name, text } of scripts) {
      if (/^\s*#Requires\s+-Version\s+([7-9]|\d{2,})/im.test(text)) continue;
      const stripped = text
        .replace(/<#[\s\S]*?#>/g, '')
        .split('\n')
        .map((l) => l.replace(/#.*$/, ''))
        .join('\n');
      for (const [pattern, label] of SEVEN_ONLY) {
        expect(
          pattern.test(stripped),
          `${name} uses ${label}, which is a parse error in Windows PowerShell 5.1 — rewrite it, or declare "#Requires -Version 7" so it fails with one clear line instead`
        ).toBe(false);
      }
    }
  });
});
