/**
 * Claude Code PreToolUse hook — git-push gate (Implementation Review Gate).
 *
 * Fires on every Bash/PowerShell tool call; fast-exits 0 unless the command is
 * a real `git push`. On a push, requires a fresh impl-review marker written by
 * the code-reviewer agent (.claude/tasks/impl-review.json) whose recorded
 * headSha matches the repo's CURRENT HEAD — so yesterday's review cannot
 * approve today's unrelated commits, new commits after review force re-review,
 * and a failed push retries without burning the review (SHA-binding, no
 * consumption). Every ref the push names must resolve to that same commit, so
 * a review of this branch cannot approve `git push origin other-branch`.
 * Pushes wrapped in `bash -c`, `pwsh -Command`, `cmd /c` etc. are unwrapped
 * and gated too (see "Push detection" below for the shapes and known gaps).
 *
 * Exit semantics: exit 2 BLOCKS (stderr fed to Claude); exit 0 allows; any
 * other exit is NON-blocking (fail-open) — hence the $CLAUDE_PROJECT_DIR-
 * absolute command registration and the fail-closed error handling below.
 * See DEVELOPER_TOOLING.md § Claude Code review gates.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const MARKER_DIR = process.env.GST_HOOK_MARKER_DIR || resolve(SCRIPT_DIR, '..', 'tasks');
const MARKER = resolve(MARKER_DIR, 'impl-review.json');

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // loose belt; the SHA is the real check
const ALLOWED_VERDICTS = new Set(['APPROVE', 'USER_WAIVED']);

// ---------------------------------------------------------------------------
// Push detection.
//
// The command is read through a MASK: every quoted span (PowerShell
// here-strings, '…', "…") has its contents replaced by filler of the same
// length. Positions in the mask line up with the original, so structure is
// found in the mask (where quoted text can never look like a command — so
// `git commit -m "explain git push"` is not a push) and payloads/arguments
// are read from the original at the same positions.
//
// A push is found when, in some segment of the command or of a wrapped
// payload, `git` is in command position with `push` as its subcommand.
// Wrapped payloads are unwrapped recursively: `bash|sh|zsh|dash -c …` (any
// flag cluster containing c: -lc, -ec, …), `pwsh|powershell -Command …` and
// `-EncodedCommand <base64>`, `cmd /c|/k …`, `Invoke-Expression|iex …`.
//
// Known gaps (the gate stops accidental bypass, not a determined one): git
// aliases (`git -c alias.p=push p`), pushes run from a script file,
// `Start-Process git -ArgumentList …`, and escaped quotes inside a quoted
// span (`"a \" git push"`), which the mask does not model. In the other
// direction, an UNQUOTED-delimiter heredoc body (`<<EOF`) is read as
// commands, so prose in one that puts `git push` in command position is
// gated (use `<<'EOF'`, whose body is masked like a quoted string).
// ---------------------------------------------------------------------------

const QUOTED = /@'[\s\S]*?'@|'[^']*'|"[^"]*"/g;
// Separators between commands. Braces and parens split too, so the body of a
// PowerShell `& { git push }` script block or a `$(…)` substitution is in
// command position; a backtick splits for `…` substitution. `then` and `do`
// split only as whole shell words — `\bdo\b` would also split the branch name
// `do-other`, hiding its refspec from the ref check.
const SEPARATOR = /&&|\|\||[;&|\n{}()`]|(?<![^\s;&|])(?:then|do)(?![^\s;&|])/g;
// A line continuation (bash `\`, PowerShell backtick) joins two lines into one
// command; blank it (same length) so the split halves are read together.
const CONTINUATION = /\\\r?\n|`\r?\n/g;
// Things that may precede a command without changing what runs. A flag's
// value may not start with `-`, so each token is read one way only (an
// optional value that could itself be a flag backtracks exponentially).
const FLAG_VALUE = String.raw`(?:\s+-\w+(?:\s+[^-\s]\S*)?)*`;
const PREFIX = String.raw`(?:(?:command|exec|nohup|time)\s+|sudo${FLAG_VALUE}\s+|env(?:\s+-\w+)*\s+|xargs${FLAG_VALUE}\s+|\w+=\S*\s+)*`;
const EXE_DIR = String.raw`(?:[\w./\\:-]*[/\\])?`;
const PUSH = new RegExp(
  String.raw`^\s*${PREFIX}${EXE_DIR}git(?:\.exe)?\s+(?:-[cC]\s+\S+\s+|--[\w-]+(?:=\S+)?\s+)*push\b`
);
// PowerShell host flags. Only these take a value; every other flag is a
// switch, so a quoted command after `-NoProfile` is never read as its value.
const PWSH_FLAGS = String.raw`(?:-(?:ExecutionPolicy|ep|ex|WindowStyle|w|Version|v|OutputFormat|of|o|InputFormat|if|ConfigurationName|config|WorkingDirectory|wd|PSConsoleFile|Settings|settings|CustomPipeName)\s+[^-\s]\S*\s+|-(?!(?:Command|Com|Comm|Comma|Comman|c|EncodedCommand|enc|ec|e|File|f)\b)[\w-]+\s+)*`;
const PWSH = String.raw`^\s*${PREFIX}${EXE_DIR}(?:pwsh|powershell)(?:\.exe)?\s+${PWSH_FLAGS}`;
const WRAPPERS = [
  // bash -c / -lc / -ec …
  new RegExp(
    String.raw`^\s*${PREFIX}${EXE_DIR}(?:bash|sh|zsh|dash)(?:\.exe)?\s+(?:-[\w-]+\s+)*?-[a-zA-Z]*c[a-zA-Z]*\s+`
  ),
  // pwsh [-Command|-Com…|-c] … — -Command is the host's default positional
  // parameter, so `powershell "git push"` runs it too.
  new RegExp(String.raw`${PWSH}(?:-(?:Command|Com\w*|c)\s+)?(?=\S)`, 'i'),
  // cmd /c, /k
  new RegExp(String.raw`^\s*${EXE_DIR}cmd(?:\.exe)?\s+(?:\/\w+\s+)*?\/[ck]\s+`, 'i'),
  // Invoke-Expression / iex [-Command], and bash eval
  /^\s*(?:Invoke-Expression|iex)\s+(?:-Command\s+)?/i,
  /^\s*eval\s+/,
];
const ENCODED = new RegExp(
  String.raw`${PWSH}-(?:EncodedCommand|enc|ec|e)\s+([A-Za-z0-9+/=]+)`,
  'i'
);
// Exempt: nothing is sent.
const DRY_RUN = /(?:^|\s)(?:--dry-run|-n)(?=\s|$)/;

// A heredoc with a QUOTED delimiter (`<<'EOF'`, `<<"EOF"`) has a literal body:
// no expansion, no substitution — it is data, like a quoted string (a commit
// message written with `cat > msg <<'EOF'` routinely quotes `git push`). Its
// body is masked, unless the heredoc feeds a shell (`bash <<'EOF'`), whose
// body runs as commands. An unquoted delimiter's body can execute `$(…)` and
// backticks, so it stays visible.
const HEREDOC = /<<(-?)\s*(['"])(\w+)\2[^\n]*\n/g;
const SHELL_FED =
  /(?:^|[;&|(])\s*(?:\S*[/\\])?(?:bash|sh|zsh|dash|pwsh|powershell)(?:\.exe)?(?:\s+-\S+)*\s*$/i;

/** Same-length mask of quoted-delimiter heredoc bodies (newlines kept). */
function maskHeredocs(text) {
  let out = text;
  for (const m of text.matchAll(HEREDOC)) {
    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    if (SHELL_FED.test(text.slice(lineStart, m.index))) continue;
    const bodyStart = m.index + m[0].length;
    const end = new RegExp(`^${m[1] ? '\\t*' : ''}${m[3]}\\r?$`, 'm').exec(text.slice(bodyStart));
    const bodyEnd = end ? bodyStart + end.index : text.length;
    out =
      out.slice(0, bodyStart) +
      text.slice(bodyStart, bodyEnd).replace(/[^\n]/g, '_') +
      out.slice(bodyEnd);
  }
  return out;
}

/** Same-length mask: quoted contents become filler; quote characters stay. */
function maskQuotes(command) {
  return command.replace(QUOTED, (m) =>
    m.length <= 2 ? m : m[0] + '_'.repeat(m.length - 2) + m[m.length - 1]
  );
}

/** [start, end) ranges of the separated segments of `masked`. */
function segmentRanges(masked) {
  const ranges = [];
  let start = 0;
  for (const m of masked.matchAll(SEPARATOR)) {
    ranges.push([start, m.index]);
    start = m.index + m[0].length;
  }
  ranges.push([start, masked.length]);
  return ranges;
}

/** The text a wrapper runs: a quoted argument's contents, else the rest of the segment. */
function payloadAt(text, from) {
  const q = text[from];
  if (q === '"' || q === "'") {
    const close = text.indexOf(q, from + 1);
    return close === -1 ? text.slice(from + 1) : text.slice(from + 1, close);
  }
  return text.slice(from);
}

/**
 * The segments of `command` (and of every wrapped payload, recursively) that
 * are real `git push` calls, as ORIGINAL text with quotes intact.
 * Dry runs (`--dry-run`, `-n`) are exempt (harmless by definition).
 */
export function pushSegments(command, depth = 0) {
  if (typeof command !== 'string' || command.length === 0 || depth > 3) return [];
  const joined = command.replace(CONTINUATION, (m) => ' '.repeat(m.length));
  // A quoted path to the git executable is still git in command position.
  const text = joined.replace(QUOTED, (m) =>
    /^["']?(?:[^"']*[/\\])?git(?:\.exe)?["']?$/i.test(m) ? 'git' : m
  );
  // Heredoc bodies first, so an apostrophe in one cannot pair with a quote
  // outside it and hide a real command between them.
  const masked = maskQuotes(maskHeredocs(text));
  const found = [];
  for (const [start, end] of segmentRanges(masked)) {
    const seg = text.slice(start, end);
    const segMasked = masked.slice(start, end);
    // The dry-run flags count only after `push` (`xargs -n 1 git push` is real).
    const push = PUSH.exec(segMasked);
    if (push && !DRY_RUN.test(segMasked.slice(push[0].length))) found.push(seg);
    for (const wrapper of WRAPPERS) {
      const m = wrapper.exec(segMasked);
      if (m) found.push(...pushSegments(payloadAt(seg, m[0].length), depth + 1));
    }
    const enc = ENCODED.exec(segMasked);
    if (enc) {
      const decoded = Buffer.from(enc[1], 'base64').toString('utf16le');
      found.push(...pushSegments(decoded, depth + 1));
    }
  }
  return found;
}

/** Detect a real `git push` anywhere in a shell command string. */
export function isGitPush(command) {
  return pushSegments(command).length > 0;
}

/** Shell words of a segment, honouring '…' and "…". */
function shellWords(segment) {
  return [...segment.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
}

const VALUE_OPTIONS = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec']);
const UNBINDABLE = new Set(['--all', '--mirror', '--branches']);

/**
 * What a push segment sends: the source side of each refspec (`+src:dst`),
 * whether it pushes something a single review cannot bind to (--all,
 * --mirror, --branches), and nothing for deletions (`:dst`, --delete),
 * which carry no content. An empty `sources` means "the current branch".
 */
export function pushedSources(segment) {
  const words = shellWords(segment);
  const at = words.findIndex(
    (w, i) => w === 'push' && words.slice(0, i).some((p) => /(^|[/\\])git(\.exe)?$/i.test(p))
  );
  const positional = [];
  let unbindable = false;
  let deleting = false;
  for (let i = at + 1; i < words.length; i++) {
    const w = words[i];
    if (w === '--') {
      positional.push(...words.slice(i + 1));
      break;
    }
    if (w.startsWith('-')) {
      if (VALUE_OPTIONS.has(w)) i++;
      else if (UNBINDABLE.has(w)) unbindable = true;
      else if (w === '--delete' || w === '-d') deleting = true;
      continue;
    }
    positional.push(w);
  }
  const sources = [];
  if (!deleting) {
    const refspecs = positional.slice(1); // the first positional is the remote
    for (let i = 0; i < refspecs.length; i++) {
      if (refspecs[i] === 'tag') {
        i++; // `tag <name>` pushes a tag, as --tags does
        continue;
      }
      const src = refspecs[i].replace(/^\+/, '').split(':')[0];
      if (src) sources.push(src);
    }
  }
  return { sources, unbindable };
}

function block(reason) {
  process.stderr.write(
    `Implementation Review Gate: ${reason}\n` +
      `To proceed: invoke the code-reviewer agent on the current diff (it reviews against repo ` +
      `conventions, records the HEAD sha, and writes ${MARKER}). ` +
      `If (and only if) the user explicitly authorized pushing without review (e.g. a trivial ` +
      `docs-only diff), write the marker yourself with verdict "USER_WAIVED", the user's quoted ` +
      `waiver in a "waiver" field, and the current HEAD sha.\n`
  );
  process.exit(2);
}

// Only run the gate when executed as a hook (not when imported by tests).
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let payload = {};
  try {
    payload = JSON.parse(readFileSync(0, 'utf-8'));
  } catch {
    /* no/invalid stdin: not a recognizable tool call — stay inert */
  }

  const command = payload?.tool_input?.command ?? '';
  const pushes = pushSegments(command);
  if (pushes.length === 0) {
    process.exit(0); // fast path: not a push — inert for all other traffic
  }
  // From here on this IS a push, and an uncaught error would exit 1, which
  // does not block (fail open). Turn any unexpected error into a block.
  process.on('uncaughtException', (err) => block(`internal error (fail closed): ${err?.message}`));

  if (!existsSync(MARKER)) {
    block('no impl-review marker found — the diff has not been code-reviewed.');
  }

  let marker;
  try {
    marker = JSON.parse(readFileSync(MARKER, 'utf-8'));
  } catch {
    block('impl-review marker is unreadable/malformed JSON (fail closed).');
  }
  if (!marker || typeof marker !== 'object') {
    block('impl-review marker is not a JSON object (fail closed).');
  }

  if (!ALLOWED_VERDICTS.has(marker.verdict)) {
    block(`latest code-review verdict is "${marker.verdict}" — fix the findings and re-review.`);
  }

  const age = Date.now() - Date.parse(marker.reviewedAt ?? '');
  if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) {
    block('impl-review marker is stale or has an invalid timestamp — re-run the code-reviewer.');
  }

  // rev-parse runs in THIS repo, whatever `-C` or `cd` the command used —
  // a push from another repo is checked against this one (known gap).
  const revParse = (rev) =>
    execFileSync('git', ['rev-parse', '--verify', '--quiet', rev], {
      cwd: process.env.GST_HOOK_REPO_DIR || REPO_ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

  let head;
  try {
    head = revParse('HEAD');
  } catch {
    block('could not resolve current git HEAD (fail closed).');
  }

  if (marker.headSha !== head) {
    block(
      `impl-review marker was written for HEAD ${String(marker.headSha).slice(0, 12)} but current ` +
        `HEAD is ${head.slice(0, 12)} — new commits exist since the review; re-run the code-reviewer.`
    );
  }

  // The review covers HEAD. A push that names other refs must send HEAD's
  // commit and nothing else — `git push origin other-branch` would otherwise
  // pass on a review of the current branch.
  for (const segment of pushes) {
    const { sources, unbindable } = pushedSources(segment);
    if (unbindable) {
      block(
        '--all / --mirror / --branches push refs a single review cannot cover — push the ' +
          'reviewed branch by name.'
      );
    }
    for (const src of sources) {
      let sha;
      try {
        sha = revParse(`${src}^{commit}`);
      } catch {
        block(`could not resolve pushed ref "${src}" (fail closed).`);
      }
      if (sha !== marker.headSha) {
        block(
          `the push sends "${src}" (${sha.slice(0, 12)}), which is not the reviewed HEAD ` +
            `${String(marker.headSha).slice(0, 12)} — review that ref, or push the reviewed branch.`
        );
      }
    }
  }

  process.exit(0);
}
