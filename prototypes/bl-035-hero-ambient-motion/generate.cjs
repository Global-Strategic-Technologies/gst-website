const fs = require('fs');
const path = require('path');
const prettier = require('prettier');
const root = __dirname;
fs.mkdirSync(path.join(root, 'project'), { recursive: true });

const W = 1280,
  H = 720;

const base = `
body{margin:0}
.stage{position:relative;width:${W}px;height:${H}px;overflow:hidden;box-sizing:border-box;
  --bg:var(--bg-light,#ffffff);--bg-alt:var(--bg-light-alt,#f5f5f5);--ink:var(--text-primary,#1a1a1a);--ink-2:var(--text-secondary,#1a1a1ab3);
  --line:rgba(0,0,0,.032);
  font-family:var(--font-family-mono,ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace);
  background-color:var(--bg);
  background-image:
    linear-gradient(0deg,transparent 24%,var(--line) 25%,var(--line) 26%,transparent 27%,transparent 74%,var(--line) 75%,var(--line) 76%,transparent 77%,transparent),
    linear-gradient(90deg,transparent 24%,var(--line) 25%,var(--line) 26%,transparent 27%,transparent 74%,var(--line) 75%,var(--line) 76%,transparent 77%,transparent);
  background-size:50px 50px;background-position:0 0,25px 25px;color:var(--ink)}
.stage.dark{--bg:var(--bg-dark,#0a0a0a);--bg-alt:var(--bg-dark-tertiary,#141414);--ink:var(--text-dark-primary,#f5f5f5f2);--ink-2:var(--text-dark-secondary,#c8c8c8cc);--line:rgba(255,255,255,.032)}
.band{position:absolute;inset:0;background:linear-gradient(180deg,transparent 0%,var(--bg-alt) 15%,var(--bg-alt) 85%,transparent 100%)}
.fx{position:absolute;inset:0;pointer-events:none;overflow:hidden;opacity:var(--fxo,1)}
.off .fx *{animation:none !important}
.content{position:relative;z-index:1;box-sizing:border-box;height:100%;padding:88px 96px;display:flex;flex-direction:column;justify-content:center;gap:56px}
.title{margin:0;font-size:96px;font-weight:900;line-height:.95;letter-spacing:-.04em;text-transform:uppercase;color:var(--ink)}
.title span{display:block}
.title .hl{color:var(--fx)}
.row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:64px;align-items:end}
.desc{margin:0;font-size:20px;line-height:1.5;color:var(--ink-2);max-width:640px}
.actions{display:flex;flex-direction:column;gap:16px;align-items:flex-end}
.ctas{display:flex;gap:16px}
.cta{display:inline-flex;align-items:center;min-height:44px;padding:0 24px;border:2px solid var(--fx);color:var(--ink);text-decoration:none;font-weight:700;font-size:15px;text-transform:uppercase;letter-spacing:.04em;background:color-mix(in srgb,var(--fx) 8%,transparent);backdrop-filter:blur(2px)}
.cta:hover{background:color-mix(in srgb,var(--fx) 20%,transparent)}
.trust{margin:0;font-size:13px;color:var(--ink-2)}
.controls{position:absolute;top:24px;right:24px;z-index:2;display:flex;align-items:center;gap:12px}
.slider-box{display:flex;align-items:center;gap:12px;min-height:44px;padding:0 18px;border:2px solid var(--fx);background:color-mix(in srgb,var(--fx) 8%,transparent);backdrop-filter:blur(2px)}
.slider-box label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--ink)}
.slider-box input[type=range]{width:140px;accent-color:var(--fx);cursor:pointer}
.slider-val{font-size:12px;font-weight:700;color:var(--ink-2);min-width:38px;text-align:right}
.theme-toggle{display:inline-flex;align-items:center;gap:10px;min-height:44px;padding:0 20px;
  border:2px solid var(--fx);background:color-mix(in srgb,var(--fx) 8%,transparent);backdrop-filter:blur(2px);
  color:var(--ink);font-family:inherit;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;cursor:pointer}
.theme-toggle:hover{background:color-mix(in srgb,var(--fx) 20%,transparent)}
.theme-toggle svg{display:block}
`;

const hero = (
  fxMarkup
) => `<div class="stage {{themeCls}} {{motionCls}}" style="--fx: {{accent}}; --fxo: {{fxo}};">
<div class="band"></div>
<div class="fx" aria-hidden="true">
${fxMarkup}
</div>
<div class="controls">
<div class="slider-box">
<label for="fx-strength">Effect</label>
<input id="fx-strength" type="range" min="0" max="100" step="1" value="{{strength}}" onChange="{{setStrength}}" onInput="{{setStrength}}">
<span class="slider-val">{{strengthLabel}}</span>
</div>
<button type="button" class="theme-toggle" onClick="{{toggleTheme}}" aria-pressed="{{isDark}}">
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path></svg>
{{themeLabel}}
</button>
</div>
<section class="content" aria-label="Page introduction">
<h1 class="title"><span>Technology Advisory</span><span class="hl">&amp; Execution</span></h1>
<div class="row">
<p class="desc">Global Strategic Technologies helps technology-focused investors, founders, and executives scale with confidence to create value, manage risks, and accelerate their business.</p>
<div class="actions">
<div class="ctas">
<a class="cta" href="#">Schedule an Intro Call</a>
<a class="cta" href="#">View Advisory Services</a>
</div>
<p class="trust">Vendor-neutral. Executive-ready outputs. Built for high-stakes decisions.</p>
</div>
</div>
</section>
</div>`;

// Each effect: <=15 animated elements, transform/opacity only, CSS keyframes, no JS loops.

// ---- 01 Grid Pulse ----
const gridCss = `
.cell{position:absolute;width:50px;height:50px;background:var(--fx);opacity:0;animation:cellpulse 9s ease-in-out infinite}
@keyframes cellpulse{0%,100%{opacity:0}45%{opacity:.09}55%{opacity:.09}}`;
const gridFx = (cells) =>
  cells
    .map(
      ([c, r, d]) =>
        `<div class="cell" style="left: ${c * 50 + 25}px; top: ${r * 50 + 25}px; animation-delay: ${d}s;"></div>`
    )
    .join('\n');
const GRID_ALL = [
  [1, 2, 0],
  [3, 1, 1.2],
  [5, 4, 2.4],
  [8, 2, 3.1],
  [10, 6, 0.6],
  [12, 3, 4.2],
  [14, 8, 1.8],
  [17, 1, 5.1],
  [19, 5, 2.9],
  [21, 10, 6.3],
  [23, 3, 3.7],
  [6, 11, 7.2],
  [15, 12, 4.8],
  [2, 9, 5.8],
];

// ---- 02 Ambient Glow Shift ----
const glowCss = `
.glow{position:absolute;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--fx) 22%,transparent) 0%,transparent 65%);will-change:transform}
.g1{width:900px;height:900px;left:-200px;top:-300px;animation:drift1 38s ease-in-out infinite alternate}
.g2{width:700px;height:700px;right:-160px;bottom:-320px;opacity:.8;animation:drift2 46s ease-in-out infinite alternate}
@keyframes drift1{from{transform:translate(0,0) scale(1)}to{transform:translate(420px,160px) scale(1.15)}}
@keyframes drift2{from{transform:translate(0,0) scale(1.1)}to{transform:translate(-380px,-120px) scale(.95)}}`;
const glowFx = `<div class="glow g1"></div>\n<div class="glow g2"></div>`;

// ---- 03 Scan Sweep ----
const scanCss = `
.scan{position:absolute;left:0;right:0;top:0;height:140px;background:linear-gradient(180deg,transparent 0%,color-mix(in srgb,var(--fx) 7%,transparent) 85%,color-mix(in srgb,var(--fx) 35%,transparent) 99%,transparent 100%);transform:translateY(-160px);animation:scan 16s linear infinite}
/* Decelerating fall: big early steps, tiny late ones — and fading as it slows. */
@keyframes scan{
0%{transform:translateY(-160px);opacity:1}
10%{transform:translateY(120px);opacity:.95}
20%{transform:translateY(330px);opacity:.8}
30%{transform:translateY(480px);opacity:.62}
40%{transform:translateY(585px);opacity:.45}
50%{transform:translateY(655px);opacity:.3}
60%{transform:translateY(700px);opacity:.17}
70%{transform:translateY(726px);opacity:.07}
78%,100%{transform:translateY(740px);opacity:0}}`;
const scanFx = `<div class="scan"></div>`;

// ---- 04 Data Rails: four directions, each mark firing once then going dark ----
const railCss = `
.rail{position:absolute}
.rail.v{top:0;bottom:0}
.rail.h{left:0;right:0}
.pkt{position:absolute;opacity:0;animation-timing-function:linear;animation-iteration-count:infinite}
.pkt.up{left:0;top:0;background:linear-gradient(180deg,transparent,var(--fx));animation-name:pk-up}
.pkt.down{left:0;top:0;background:linear-gradient(0deg,transparent,var(--fx));animation-name:pk-down}
.pkt.right{top:0;left:0;background:linear-gradient(90deg,transparent,var(--fx));animation-name:pk-right}
.pkt.left{top:0;left:0;background:linear-gradient(270deg,transparent,var(--fx));animation-name:pk-left}
@keyframes pk-up{
0%{transform:translateY(${H + 80}px);opacity:0}6%{opacity:var(--pk)}34%{opacity:var(--pk)}
52%{opacity:calc(var(--pk) * .35)}64%,100%{transform:translateY(-160px);opacity:0}}
@keyframes pk-down{
0%{transform:translateY(-160px);opacity:0}6%{opacity:var(--pk)}34%{opacity:var(--pk)}
52%{opacity:calc(var(--pk) * .35)}64%,100%{transform:translateY(${H + 80}px);opacity:0}}
@keyframes pk-right{
0%{transform:translateX(-220px);opacity:0}6%{opacity:var(--pk)}34%{opacity:var(--pk)}
52%{opacity:calc(var(--pk) * .35)}64%,100%{transform:translateX(${W + 60}px);opacity:0}}
@keyframes pk-left{
0%{transform:translateX(${W + 60}px);opacity:0}6%{opacity:var(--pk)}34%{opacity:var(--pk)}
52%{opacity:calc(var(--pk) * .35)}64%,100%{transform:translateX(-220px);opacity:0}}`;
// dir, position across the stage, rail thickness, rail tint %, mark length, mark thickness, peak opacity, duration, delay
const railFx = (rails) =>
  rails
    .map(([dir, pos, rw, tint, len, thick, op, dur, d]) => {
      const vertical = dir === 'up' || dir === 'down';
      const railStyle = vertical
        ? `left: ${pos}px; width: ${rw}px;`
        : `top: ${pos}px; height: ${rw}px;`;
      const pktStyle = vertical
        ? `width: ${thick}px; height: ${len}px;`
        : `height: ${thick}px; width: ${len}px;`;
      return `<div class="rail ${vertical ? 'v' : 'h'}" style="${railStyle} background: color-mix(in srgb, var(--fx) ${tint}%, transparent);"><div class="pkt ${dir}" style="--pk: ${op}; ${pktStyle} animation-duration: ${dur}s; animation-delay: -${d}s;"></div></div>`;
    })
    .join('\n');
const RAILS_ALL = [
  ['up', 75, 1, 10, 48, 3, 0.5, 11, 0],
  ['down', 225, 2, 6, 96, 2, 0.28, 19, 7],
  ['up', 375, 1, 14, 34, 5, 0.62, 8.5, 3],
  ['down', 525, 1, 4, 140, 1, 0.2, 26, 12],
  ['up', 675, 3, 9, 62, 4, 0.44, 13.5, 5.5],
  ['down', 925, 2, 12, 110, 6, 0.24, 22, 2],
  ['up', 1075, 1, 5, 44, 3, 0.38, 15.5, 9],
  ['down', 1225, 2, 16, 72, 2, 0.6, 7.5, 13],
  ['right', 125, 1, 8, 120, 3, 0.42, 14, 4],
  ['left', 275, 2, 5, 220, 2, 0.22, 24, 11],
  ['right', 425, 1, 12, 70, 4, 0.55, 9, 17],
  ['left', 575, 1, 6, 160, 1, 0.3, 20, 6],
  ['right', 625, 2, 9, 95, 5, 0.35, 12, 21],
  ['left', 675, 1, 14, 55, 2, 0.58, 8, 2],
];

// ---- 05 Delta Drift (brand geometry: 64-unit box, stroke 6, miter join) ----
const deltaCss = `
.delta{position:absolute;color:var(--fx);opacity:.14;animation:float ease-in-out infinite alternate}
@keyframes float{from{transform:translateY(0) rotate(0deg)}to{transform:translateY(-36px) rotate(14deg)}}`;
const deltaFx = (ds) =>
  ds
    .map(
      ([x, y, s, dur, d]) =>
        `<svg class="delta" style="left: ${x}px; top: ${y}px; animation-duration: ${dur}s; animation-delay: -${d}s;" width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="miter"><path d="M32 12 L52 52 L12 52 Z"></path></svg>`
    )
    .join('\n');
const DELTAS_ALL = [
  [860, 70, 120, 19, 0],
  [1080, 300, 64, 23, 3],
  [980, 520, 90, 27, 6],
  [640, 40, 40, 17, 2],
  [1180, 90, 48, 21, 8],
  [760, 560, 56, 25, 4],
];

const effects = [
  { file: 'Main.dc.html', title: '01 · Grid Pulse', css: gridCss, fx: gridFx(GRID_ALL) },
  { file: 'GlowShift.dc.html', title: '02 · Ambient Glow Shift', css: glowCss, fx: glowFx },
  { file: 'ScanSweep.dc.html', title: '03 · Scan Sweep', css: scanCss, fx: scanFx },
  { file: 'DataRails.dc.html', title: '04 · Data Rails', css: railCss, fx: railFx(RAILS_ALL) },
  { file: 'DeltaDrift.dc.html', title: '05 · Delta Drift', css: deltaCss, fx: deltaFx(DELTAS_ALL) },
  {
    // Superset: a thinned selection of all five, kept to 14 moving parts.
    file: 'Combined.dc.html',
    title: '06 · Combined',
    css: gridCss + glowCss + scanCss + railCss + deltaCss,
    fx: [
      glowFx,
      gridFx([
        [3, 1, 1.2],
        [10, 6, 0.6],
        [19, 5, 2.9],
        [6, 11, 7.2],
      ]),
      scanFx,
      railFx([RAILS_ALL[2], RAILS_ALL[5], RAILS_ALL[8], RAILS_ALL[11]]),
      deltaFx([DELTAS_ALL[0], DELTAS_ALL[1], DELTAS_ALL[5]]),
    ].join('\n'),
  },
];

const props = JSON.stringify({
  accent: {
    editor: 'color',
    default: '#05cd99',
    options: ['#05cd99', '#fa3', '#6f5cff', '#1a1a1a'],
  },
  dark: { editor: 'boolean', default: false },
  motion: { editor: 'boolean', default: true },
  strength: { editor: 'range', default: 100, min: 0, max: 100, step: 1, unit: '%' },
  $preview: { width: W, height: H },
});

const written = [];
for (const e of effects) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${e.title} — hero motion</title>
<script src="./support.js"></script>
<link rel="stylesheet" href="ds/gst/components/bundle.css">
</head>
<body>
<x-dc>
<helmet>
<style>${base}${e.css}
</style>
</helmet>
${hero(e.fx)}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='${props}'>
class Component extends DCLogic {
constructor(props) {
super(props);
this.state = { dark: null, strength: null };
}
renderVals() {
var isDark = this.state.dark === null ? !!this.props.dark : this.state.dark;
var strength = this.state.strength === null ? (this.props.strength ?? 100) : this.state.strength;
var self = this;
return {
strength: strength,
strengthLabel: strength + '%',
fxo: String(strength / 100),
setStrength: function (e) { self.setState({ strength: Number(e.target.value) }); },
accent: this.props.accent ?? '#05cd99',
themeCls: isDark ? 'dark' : 'light',
motionCls: this.props.motion === false ? 'off' : 'on',
isDark: isDark,
themeLabel: isDark ? 'Dark' : 'Light',
toggleTheme: function () { self.setState({ dark: !isDark }); }
};
}
}
</script>
</body>
</html>
`;
  const out = path.join(root, 'project', e.file);
  fs.writeFileSync(out, html);
  written.push(out);
}

const boards = {},
  order = [];
effects.forEach((e, i) => {
  const col = i % 2,
    row = Math.floor(i / 2);
  boards[e.file] = {
    x: col * (W + 80),
    y: row * (H + 120),
    w: W,
    h: H,
    title: e.title,
    is_interactive: true,
  };
  order.push(e.file);
});
const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const canvas = {
  v: 3,
  createdOnFiles: { v: 1, at: '2026-09-22T17:37:42Z' },
  title: 'Hero Ambient Motion',
  launch: { view: 'canvas' },
  pages: [],
  boards,
  order,
  notes: {
    head: {
      x: 0,
      y: -300,
      text: 'BL-035 · Hero ambient motion — 5 POCs',
      kind: 'title1',
      maxW: 2640,
    },
  },
  designSystems: [
    {
      title: 'GST Design System',
      namespace: 'gst',
      artifact: 'https://claude.ai/artifact/UAX3SZWtHRx5RSCKr4EAB8',
      version: '1790085777-4a68',
      copiedAt: now,
    },
  ],
};
const canvasFile = path.join(root, 'project', 'canvas.json');
fs.writeFileSync(canvasFile, JSON.stringify(canvas, null, 2));
written.push(canvasFile);

// Write the artboards in the repo's prettier style, so regenerating them does
// not reintroduce the drift the weekly `prettier --check .` job reports.
(async () => {
  for (const file of written) {
    const options = { ...(await prettier.resolveConfig(file)), filepath: file };
    fs.writeFileSync(file, await prettier.format(fs.readFileSync(file, 'utf8'), options));
  }
  console.log('ok');
})();
