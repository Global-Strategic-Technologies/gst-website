import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { stripComments, walkStyleSources } from '../integration/helpers/css-parse';

/**
 * A scoped rule must not target a class that the same file only passes to a
 * child component (BL-150).
 *
 * Astro scopes by attribute. A rule in `Parent.astro` compiles to
 * `.x[data-astro-cid-PARENT]`, but `<DeltaIcon class="x" />` renders its `<svg>`
 * with DeltaIcon's cid, so the rule matches nothing. There is no error and no
 * warning: the element just keeps the global base. Nine declaration blocks
 * across five pages shipped this way, including three `opacity` treatments that
 * never rendered. Two of those files already had a correct
 * `:global(.bullet-icon)` rule a screen away, so the knowledge did not
 * generalise, and a guard does. See STYLES_GUIDE § "The scoped-rule /
 * foreign-element trap".
 *
 * THE RULE is per usage, not per file. A scoped selector fails when its
 * rightmost compound carries a class that ANY component invocation in the file
 * receives, unless that compound sits inside `:global()`. A native element with
 * the same class in the same file does not exempt it, because
 * `diligence-machine` and `BrandUILibrary` put `bullet-icon` on native `<svg>`s
 * AND on `<DeltaIcon>`s, and a per-file exemption would hide a dead rule aimed
 * at the latter.
 *
 * THE ESCAPE, for a rule genuinely aimed at the native element in a mixed file,
 * is a type selector in the rightmost compound (`svg.bullet-icon`). A component
 * invocation is never matched by an element-type selector, so the rule is
 * unambiguous. No rule in the repo relies on this today; it exists so the
 * correct fix for a future mixed file is not an allowlist.
 *
 * A component that spreads its received attributes onto a NATIVE element
 * (`<span {...Astro.props}>`) does pass the parent's cid through, so a bare rule
 * reaches it. Classes passed to such a component are not counted. A spread onto
 * another component (`<Inner {...rest} />`) does not count as forwarding: that
 * only moves the problem one level down.
 *
 * KNOWN GAPS (uncaught, not guessed at):
 *  - a class computed at runtime (`class={cls}`), or an interpolated template
 *    literal (`class={`bullet-icon ${x}`}`)
 *  - a class passed via a spread at the call site (`<Foo {...attrs} />`)
 *  - only the first `class:list` attribute on a tag is read
 *  - `is:global` style blocks, which are unscoped and cannot fall into the trap
 *
 * SECOND RULE — the element the file never renders. A scoped rule whose
 * rightmost compound names no class that appears anywhere in the file's
 * frontmatter, template or scripts (a plain text search) targets markup some
 * other file renders — a child component, the layout, another module's
 * `innerHTML` — or markup that does not exist at all. Either way no element
 * carries the cid. Its first run found the tool pages' print rules for
 * `.print-report-header*` (PrintReportHeader's markup), `.breadcrumb` /
 * `.hub-header` (BaseLayout's / HubHeader's), the non-existent
 * `.hub-header__back`, the script-built `.no-results-message`, and eleven more.
 * A BEM modifier `block--mod` counts as present when `block` is, and one
 * present class vouches for the rest of its compound, because another module
 * toggling a state class onto this file's element is legitimate.
 *
 * KNOWN GAPS of the second rule (uncaught, not guessed at):
 *  - a text search, not a render: a class named ONLY in the file's own
 *    `createElement` / `innerHTML` code counts as present, yet that element is
 *    unscoped too (no cid), so its scoped rule is just as dead
 *  - a class mentioned only in a comment, an unrelated string or a
 *    querySelector counts as present
 *  - a class assembled at runtime (`'tp-' + x`) is not recognised, so a rule for
 *    it would be flagged (none today; wrap it in `:global()`)
 */

export interface Finding {
  selector: string;
  cls: string;
}

/** Remove every balanced `name(...)` group, e.g. all `:global(...)` occurrences. */
const removeGroups = (s: string, name: string): string => {
  let out = s;
  for (let i = out.indexOf(name); i !== -1; i = out.indexOf(name)) {
    let depth = 0;
    let j = i + name.length - 1;
    for (; j < out.length; j++) {
      if (out[j] === '(') depth++;
      else if (out[j] === ')' && --depth === 0) break;
    }
    out = out.slice(0, i) + ' ' + out.slice(j + 1);
  }
  return out;
};

/** Split on a delimiter only at parenthesis depth 0. */
const splitTop = (s: string, delim: RegExp): string[] => {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth === 0 && delim.test(ch)) {
      out.push(buf);
      buf = '';
    } else buf += ch;
  }
  out.push(buf);
  return out;
};

/** Every rule selector in a CSS text, at-rule preludes and keyframe steps excluded. */
export const ruleSelectors = (css: string): string[] => {
  const out: string[] = [];
  for (const m of stripComments(css).matchAll(/([^{};]+)\{/g)) {
    const prelude = m[1].trim();
    if (
      !prelude ||
      prelude.startsWith('@') ||
      /^(from|to|[\d.]+%)(\s*,\s*(from|to|[\d.]+%))*$/.test(prelude)
    )
      continue;
    for (const sel of splitTop(prelude, /,/)) if (sel.trim()) out.push(sel.trim());
  }
  return out;
};

/** Selectors whose rightmost compound targets one of `componentClasses` from a scoped block. */
export const findForeignTargets = (css: string, componentClasses: Set<string>): Finding[] => {
  const findings: Finding[] = [];
  for (const selector of ruleSelectors(css)) {
    const compounds = splitTop(selector.replace(/\s*([>+~])\s*/g, ' '), /\s/).filter(Boolean);
    const last = compounds[compounds.length - 1];
    if (!last || last.startsWith(':global(')) continue; // anchored :global() — the correct form
    const bare = removeGroups(removeGroups(last, ':not('), ':global(');
    if (/^[a-z][a-z0-9-]*/i.test(bare)) continue; // type selector: the native-element escape
    for (const m of removeGroups(removeGroups(bare, ':is('), ':where(').matchAll(/\.([\w-]+)/g)) {
      if (componentClasses.has(m[1])) findings.push({ selector, cls: m[1] });
    }
  }
  return findings;
};

/** Classes in a selector's rightmost compound, `:not()`/`:is()`/`:where()`/`:global()` excluded. */
const rightmostClasses = (selector: string): string[] => {
  const compounds = splitTop(selector.replace(/\s*([>+~])\s*/g, ' '), /\s/).filter(Boolean);
  const last = compounds[compounds.length - 1];
  if (!last || last.startsWith(':global(')) return [];
  let bare = last;
  for (const g of [':not(', ':is(', ':where(', ':has(', ':global(']) bare = removeGroups(bare, g);
  return [...bare.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
};

/**
 * Selectors whose rightmost compound targets an element this file never
 * renders: NONE of the compound's classes appears in `markupAndScripts` (the
 * file's frontmatter, template and scripts). Such an element can only reach the
 * page through some other file's markup (a child component's, a layout's,
 * another module's `innerHTML`) or not at all, and none of those carry this
 * file's cid.
 *
 * One present class is enough, and a BEM modifier `block--mod` counts as
 * present when its `block` is: the element is then rendered here and carries
 * the cid, and the remaining classes are runtime states that another module
 * may legitimately toggle (`.palette-panel.is-open` from palette-manager.ts,
 * `.tp-deep-wrap--on` from techpar/dom.ts).
 */
export const findUnreferencedTargets = (css: string, markupAndScripts: string): Finding[] => {
  const mentioned = (cls: string): boolean =>
    new RegExp(`(?<![\\w-])${cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(
      markupAndScripts
    );
  const present = (cls: string): boolean =>
    mentioned(cls) || (cls.includes('--') && mentioned(cls.slice(0, cls.indexOf('--'))));
  const findings: Finding[] = [];
  for (const selector of ruleSelectors(css)) {
    const classes = rightmostClasses(selector);
    if (classes.length && !classes.some(present)) findings.push({ selector, cls: classes[0] });
  }
  return findings;
};

/**
 * A `<style>` block opens at the start of a line. Anchoring matters: a comment
 * that mentions "`<style>` rules" (the IRL generator's script, the radar and
 * PrintReportHeader docblocks) otherwise opens a match that runs to the real
 * block's `</style>`, swallowing every line of script or markup in between.
 */
const STYLE_BLOCK = /^[ \t]*<style\b([^>/]*)>([\s\S]*?)<\/style>/gm;

/** Split an Astro file into frontmatter, scoped style text, and template markup. */
const splitAstro = (source: string) => {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  const frontmatter = fm ? fm[1] : '';
  const rest = fm ? source.slice(fm[0].length) : source;
  const styles: string[] = [];
  for (const m of rest.matchAll(STYLE_BLOCK)) {
    if (!/\bis:global\b/.test(m[1])) styles.push(m[2]);
  }
  // Self-closing tags first. `<script is:inline set:html={…} />` otherwise opens
  // a match that runs to the NEXT `</script>`, silently deleting all the markup
  // between — which hid HubMcpPage's whole icon catalog from the scan.
  const template = rest
    .replace(/<(script|style)\b[^>]*\/>/g, '')
    .replace(STYLE_BLOCK, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  // Everything that can put a class on an element this file renders:
  // frontmatter, template and scripts — i.e. the file minus its style blocks.
  const markupAndScripts = source
    .replace(/<style\b[^>]*\/>/g, '')
    .replace(STYLE_BLOCK, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  return { frontmatter, styles: styles.join('\n'), template, markupAndScripts };
};

/** Scan component tags with brace/quote tracking, since attribute expressions contain `>`. */
const componentTags = (template: string): { name: string; attrs: string }[] => {
  const tags: { name: string; attrs: string }[] = [];
  const re = /<([A-Z][\w.]*)/g;
  for (let m = re.exec(template); m; m = re.exec(template)) {
    let depth = 0;
    let quote = '';
    let i = m.index + m[0].length;
    for (; i < template.length; i++) {
      const ch = template[i];
      if (quote) {
        if (ch === quote) quote = '';
      } else if (ch === '"' || ch === "'" || ch === '`') quote = ch;
      else if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0) break;
    }
    tags.push({ name: m[1], attrs: template.slice(m.index + m[0].length, i) });
  }
  return tags;
};

/** Static class names in a tag's `class="…"`, `class={'…'}` or `class:list={[…]}` attributes. */
export const staticClasses = (attrs: string): string[] => {
  const out: string[] = [];
  const add = (s: string) => out.push(...s.split(/\s+/).filter((c) => /^[\w-]+$/.test(c)));
  for (const m of attrs.matchAll(
    /(?:^|\s)class=(?:"([^"]*)"|'([^']*)'|\{\s*['"`]([^'"`$]*)['"`]\s*\})/g
  ))
    add(m[1] ?? m[2] ?? m[3] ?? '');
  // Brace-balanced: a `class:list` array routinely nests `{ active: flag }`
  // objects, so the first `}` is not the end of the attribute.
  const start = attrs.indexOf('class:list={');
  if (start !== -1) {
    let depth = 0;
    let end = start + 'class:list='.length;
    for (; end < attrs.length; end++) {
      if (attrs[end] === '{') depth++;
      else if (attrs[end] === '}' && --depth === 0) break;
    }
    const body = attrs.slice(start, end);
    for (const m of body.matchAll(/['"`]([\w\s-]+)['"`]/g)) add(m[1]);
  }
  return out;
};

/** True when a component source forwards received attributes onto its markup. */
const forwardsAttributes = (componentSource: string): boolean =>
  /<[a-z][\w-]*\b[^>]*\{\s*\.\.\.\s*(Astro\.props|rest|attrs|props|others)\s*\}/.test(
    componentSource
  );

const importMap = (frontmatter: string, fileDir: string): Map<string, string> => {
  const map = new Map<string, string>();
  for (const m of frontmatter.matchAll(/import\s+(\w+)\s+from\s+['"]([^'"]+\.astro)['"]/g)) {
    map.set(m[1], resolve(fileDir, m[2]));
  }
  return map;
};

/** Findings for one Astro file; `readComponent` resolves an import to its source (or null). */
export const scanAstro = (
  source: string,
  readComponent: (name: string) => string | null = () => null
): Finding[] => {
  const { styles, template } = splitAstro(source);
  if (!styles.trim()) return [];
  const componentClasses = new Set<string>();
  for (const tag of componentTags(template)) {
    const child = readComponent(tag.name);
    if (child && forwardsAttributes(child)) continue;
    for (const c of staticClasses(tag.attrs)) componentClasses.add(c);
  }
  return componentClasses.size ? findForeignTargets(styles, componentClasses) : [];
};

/** Scoped rules in one Astro file whose rightmost class the file never renders or scripts. */
export const scanAstroUnreferenced = (source: string): Finding[] => {
  const { styles, markupAndScripts } = splitAstro(source);
  return styles.trim() ? findUnreferencedTargets(styles, markupAndScripts) : [];
};

const astroFile = (template: string, css: string): string =>
  `---\nimport DeltaIcon from './DeltaIcon.astro';\n---\n${template}\n<style>\n${css}\n</style>\n`;

describe('scoped rules do not target a class only a child component receives', () => {
  const icon = '<li><DeltaIcon class="bullet-icon" /><span>x</span></li>';

  it.each([
    ['services base', '.service-list .bullet-icon { opacity: 0.7; }'],
    ['services ≤480', '@media (max-width: 480px) { .service-list .bullet-icon { width: 12px; } }'],
    ['booking steps', '.confirmation-steps li .bullet-icon { margin-top: 0.35em; }'],
    ['hub/mcp bare', '.bullet-icon { margin-top: 0.35em; }'],
    ['vdr base', '.bullet-icon { opacity: 0.8; }'],
    ['vdr ≤480', '@media (max-width: 480px) { .bullet-icon { margin-top: 0.3em; } }'],
    ['business-architectures bare', '.bullet-icon { opacity: 0.8; }'],
    ['business-architectures diligence', '.arch-diligence-list .bullet-icon { opacity: 0.5; }'],
  ])('flags the pre-fix %s block', (_label, css) => {
    expect(scanAstro(astroFile(icon, css)).map((f) => f.cls)).toEqual(['bullet-icon']);
  });

  it('flags the pre-fix booking-confirmed .delta-accent block', () => {
    const src = astroFile(
      '<DeltaIcon size={48} class="delta-accent" />',
      '.delta-accent { color: red; }'
    );
    expect(scanAstro(src).map((f) => f.cls)).toEqual(['delta-accent']);
  });

  it('accepts a :global() anchored to a scoped ancestor', () => {
    const css = '.vdr-section-heading :global(.bullet-icon) { margin-top: 0; }';
    expect(scanAstro(astroFile(icon, css))).toEqual([]);
  });

  it('flags a bare rule in a file that also uses the class on a native element', () => {
    const mixed = `${icon}<svg class="bullet-icon"></svg>`;
    expect(scanAstro(astroFile(mixed, '.bullet-icon { opacity: 0.5; }'))).toHaveLength(1);
  });

  it('accepts a type selector aimed at the native element in a mixed file', () => {
    const mixed = `${icon}<svg class="bullet-icon"></svg>`;
    expect(scanAstro(astroFile(mixed, 'svg.bullet-icon { opacity: 0.5; }'))).toEqual([]);
  });

  it('reads class:list literals and survives `>` inside attribute expressions', () => {
    const tpl = '<Card onClick={() => a > b} class:list={["card-x", { on: flag }]} />';
    expect(scanAstro(astroFile(tpl, '.card-x { color: red; }')).map((f) => f.cls)).toEqual([
      'card-x',
    ]);
  });

  it('keeps scanning markup that follows a self-closing <script />', () => {
    // Regression: the self-closing JSON-LD tag at the top of HubMcpPage opened a
    // `<script>…</script>` match that swallowed the whole icon catalog below it.
    const tpl = [
      '<script is:inline type="application/ld+json" set:html={JSON.stringify(schema)} />',
      icon,
      '<script>console.log(1);</script>',
    ].join('\n');
    expect(
      scanAstro(astroFile(tpl, '.bullet-icon { margin-top: 0.35em; }')).map((f) => f.cls)
    ).toEqual(['bullet-icon']);
  });

  it('still counts classes passed to a component that only spreads onto another component', () => {
    // A spread onto a child COMPONENT moves the class one level down, where it
    // still lands on markup that does not carry this file's cid.
    const src = astroFile('<Pill class="pill-x" />', '.pill-x { color: red; }');
    expect(scanAstro(src, () => '<Inner {...Astro.props} />').map((f) => f.cls)).toEqual([
      'pill-x',
    ]);
  });

  it('does not count classes passed to a component that forwards its attributes', () => {
    const src = astroFile('<Pill class="pill-x" />', '.pill-x { color: red; }');
    expect(scanAstro(src, () => '<span {...Astro.props}><slot /></span>')).toEqual([]);
  });

  it('ignores native-only classes and keyframe steps', () => {
    const src = astroFile(
      '<p class="lead">x</p>',
      '.lead { color: red; } @keyframes f { from { opacity: 0; } 50% { opacity: 1; } }'
    );
    expect(scanAstro(src)).toEqual([]);
  });

  it('no .astro file in src styles a class it only passes to a child component', () => {
    const REPO = process.cwd();
    const abs: string[] = [];
    walkStyleSources(join(REPO, 'src'), abs);
    const astro = abs.filter((p) => p.endsWith('.astro'));
    // Guard the guard: an empty walk would make the assertion below vacuous.
    expect(astro.length, 'no .astro files scanned — the walk is broken').toBeGreaterThan(100);

    const offenders: string[] = [];
    for (const file of astro) {
      const source = readFileSync(file, 'utf-8');
      const imports = importMap(splitAstro(source).frontmatter, dirname(file));
      const read = (name: string) => {
        const p = imports.get(name);
        return p && existsSync(p) ? readFileSync(p, 'utf-8') : null;
      };
      for (const f of scanAstro(source, read)) {
        offenders.push(
          `${relative(REPO, file).split('\\').join('/')}: \`${f.selector}\` (.${f.cls})`
        );
      }
    }
    expect(
      offenders,
      `these scoped selectors target a class the file only passes to a child component, so they match nothing — anchor with \`<ancestor> :global(.cls)\`, use a type selector for a native element, or delete:\n  ${offenders.join('\n  ')}`
    ).toEqual([]);
  });
});

describe('scoped rules do not target a class the file never renders', () => {
  const page = (template: string, css: string, script = ''): string =>
    `---\nimport PrintReportHeader from './PrintReportHeader.astro';\n---\n${template}\n${script}\n<style>\n${css}\n</style>\n`;

  it('flags a scoped rule for a class only a child component renders (the print-report-header case)', () => {
    const src = page('<PrintReportHeader title="x" />', '.print-report-header { display: none; }');
    expect(scanAstroUnreferenced(src).map((f) => f.cls)).toEqual(['print-report-header']);
  });

  it('flags a class that exists nowhere (the techpar .hub-header__back case)', () => {
    const src = page(
      '<main class="tool"></main>',
      '@media print { .hub-header__back { display: none; } }'
    );
    expect(scanAstroUnreferenced(src).map((f) => f.cls)).toEqual(['hub-header__back']);
  });

  it('reads only the rightmost compound, and one rendered class vouches for its state classes', () => {
    const src = page(
      '<div class="grid"></div>',
      '.gone .grid { gap: 0; } .grid.is-open { gap: 1px; } .ghost.is-open { gap: 2px; }'
    );
    expect(scanAstroUnreferenced(src).map((f) => f.selector)).toEqual(['.ghost.is-open']);
  });

  it('treats a BEM modifier as rendered when its block is (toggled by another module)', () => {
    const src = page(
      '<div class="grid"></div>',
      '.grid--wide { gap: 0; } .ghost--wide { gap: 0; }'
    );
    expect(scanAstroUnreferenced(src).map((f) => f.selector)).toEqual(['.ghost--wide']);
  });

  it('counts a class the file adds from its own script', () => {
    const src = page(
      '<div class="grid"></div>',
      '.is-open { gap: 1px; }',
      "<script>document.querySelector('.grid')?.classList.add('is-open');</script>"
    );
    expect(scanAstroUnreferenced(src)).toEqual([]);
  });

  it('accepts a :global() rightmost compound and ignores :not() arguments', () => {
    const src = page(
      '<nav class="bar"></nav>',
      '.bar :global(.breadcrumb) { display: none; } .bar:not(.elsewhere) { color: red; }'
    );
    expect(scanAstroUnreferenced(src)).toEqual([]);
  });

  it('does not treat a longer class name as a mention of a shorter one', () => {
    const src = page('<div class="card-title"></div>', '.card { color: red; }');
    expect(scanAstroUnreferenced(src).map((f) => f.cls)).toEqual(['card']);
  });

  it('no .astro file in src has a scoped rule for a class it never renders or scripts', () => {
    const REPO = process.cwd();
    const abs: string[] = [];
    walkStyleSources(join(REPO, 'src'), abs);
    const astro = abs.filter((p) => p.endsWith('.astro'));
    expect(astro.length, 'no .astro files scanned — the walk is broken').toBeGreaterThan(100);

    const offenders: string[] = [];
    for (const file of astro) {
      for (const f of scanAstroUnreferenced(readFileSync(file, 'utf-8'))) {
        offenders.push(
          `${relative(REPO, file).split('\\').join('/')}: \`${f.selector}\` (.${f.cls})`
        );
      }
    }
    expect(
      offenders,
      `these scoped selectors target a class the file never renders, so they carry a cid no element has — delete the rule if it never applied (STYLES_GUIDE: render before reviving), move it to a src/styles/components/*.css module, or anchor with \`<ancestor> :global(.cls)\`:\n  ${offenders.join('\n  ')}`
    ).toEqual([]);
  });
});
