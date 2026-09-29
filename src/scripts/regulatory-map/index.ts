// First, and a module of its own: static imports run before this module's
// body, so FAQ tracking is wired before the top-level map-data `await` below
// (as when it was a separate page <script>), and still works if that fetch fails.
import './faq-analytics';
import { geoEquirectangular, geoPath } from 'd3-geo';
import { select } from 'd3-selection';
import { zoom as d3Zoom, zoomIdentity } from 'd3-zoom';
// d3-transition loaded lazily on first zoom interaction (saves ~10-15KB from initial bundle)
let transitionLoaded = false;
async function ensureTransition(): Promise<void> {
  if (!transitionLoaded) {
    await import('d3-transition');
    transitionLoaded = true;
  }
}
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { FeatureCollection, Geometry } from 'geojson';
import { encodeFilters, decodeFilters } from '../../utils/regulatory-map-url';
import {
  REGULATION_CATEGORY_CSS,
  REGULATION_CATEGORY_SHORT_LABELS,
} from '../../utils/regulation-categories';
import type { Regulation, RegionSelectedDetail } from '../../types/regulatory-map';
import { numericToAlpha3, alpha3ToName } from '../../utils/countryCodeMap';
import { fipsToStateCode, stateCodeToName } from '../../utils/fipsToStateCode';
import { provinceCodeToName } from '../../utils/canadianProvinceMap';
import { trackEvent } from '../../utils/analytics';
import { escapeHtml } from '../../utils/escape-html';
import {
  buildSearchIndex,
  filterRegionMap,
  renderRegulationCard,
  searchRegulations,
  sortByEffectiveDate,
  type RegIndexEntry,
} from './logic';
import * as Sentry from '@sentry/browser';

// --- Detail cache: full regulation objects fetched on demand ---
const detailCache = new Map<string, Regulation>();

async function fetchRegulationDetail(id: string): Promise<Regulation | null> {
  if (detailCache.has(id)) return detailCache.get(id)!;
  try {
    const res = await fetch(`/data/regulations/${encodeURIComponent(id)}.json`);
    if (!res.ok) return null;
    const reg: Regulation = await res.json();
    detailCache.set(id, reg);
    return reg;
  } catch (err) {
    console.error(`Failed to fetch regulation detail: ${id}`, err);
    Sentry.captureException(err, { tags: { area: 'regulatory-map' } });
    return null;
  }
}

// Analytics: fire rm_start once per page load on first interaction
let rmStartFired = false;

// Phase 1: world geodata + regulation index in parallel (critical path)
const [topology, regIndexRaw] = await Promise.all([
  fetch('/data/world-110m.json').then((r) => r.json()) as Promise<Topology>,
  fetch('/data/reg-index.json').then((r) => r.json()) as Promise<{
    regions: Record<string, string[]>;
    regs: RegIndexEntry[];
  }>,
]);

// regionMap: region code → array of regulation IDs
const regionMap: Record<string, string[]> = regIndexRaw.regions;

// Subnational data loaded after world map renders (Phase 2)
let usStates: FeatureCollection<Geometry, { name?: string }> | null = null;
let caProvinces: FeatureCollection<Geometry, { iso_3166_2?: string; name?: string }> | null = null;

// --- Mobile detection ---
const isMobile = (): boolean => window.innerWidth < 1024;

// --- Bottom sheet (mobile panel) ---
const overlay = document.getElementById('bottomSheetOverlay');

function openBottomSheet(): void {
  if (!isMobile()) return;
  compliancePanel.hidden = false;
  // Force reflow before adding class for transition
  void compliancePanel.offsetHeight;
  compliancePanel.classList.add('brutal-panel--sheet-open');
  document.body.style.overflow = 'hidden';
  if (overlay) {
    overlay.hidden = false;
    void overlay.offsetHeight;
    overlay.classList.add('visible');
  }
}

function closeBottomSheet(): void {
  compliancePanel.classList.remove('brutal-panel--sheet-open');
  document.body.style.overflow = '';
  overlay?.classList.remove('visible');
  setTimeout(() => {
    if (overlay) overlay.hidden = true;
  }, 300);
}

overlay?.addEventListener('click', closeBottomSheet);

// Swipe-down-to-dismiss
const sheetHandle = document.getElementById('bottomSheetHandle');
let sheetStartY = 0;
let sheetCurrentY = 0;

sheetHandle?.addEventListener(
  'touchstart',
  (e) => {
    sheetStartY = e.touches[0].clientY;
    sheetCurrentY = sheetStartY;
    compliancePanel.style.transition = 'none';
  },
  { passive: true }
);

sheetHandle?.addEventListener(
  'touchmove',
  (e) => {
    sheetCurrentY = e.touches[0].clientY;
    const dy = Math.max(0, sheetCurrentY - sheetStartY);
    compliancePanel.style.transform = `translateY(${dy}px)`;
  },
  { passive: true }
);

sheetHandle?.addEventListener('touchend', () => {
  compliancePanel.style.transition = '';
  compliancePanel.style.transform = '';
  const dy = sheetCurrentY - sheetStartY;
  if (dy > 80) {
    closeBottomSheet();
    compliancePanel.hidden = true;
  } else {
    compliancePanel.classList.add('brutal-panel--sheet-open');
  }
});

// --- Filter & timeline state ---
let activeCategory = 'all';
let currentRegionId: string | null = null;
let activeTimelineEntry: HTMLElement | null = null;

/** The --active class and aria-pressed are one state; change them together. */
function setTimelineEntryActive(entry: HTMLElement, active: boolean): void {
  entry.classList.toggle('brutal-timeline-entry--active', active);
  entry.setAttribute('aria-pressed', String(active));
}

// --- URL bookmarking helpers ---
// Shared encoder/decoder lives at src/utils/regulatory-map-url.ts so the MCP
// tool emits byte-compatible deep-links.

function syncUrlParams(): void {
  const qs = encodeFilters({ region: currentRegionId, filter: activeCategory });
  history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
}

function getUrlParams(): { region: string | null; filter: string | null } {
  return decodeFilters(location.search);
}

// --- Copy link button ---
document.getElementById('panelCopyLink')?.addEventListener('click', () => {
  const btn = document.getElementById('panelCopyLink')!;
  const showCopied = () => {
    btn.classList.add('brutal-panel__copy--copied');
    btn.setAttribute('aria-label', 'Link copied!');
    setTimeout(() => {
      btn.classList.remove('brutal-panel__copy--copied');
      btn.setAttribute('aria-label', 'Copy link to this view');
    }, 2000);
  };
  showCopied();
  if (navigator.clipboard) {
    navigator.clipboard.writeText(location.href).catch((err) => {
      console.warn('Clipboard write failed:', err);
      Sentry.captureException(err, { tags: { area: 'regulatory-map' } });
    });
  }
});

// regById: lightweight index entries keyed by ID (populated from inline index)
const regById: Record<string, RegIndexEntry> = {};
for (const entry of regIndexRaw.regs) {
  regById[entry.id] = entry;
}

const searchIndex = buildSearchIndex(regIndexRaw.regs);

let activeSearchTerm = '';
let searchResults: RegIndexEntry[] = [];
let activeResultIndex = -1;

function clearRegionHighlights(): void {
  select('#mapSvg')
    .selectAll('.country-path--highlighted')
    .classed('country-path--highlighted', false);
  select('#mapSvg').selectAll('.state-path--highlighted').classed('state-path--highlighted', false);
}

function highlightRegulationRegions(reg: RegIndexEntry | Regulation): void {
  clearRegionHighlights();

  const regionSet = new Set(reg.regions);

  // Highlight country paths
  select('#mapSvg')
    .selectAll('path[data-alpha3]')
    .each(function () {
      const el = this as SVGPathElement;
      const alpha3 = el.dataset.alpha3 ?? '';
      if (regionSet.has(alpha3)) {
        el.classList.add('country-path--highlighted');
      }
    });

  // Highlight state/province paths
  select('#mapSvg')
    .selectAll('path[data-state-code]')
    .each(function () {
      const el = this as SVGPathElement;
      const code = el.dataset.stateCode ?? '';
      if (regionSet.has(code)) {
        el.classList.add('state-path--highlighted');
      }
    });
}

function getFilteredRegionMap(): Record<string, string[]> {
  return filterRegionMap(regionMap, regById, activeCategory);
}

// --- D3 Setup ---
// Convert TopoJSON to GeoJSON first so we can fit the projection to the data
const countries = feature(
  topology as unknown as Topology<{ countries: GeometryCollection }>,
  topology.objects.countries as GeometryCollection
) as unknown as FeatureCollection<Geometry, { name?: string }>;

// Exclude Antarctica to reclaim vertical space
const visibleCountries: FeatureCollection<Geometry, { name?: string }> = {
  type: 'FeatureCollection',
  features: countries.features.filter((f) => f.id !== '010'),
};

// Equirectangular fills the rectangle perfectly — no wasted corner space.
// Clip latitude to ~60°S (post-Antarctica removal) to maximize land area.
const MAP_WIDTH = 960;
const MAP_HEIGHT = 440;

const svg = select<SVGSVGElement, unknown>('#mapSvg');

const projection = geoEquirectangular().fitSize([MAP_WIDTH, MAP_HEIGHT], visibleCountries);

const pathGenerator = geoPath(projection);

// --- Zoom behavior ---
const g = svg.append('g');

const zoomBehavior = d3Zoom<SVGSVGElement, unknown>()
  .scaleExtent([1, 8])
  .translateExtent([
    [0, 0],
    [MAP_WIDTH, MAP_HEIGHT],
  ])
  .on('zoom', (event) => {
    g.attr('transform', event.transform);
  });

// Apply zoom to SVG — on touch devices require two-finger pinch (touchAction: pan-x pan-y
// lets single-finger scroll pass through to the page)
svg.call(zoomBehavior).on('dblclick.zoom', null); // disable double-click zoom to avoid conflicts with clicks

const svgNode = svg.node() as SVGSVGElement;
svgNode.style.touchAction = 'pan-x pan-y';

// Zoom controls
const zoomInBtn = document.getElementById('zoomIn');
const zoomOutBtn = document.getElementById('zoomOut');
const zoomResetBtn = document.getElementById('zoomReset');

zoomInBtn?.addEventListener('click', async () => {
  await ensureTransition();
  svg.transition().duration(300).call(zoomBehavior.scaleBy, 1.5);
});
zoomOutBtn?.addEventListener('click', async () => {
  await ensureTransition();
  svg
    .transition()
    .duration(300)
    .call(zoomBehavior.scaleBy, 1 / 1.5);
});
zoomResetBtn?.addEventListener('click', async () => {
  await ensureTransition();
  svg.transition().duration(300).call(zoomBehavior.transform, zoomIdentity);
});

// --- Quick-zoom regions (mobile) ---
// Translate values: tx = vw/2 - k*cx, ty = vh/2 - k*cy
// where (cx,cy) is the SVG center of the region on the 960x440 equirectangular projection
const REGION_VIEWS: Record<string, { x: number; y: number; k: number }> = {
  americas: { x: -107, y: -257, k: 2.2 },
  europe: { x: -1340, y: -148, k: 3.5 },
  'asia-pacific': { x: -1488, y: -283, k: 2.5 },
  'africa-mideast': { x: -1088, y: -432, k: 2.8 },
  // Identity: the view #zoomReset applies, reachable without pinch on mobile (BL-101)
  world: { x: 0, y: 0, k: 1 },
};

document.getElementById('mapQuickZoom')?.addEventListener('click', async (e) => {
  const btn = (e.target as HTMLElement).closest('.brutal-quick-zoom') as HTMLElement | null;
  if (!btn) return;
  const region = btn.dataset.region ?? '';
  const view = REGION_VIEWS[region];
  if (!view) return;

  await ensureTransition();
  const transform = zoomIdentity.translate(view.x, view.y).scale(view.k);
  svg.transition().duration(500).call(zoomBehavior.transform, transform);

  // A reset is not a region zoom; counting it would inflate rm_region_zoom.
  if (region === 'world') return;
  trackEvent({
    event: 'rm_region_zoom',
    category: 'tool',
    region: region,
    page: 'regulatory-map',
  });
});

// --- Pinch-to-zoom hint (mobile, first touch only) ---
const pinchHint = document.getElementById('mapPinchHint');
let pinchHintShown = false;

svgNode.addEventListener(
  'touchstart',
  () => {
    if (pinchHintShown || !isMobile() || !pinchHint) return;
    pinchHintShown = true;
    pinchHint.hidden = false;
    requestAnimationFrame(() => {
      pinchHint.classList.add('visible');
    });
    setTimeout(() => {
      pinchHint.classList.remove('visible');
      setTimeout(() => {
        pinchHint.hidden = true;
      }, 300);
    }, 2000);
  },
  { once: true, passive: true }
);

// --- Render countries ---
let selectedPath: SVGPathElement | null = null;

// Phase A: render paths with base classes only — no regionMap checks yet
g.selectAll('path')
  .data(visibleCountries.features)
  .enter()
  .append('path')
  .attr('d', (d) => pathGenerator(d) ?? '')
  .attr('class', 'country-path')
  .attr('data-id', (d) => d.id as string)
  .attr('data-alpha3', (d) => numericToAlpha3[d.id as string] ?? '')
  .attr('aria-label', (d) => {
    const alpha3 = numericToAlpha3[d.id as string];
    return alpha3ToName[alpha3] ?? '';
  })
  .attr('role', 'presentation')
  .on('click', function (event: MouseEvent) {
    if (this.classList.contains('country-path--active')) handleCountryClick(event);
  })
  .on('keydown', function (event: KeyboardEvent) {
    if (
      this.classList.contains('country-path--active') &&
      (event.key === 'Enter' || event.key === ' ')
    ) {
      event.preventDefault();
      handleCountryClick(event);
    }
  })
  .on('mouseenter', handleMouseEnter)
  .on('mouseleave', handleMouseLeave);

// --- Deferred subnational rendering (US states + Canada provinces) ---
// Loaded after world map renders to reduce critical-path payload by ~220KB.
async function loadSubnationalData(): Promise<void> {
  const [usTopo, caTopo] = await Promise.all([
    fetch('/data/us-states-10m.json').then((r) => r.json()) as Promise<Topology>,
    fetch('/data/canada-provinces.json').then((r) => r.json()) as Promise<Topology>,
  ]);

  usStates = feature(
    usTopo as unknown as Topology<{ states: GeometryCollection }>,
    usTopo.objects.states as GeometryCollection
  ) as unknown as FeatureCollection<Geometry, { name?: string }>;

  caProvinces = feature(
    caTopo as unknown as Topology<{ collection: GeometryCollection }>,
    caTopo.objects.collection as GeometryCollection
  ) as unknown as FeatureCollection<Geometry, { iso_3166_2?: string; name?: string }>;

  // Render US state paths
  g.selectAll('path.state-path')
    .data(usStates.features)
    .enter()
    .append('path')
    .attr('d', (d) => pathGenerator(d) ?? '')
    .attr('class', 'state-path')
    .attr('data-state-code', (d) => fipsToStateCode[d.id as string] ?? '')
    .attr('aria-label', (d) => {
      const code = fipsToStateCode[d.id as string];
      return code ? (stateCodeToName[code] ?? '') : '';
    })
    .attr('role', 'presentation')
    .on('click', function (event: MouseEvent) {
      if (this.classList.contains('state-path--active')) handleStateClick(event);
    })
    .on('keydown', function (event: KeyboardEvent) {
      if (
        this.classList.contains('state-path--active') &&
        (event.key === 'Enter' || event.key === ' ')
      ) {
        event.preventDefault();
        handleStateClick(event);
      }
    })
    .on('mouseenter', handleMouseEnter)
    .on('mouseleave', handleMouseLeave);

  // Render Canadian province paths
  g.selectAll('path.province-path')
    .data(caProvinces.features)
    .enter()
    .append('path')
    .attr('d', (d) => pathGenerator(d) ?? '')
    .attr('class', 'state-path')
    .attr('data-state-code', (d) => d.properties?.iso_3166_2 ?? '')
    .attr('aria-label', (d) => {
      const code = d.properties?.iso_3166_2 ?? '';
      return provinceCodeToName[code] ?? '';
    })
    .attr('role', 'presentation')
    .on('click', function (event: MouseEvent) {
      if (this.classList.contains('state-path--active')) handleStateClick(event);
    })
    .on('keydown', function (event: KeyboardEvent) {
      if (
        this.classList.contains('state-path--active') &&
        (event.key === 'Enter' || event.key === ' ')
      ) {
        event.preventDefault();
        handleStateClick(event);
      }
    })
    .on('mouseenter', handleMouseEnter)
    .on('mouseleave', handleMouseLeave);

  // Apply active state to subnational paths with regulations
  applySubnationalHighlighting();

  // A timeline entry opened before these paths existed highlighted only its
  // countries; a state-only regulation (e.g. FCPA) showed nothing on the map.
  const activeRegId = activeTimelineEntry?.dataset.regId;
  if (activeRegId && regById[activeRegId]) {
    highlightRegulationRegions(regById[activeRegId]);
  }

  // Restore URL-bookmarked subnational region if present
  const { region } = getUrlParams();
  if (region && region.includes('-')) {
    const pathEl = document.querySelector(
      `path[data-state-code="${CSS.escape(region)}"]`
    ) as SVGPathElement | null;
    if (pathEl?.classList.contains('state-path--active')) {
      selectRegion(pathEl, region, 'state-path--selected');
    }
  }

  // Signal that subnational paths are ready (used by E2E tests)
  document.getElementById('mapContainer')?.setAttribute('data-subnational-ready', 'true');
}

/** Apply --active class to subnational paths that have regulations */
function applySubnationalHighlighting(): void {
  const filteredMap = getFilteredRegionMap();
  g.selectAll<SVGPathElement, unknown>('.state-path').each(function () {
    const code = this.getAttribute('data-state-code') ?? '';
    if (code && filteredMap[code]) {
      this.classList.add('state-path--active');
      this.setAttribute('role', 'button');
      this.setAttribute('tabindex', '0');
    }
  });
}

// Fire subnational load — does not block world map rendering
loadSubnationalData();

// --- Phase B: apply regulation data from inline index ---
// Apply --active class, role="button", and tabindex to country paths with regulations.
// Subnational paths (US states, Canadian provinces) are handled by applySubnationalHighlighting()
// after deferred loading completes.
if (Object.keys(regionMap).length > 0) {
  g.selectAll<SVGPathElement, unknown>('.country-path').each(function () {
    const alpha3 = this.getAttribute('data-alpha3') ?? '';
    if (alpha3 === 'USA' || alpha3 === 'CAN') return;
    if (alpha3 && regionMap[alpha3]) {
      this.classList.add('country-path--active');
      this.setAttribute('role', 'button');
      this.setAttribute('tabindex', '0');
    }
  });
}

// Category → CSS class map (used by timeline rendering and search)
const categoryColorMap: Record<string, string> = REGULATION_CATEGORY_CSS;

// Initial timeline render (requires regionMap)
renderTimeline();

// --- Tooltip ---
const tooltip = document.getElementById('mapTooltip')!;

function handleMouseEnter(event: MouseEvent): void {
  const target = event.currentTarget as SVGPathElement;
  // Resolve name from either country alpha3 or state code
  const alpha3 = target.dataset.alpha3 ?? '';
  const stateCode = target.dataset.stateCode ?? '';
  const name = stateCode
    ? (stateCodeToName[stateCode] ?? provinceCodeToName[stateCode])
    : alpha3ToName[alpha3];
  if (!name) return;

  tooltip.textContent = name;
  tooltip.classList.add('visible');

  const rect = document.getElementById('mapContainer')!.getBoundingClientRect();
  const x = event.clientX - rect.left + 12;
  const y = event.clientY - rect.top - 28;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function handleMouseLeave(): void {
  tooltip.classList.remove('visible');
}

// --- Region selection (shared by country + state clicks) ---
function selectRegion(target: SVGPathElement, regionId: string, selectedClass: string): void {
  // Clear any timeline-driven highlights
  clearRegionHighlights();
  if (activeTimelineEntry) {
    setTimelineEntryActive(activeTimelineEntry, false);
    activeTimelineEntry = null;
  }

  if (selectedPath) {
    selectedPath.classList.remove('country-path--selected', 'state-path--selected');
  }
  target.classList.add(selectedClass);
  selectedPath = target;

  document.dispatchEvent(
    new CustomEvent<RegionSelectedDetail>('regionSelected', {
      detail: { regionId },
    })
  );
}

// --- Mobile tap bar ---
const tapBar = document.getElementById('mapTapBar');
const tapBarName = document.getElementById('tapBarName');
const tapBarAction = document.getElementById('tapBarAction');
let pendingTapTarget: SVGPathElement | null = null;
let pendingTapRegionId: string | null = null;
let pendingTapSelectedClass: string | null = null;

function showTapBar(
  name: string,
  target: SVGPathElement,
  regionId: string,
  selectedClass: string
): void {
  if (!tapBar || !tapBarName) return;
  document.getElementById('mapCta')?.remove();
  tapBarName.textContent = name;
  tapBar.hidden = false;
  pendingTapTarget = target;
  pendingTapRegionId = regionId;
  pendingTapSelectedClass = selectedClass;
}

tapBarAction?.addEventListener('click', () => {
  if (pendingTapTarget && pendingTapRegionId && pendingTapSelectedClass) {
    selectRegion(pendingTapTarget, pendingTapRegionId, pendingTapSelectedClass);
  }
});

// --- Country click ---
function handleCountryClick(event: Event): void {
  const target = (event.currentTarget ?? event.target) as SVGPathElement;
  const alpha3 = target.dataset.alpha3 ?? '';
  if (!alpha3) return;

  if (isMobile()) {
    const name = alpha3ToName[alpha3] ?? alpha3;
    showTapBar(name, target, alpha3, 'country-path--selected');
  } else {
    selectRegion(target, alpha3, 'country-path--selected');
  }
}

// --- State click ---
function handleStateClick(event: Event): void {
  const target = (event.currentTarget ?? event.target) as SVGPathElement;
  const stateCode = target.dataset.stateCode ?? '';
  if (!stateCode) return;

  if (isMobile()) {
    const name = stateCodeToName[stateCode] ?? provinceCodeToName[stateCode] ?? stateCode;
    showTapBar(name, target, stateCode, 'state-path--selected');
  } else {
    selectRegion(target, stateCode, 'state-path--selected');
  }
}

// --- Panel updates ---
const compliancePanel = document.getElementById('compliancePanel')!;
const panelCountryName = document.getElementById('panelCountryName')!;
const panelRegCount = document.getElementById('panelRegCount')!;
const panelRegulations = document.getElementById('panelRegulations')!;

async function renderPanel(regionId: string): Promise<void> {
  const countryName =
    stateCodeToName[regionId] ?? provinceCodeToName[regionId] ?? alpha3ToName[regionId] ?? regionId;
  const filteredMap = getFilteredRegionMap();
  const regIds = filteredMap[regionId] ?? [];

  panelCountryName.textContent = countryName;

  const count = regIds.length;
  panelRegCount.textContent = `${count} regulation${count !== 1 ? 's' : ''}`;

  if (count === 0) {
    panelRegulations.innerHTML = '';
    return;
  }

  panelRegulations.innerHTML =
    '<div class="brutal-reg-card brutal-reg-card--loading">Loading\u2026</div>';
  const details = await Promise.all(regIds.map(fetchRegulationDetail));
  panelRegulations.innerHTML = details
    .filter((r): r is Regulation => r !== null)
    .map(renderRegulationCard)
    .join('');

  trackEvent({
    event: 'rm_complete',
    category: 'tool',
    region_id: regionId,
    regulation_count: count,
    page: 'regulatory-map',
  });
}

document.addEventListener('regionSelected', ((event: CustomEvent<RegionSelectedDetail>) => {
  const { regionId } = event.detail;
  currentRegionId = regionId;
  syncUrlParams();
  const countryName =
    stateCodeToName[regionId] ?? provinceCodeToName[regionId] ?? alpha3ToName[regionId] ?? regionId;

  renderPanel(regionId);

  document.getElementById('mapCta')?.remove();
  compliancePanel.hidden = false;
  if (isMobile()) openBottomSheet();

  const totalRegs = regionMap[regionId]?.length ?? 0;
  if (!rmStartFired) {
    trackEvent({ event: 'rm_start', category: 'tool', page: 'regulatory-map' });
    rmStartFired = true;
  }
  trackEvent({
    event: 'rm_region_select',
    category: 'tool',
    region_id: regionId,
    region_name: countryName,
    regulation_count: totalRegs,
    page: 'regulatory-map',
  });

  // On mobile, open the bottom sheet
  if (isMobile()) {
    openBottomSheet();
  }
}) as EventListener);

// --- Restore bookmarked state from URL ---
// Must run AFTER the regionSelected listener is registered (above) so that
// dispatching regionSelected from selectRegion() actually opens the panel.
(function restoreFromUrl() {
  const { region, filter } = getUrlParams();

  if (filter) {
    activeCategory = filter;
    document.querySelectorAll('#regulation-filter-chips .brutal-filter-chip').forEach((c) => {
      c.classList.toggle(
        'brutal-filter-chip--active',
        (c as HTMLElement).dataset.category === filter
      );
    });
    updateMapHighlighting();
    renderTimeline();
  }

  if (region) {
    const isSubnational = region.includes('-');
    const selector = isSubnational
      ? `path[data-state-code="${CSS.escape(region)}"]`
      : `path[data-alpha3="${CSS.escape(region)}"]`;
    const pathEl = document.querySelector(selector) as SVGPathElement | null;

    if (
      pathEl &&
      (pathEl.classList.contains('country-path--active') ||
        pathEl.classList.contains('state-path--active'))
    ) {
      selectRegion(
        pathEl,
        region,
        isSubnational ? 'state-path--selected' : 'country-path--selected'
      );
    }
  }
})();

// --- Sync panel max-height to map height so the back-link stays stable ---
function syncPanelHeight(): void {
  if (window.innerWidth < 1024) return;
  const mapEl = document.getElementById('mapContainer');
  if (!mapEl) return;
  compliancePanel.style.maxHeight = `${mapEl.offsetHeight}px`;
}
syncPanelHeight();
window.addEventListener('resize', syncPanelHeight);

// --- Category filter ---
function updateMapHighlighting(): void {
  const filteredMap = getFilteredRegionMap();

  // Update country paths
  select('#mapSvg')
    .selectAll('path.country-path')
    .attr('class', function () {
      const el = this as unknown as SVGPathElement;
      const d = select(el).datum() as
        { id?: string; properties?: { iso_3166_2?: string } } | undefined;
      if (!d || !d.id) return 'country-path';
      const alpha3 = numericToAlpha3[d.id as string];
      if (alpha3 === 'USA' || alpha3 === 'CAN') return 'country-path';
      const hasRegs = alpha3 && filteredMap[alpha3];
      return `country-path${hasRegs ? ' country-path--active' : ''}`;
    });

  // Update US state and Canadian province paths
  select('#mapSvg')
    .selectAll('path[class^="state-path"]')
    .attr('class', function () {
      const el = this as unknown as SVGPathElement;
      const code = el.dataset.stateCode ?? '';
      const hasRegs = code && filteredMap[code];
      return `state-path${hasRegs ? ' state-path--active' : ''}`;
    });
}

document.getElementById('regulation-filter-chips')?.addEventListener('click', (e) => {
  const chip = (e.target as HTMLElement).closest('.brutal-filter-chip') as HTMLElement | null;
  if (!chip) return;

  document
    .querySelectorAll('#regulation-filter-chips .brutal-filter-chip')
    .forEach((c) => c.classList.remove('brutal-filter-chip--active'));
  chip.classList.add('brutal-filter-chip--active');
  activeCategory = chip.dataset.category ?? 'all';
  syncUrlParams();

  updateMapHighlighting();

  // Re-run search with new category filter
  if (activeSearchTerm.trim()) {
    searchResults = performSearch(activeSearchTerm);
    renderSearchResults(searchResults);
    updateMapForSearch(searchResults, activeSearchTerm);
  }

  if (currentRegionId && !compliancePanel.hidden) {
    const filteredMap = getFilteredRegionMap();
    const regs = filteredMap[currentRegionId] ?? [];
    if (regs.length > 0) {
      renderPanel(currentRegionId);
    } else {
      // Deselect region when it has no regulations for the new filter
      if (selectedPath) {
        selectedPath.classList.remove('country-path--selected', 'state-path--selected');
        selectedPath = null;
      }
      currentRegionId = null;
      syncUrlParams();
      if (isMobile()) {
        closeBottomSheet();
      }
      compliancePanel.hidden = true;
    }
  }

  renderTimeline();

  trackEvent({
    event: 'rm_filter_change',
    category: 'tool',
    filter_value: activeCategory,
    page: 'regulatory-map',
  });
});

// --- Search ---
// categoryColorMap declared earlier (before renderTimeline) to avoid TDZ

const categoryLabelMap: Record<string, string> = REGULATION_CATEGORY_SHORT_LABELS;

function performSearch(query: string): RegIndexEntry[] {
  return searchRegulations(searchIndex, query, activeCategory);
}

function renderSearchResults(results: RegIndexEntry[]): void {
  const container = document.getElementById('searchResults')!;

  if (!activeSearchTerm.trim()) {
    container.hidden = true;
    container.innerHTML = '';
    return;
  }

  if (results.length === 0) {
    container.innerHTML = '<div class="brutal-search__no-results">No regulations found</div>';
    container.hidden = false;
    return;
  }

  container.innerHTML = results
    .slice(0, 15)
    .map((reg, i) => {
      const catColor = categoryColorMap[reg.category] ?? 'privacy';
      const catLabel = categoryLabelMap[reg.category] ?? reg.category;
      const regionCount = reg.regions.length;
      return `
              <div class="brutal-search__result"
                   role="option"
                   id="search-result-${i}"
                   data-reg-id="${escapeHtml(reg.id)}"
                   tabindex="-1">
                  <span class="brutal-search__result-name">${escapeHtml(reg.name)}</span>
                  <span class="brutal-search__result-meta">
                      <span class="brutal-search__category brutal-search__category--${catColor}">${catLabel}</span>
                      <span class="brutal-search__result-regions">${regionCount} region${regionCount !== 1 ? 's' : ''}</span>
                  </span>
              </div>`;
    })
    .join('');

  if (results.length > 15) {
    container.innerHTML += `<div class="brutal-search__overflow">${results.length - 15} more results\u2026</div>`;
  }

  container.hidden = false;
  activeResultIndex = -1;
}

function updateMapForSearch(results: RegIndexEntry[], query: string): void {
  if (!query.trim()) {
    updateMapHighlighting();
    return;
  }

  const matchingRegions = new Set<string>();
  for (const reg of results) {
    for (const region of reg.regions) {
      matchingRegions.add(region);
    }
  }

  select('#mapSvg')
    .selectAll('path.country-path')
    .attr('class', function () {
      const el = this as unknown as SVGPathElement;
      const d = select(el).datum() as { id?: string } | undefined;
      if (!d || !d.id) return 'country-path';
      const alpha3 = numericToAlpha3[d.id as string];
      if (alpha3 === 'USA' || alpha3 === 'CAN') return 'country-path';
      return `country-path${matchingRegions.has(alpha3) ? ' country-path--active' : ''}`;
    });

  select('#mapSvg')
    .selectAll('path[class^="state-path"]')
    .attr('class', function () {
      const el = this as unknown as SVGPathElement;
      const code = el.dataset.stateCode ?? '';
      return `state-path${matchingRegions.has(code) ? ' state-path--active' : ''}`;
    });
}

async function selectSearchResult(regId: string): Promise<void> {
  const indexEntry = regById[regId];
  if (!indexEntry) return;

  highlightRegulationRegions(indexEntry);

  const regionCount = indexEntry.regions.length;
  panelCountryName.textContent = indexEntry.name;
  panelRegCount.textContent = `${regionCount} region${regionCount !== 1 ? 's' : ''}`;
  panelRegulations.innerHTML =
    '<div class="brutal-reg-card brutal-reg-card--loading">Loading\u2026</div>';
  document.getElementById('mapCta')?.remove();
  compliancePanel.hidden = false;

  if (isMobile()) {
    openBottomSheet();
  }

  document.getElementById('searchResults')!.hidden = true;

  const detail = await fetchRegulationDetail(regId);
  if (detail) {
    panelRegulations.innerHTML = renderRegulationCard(detail);
  }

  trackEvent({
    event: 'rm_search_result_click',
    category: 'tool',
    regulation_id: regId,
    regulation_name: indexEntry.name,
    search_term: activeSearchTerm,
    page: 'regulatory-map',
  });
}

// Search input handler with debounce
const searchInput = document.getElementById('regulationSearchInput') as HTMLInputElement;
const searchClearBtn = document.getElementById('searchClearBtn')!;
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

searchInput.addEventListener('input', () => {
  const query = searchInput.value;
  activeSearchTerm = query;
  searchClearBtn.hidden = !query;

  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    searchResults = performSearch(query);
    renderSearchResults(searchResults);
    updateMapForSearch(searchResults, query);

    if (query.trim()) {
      trackEvent({
        event: 'rm_search',
        category: 'tool',
        search_term: query,
        result_count: searchResults.length,
        page: 'regulatory-map',
      });
    }
  }, 200);
});

// Re-show results on focus
searchInput.addEventListener('focus', () => {
  if (activeSearchTerm.trim() && searchResults.length > 0) {
    document.getElementById('searchResults')!.hidden = false;
  }
});

// Keyboard navigation
searchInput.addEventListener('keydown', (e) => {
  const resultsEl = document.getElementById('searchResults')!;
  const items = resultsEl.querySelectorAll('.brutal-search__result');

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeResultIndex = Math.min(activeResultIndex + 1, items.length - 1);
    updateActiveSearchResult(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeResultIndex = Math.max(activeResultIndex - 1, -1);
    updateActiveSearchResult(items);
  } else if (e.key === 'Enter' && activeResultIndex >= 0 && activeResultIndex < items.length) {
    e.preventDefault();
    const item = items[activeResultIndex] as HTMLElement;
    selectSearchResult(item.dataset.regId ?? '');
  } else if (e.key === 'Escape') {
    resultsEl.hidden = true;
    activeResultIndex = -1;
    searchInput.blur();
  }
});

function updateActiveSearchResult(items: NodeListOf<Element>): void {
  items.forEach((item, i) => {
    item.classList.toggle('brutal-search__result--active', i === activeResultIndex);
    if (i === activeResultIndex) {
      (item as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  });
  searchInput.setAttribute(
    'aria-activedescendant',
    activeResultIndex >= 0 ? `search-result-${activeResultIndex}` : ''
  );
}

// Click on search result
document.getElementById('searchResults')?.addEventListener('click', (e) => {
  const item = (e.target as HTMLElement).closest('.brutal-search__result') as HTMLElement | null;
  if (!item) return;
  selectSearchResult(item.dataset.regId ?? '');
});

// Clear button
searchClearBtn.addEventListener('click', () => {
  searchInput.value = '';
  activeSearchTerm = '';
  searchResults = [];
  document.getElementById('searchResults')!.hidden = true;
  searchClearBtn.hidden = true;
  activeResultIndex = -1;
  updateMapHighlighting();
  searchInput.focus();
});

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  const searchContainer = document.getElementById('regulationSearch')!;
  if (!searchContainer.contains(e.target as Node)) {
    document.getElementById('searchResults')!.hidden = true;
    activeResultIndex = -1;
  }
});

// --- Timeline ---
function buildTimelineData(): RegIndexEntry[] {
  return sortByEffectiveDate(regIndexRaw.regs);
}

/**
 * Position the Today marker absolutely over the timeline track.
 * Finds the year group matching the current year (or the gap between
 * the closest past and future year groups) and centers the marker there.
 */
function positionTodayMarker(track: HTMLElement): void {
  const marker = document.getElementById('timelineTodayMarker');
  if (!marker) return;

  const currentYear = new Date().getFullYear();
  const yearGroups = Array.from(track.querySelectorAll('.brutal-timeline-year-group'));
  if (yearGroups.length === 0) return;

  // Find the year group for the current year
  let targetLeft = 0;
  let found = false;

  for (const group of yearGroups) {
    const label = group.querySelector('.brutal-timeline-year');
    const year = parseInt(label?.textContent ?? '0');
    if (year === currentYear) {
      // Center on the current year group
      targetLeft = (group as HTMLElement).offsetLeft + (group as HTMLElement).offsetWidth / 2;
      found = true;
      break;
    }
    if (year > currentYear) {
      // Current year has no entries — position between previous group and this one
      const prev = group.previousElementSibling as HTMLElement | null;
      if (prev && prev.classList.contains('timeline-year-group')) {
        targetLeft =
          prev.offsetLeft +
          prev.offsetWidth +
          ((group as HTMLElement).offsetLeft - prev.offsetLeft - prev.offsetWidth) / 2;
      } else {
        targetLeft = (group as HTMLElement).offsetLeft;
      }
      found = true;
      break;
    }
  }

  if (!found) {
    // All entries are in the past — place after last group
    const last = yearGroups[yearGroups.length - 1] as HTMLElement;
    targetLeft = last.offsetLeft + last.offsetWidth + 20;
  }

  marker.style.left = `${targetLeft}px`;
}

function renderTimeline(): void {
  const track = document.getElementById('timelineTrack')!;
  const allRegs = buildTimelineData();
  const filteredRegs =
    activeCategory === 'all' ? allRegs : allRegs.filter((r) => r.category === activeCategory);

  const today = new Date().toISOString().slice(0, 10);

  // Sort chronologically so year groups render in order
  filteredRegs.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));

  // Group by year (Map preserves insertion order of sorted data)
  const byYear = new Map<number, RegIndexEntry[]>();
  for (const reg of filteredRegs) {
    const year = parseInt(reg.effectiveDate.slice(0, 4));
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(reg);
  }

  let html = '';

  for (const [year, regs] of byYear) {
    html += `<div class="brutal-timeline-year-group">`;
    html += `<span class="brutal-timeline-year">${year}</span>`;
    html += `<div class="brutal-timeline-year-entries">`;
    for (const reg of regs) {
      const isUpcoming = reg.effectiveDate > today;
      const catClass = categoryColorMap[reg.category] ?? 'privacy';
      const [y, m] = reg.effectiveDate.split('-');
      const monthNames = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];
      const shortDate = `${monthNames[parseInt(m, 10) - 1]} ${y}`;
      const truncName = reg.name.length > 35 ? reg.name.slice(0, 33) + '\u2026' : reg.name;
      html += `
                  <button type="button" class="brutal-timeline-entry brutal-timeline-entry--${catClass}${isUpcoming ? ' brutal-timeline-entry--upcoming' : ''}"
                       data-reg-id="${escapeHtml(reg.id)}"
                       aria-pressed="false"
                       aria-label="${escapeHtml(reg.name)}, ${shortDate}"
                       title="${escapeHtml(reg.name)} \u2014 ${shortDate}">
                      <span class="brutal-timeline-dot brutal-timeline-dot--${catClass}${isUpcoming ? ' brutal-timeline-dot--upcoming' : ''}"></span>
                      <span class="brutal-timeline-entry__name">${escapeHtml(truncName)}</span>
                      <span class="brutal-timeline-entry__date">${shortDate}</span>
                  </button>`;
    }
    html += `</div></div>`;
  }

  // Today marker — absolutely positioned based on chronological position
  // among the rendered year groups. This is filter-independent.
  html += `<div class="brutal-timeline-today" id="timelineTodayMarker"><span class="brutal-timeline-today__label">Today</span></div>`;

  track.innerHTML = html;

  // Defer offset reads to next frame — lets the browser render the injected
  // content within the reserved min-height before we force a reflow.
  requestAnimationFrame(() => {
    positionTodayMarker(track);

    // Auto-scroll to "today" marker
    const todayMarker = document.getElementById('timelineTodayMarker');
    if (todayMarker) {
      const scroll = document.getElementById('timelineScroll')!;
      scroll.scrollLeft = todayMarker.offsetLeft - scroll.clientWidth / 3;
    }
  });
}

// Timeline click handler
document.getElementById('timelineTrack')?.addEventListener('click', async (e) => {
  const entry = (e.target as HTMLElement).closest('.brutal-timeline-entry') as HTMLElement | null;
  if (!entry) return;

  const regId = entry.dataset.regId ?? '';
  const indexEntry = regById[regId];
  if (!indexEntry) return;

  // Toggle active state on timeline entry
  if (activeTimelineEntry) {
    setTimelineEntryActive(activeTimelineEntry, false);
  }

  if (activeTimelineEntry === entry) {
    // Clicking same entry again — deselect
    activeTimelineEntry = null;
    clearRegionHighlights();
    // Restore panel to previously selected region if any
    if (currentRegionId && !compliancePanel.hidden) {
      renderPanel(currentRegionId);
    }
  } else {
    setTimelineEntryActive(entry, true);
    activeTimelineEntry = entry;

    // Highlight regions on map
    highlightRegulationRegions(indexEntry);

    // Show this single regulation in the panel (fetch detail on demand)
    const regionCount = indexEntry.regions.length;
    panelCountryName.textContent = indexEntry.name;
    panelRegCount.textContent = `${regionCount} region${regionCount !== 1 ? 's' : ''}`;
    panelRegulations.innerHTML =
      '<div class="brutal-reg-card brutal-reg-card--loading">Loading\u2026</div>';
    document.getElementById('mapCta')?.remove();
    compliancePanel.hidden = false;

    const detail = await fetchRegulationDetail(regId);
    if (detail) {
      panelRegulations.innerHTML = renderRegulationCard(detail);
    }

    // On mobile, open the bottom sheet
    if (isMobile()) {
      openBottomSheet();
    }
  }

  trackEvent({
    event: 'rm_timeline_click',
    category: 'tool',
    regulation_id: regId,
    regulation_name: indexEntry.name,
    page: 'regulatory-map',
  });
});

// --- Click-drag scrolling for timeline ---
const timelineScroll = document.getElementById('timelineScroll')!;
let isDragging = false;
let dragStartX = 0;
let scrollStartX = 0;
let hasDragged = false;

timelineScroll.addEventListener('mousedown', (e) => {
  isDragging = true;
  hasDragged = false;
  dragStartX = e.clientX;
  scrollStartX = timelineScroll.scrollLeft;
  timelineScroll.style.cursor = 'grabbing';
  timelineScroll.style.userSelect = 'none';
  e.preventDefault();
});

window.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const dx = e.clientX - dragStartX;
  if (Math.abs(dx) > 3) hasDragged = true;
  timelineScroll.scrollLeft = scrollStartX - dx;
});

window.addEventListener('mouseup', () => {
  if (!isDragging) return;
  isDragging = false;
  timelineScroll.style.cursor = '';
  timelineScroll.style.userSelect = '';
});

// Suppress click on timeline entries after a drag
timelineScroll.addEventListener(
  'click',
  (e) => {
    // Pointer clicks only: a keyboard-generated click has detail 0, and a drag
    // released outside the scroller leaves hasDragged set until the next mousedown.
    if (hasDragged && e.detail !== 0) {
      e.stopPropagation();
      hasDragged = false;
    }
  },
  true
);

// Signal interactivity ready AFTER all event handlers are wired up.
// Consumers (e.g. E2E tests via waitForMapReady) can trust that the map
// is rendered, regulation data is applied, URL state is restored, AND
// every interactive surface (filter chips, search, map paths, timeline
// entries, timeline drag-scroll) has its handler bound. Emitting earlier
// produced a flake under parallel test contention: the timeline click
// handler is attached ~500 lines after URL state restoration, and tests
// that observed `data-map-ready=true` could click a timeline entry
// before the handler bound, missing the highlight.
if (Object.keys(regionMap).length > 0) {
  document.getElementById('mapContainer')?.setAttribute('data-map-ready', 'true');
}
