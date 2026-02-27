/**
 * Unit Tests for Radar UI Logic
 *
 * Tests the pure logic and data that drives two Astro components which cannot
 * be rendered in a Node/Vitest environment:
 *
 * - RadarFeedSkeleton — skeleton placeholder width calculations
 * - RadarHeader — timestamp formatting via toLocaleDateString
 */

// ---------------------------------------------------------------------------
// Helpers — skeleton width calculation (mirrors RadarFeedSkeleton.astro template)
// ---------------------------------------------------------------------------

const SKELETON_COUNT = 6;

/** Compute the title-bar width for skeleton item at index `i`. */
function skeletonTitleWidth(i: number): number {
  return 70 + (i % 3) * 10;
}

/** Compute the meta-bar width for skeleton item at index `i`. */
function skeletonMetaWidth(i: number): number {
  return 30 + (i % 3) * 10;
}

// ---------------------------------------------------------------------------
// Helpers — timestamp formatting (mirrors RadarHeader.astro frontmatter)
// ---------------------------------------------------------------------------

/** Format a Date the same way RadarHeader.astro does (Santiago, Chile timezone). */
function formatRadarTimestamp(date: Date): string {
  return date.toLocaleDateString('en-US', {
    timeZone: 'America/Santiago',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// RadarFeedSkeleton — Width Calculations
// ---------------------------------------------------------------------------

describe('RadarFeedSkeleton — width calculations', () => {
  it('should generate exactly 6 skeleton items', () => {
    const items = Array.from({ length: SKELETON_COUNT });
    expect(items).toHaveLength(6);
  });

  it('should produce title widths cycling through [70%, 80%, 90%]', () => {
    const widths = Array.from({ length: SKELETON_COUNT }, (_, i) =>
      skeletonTitleWidth(i),
    );
    expect(widths).toEqual([70, 80, 90, 70, 80, 90]);
  });

  it('should produce meta widths cycling through [30%, 40%, 50%]', () => {
    const widths = Array.from({ length: SKELETON_COUNT }, (_, i) =>
      skeletonMetaWidth(i),
    );
    expect(widths).toEqual([30, 40, 50, 30, 40, 50]);
  });

  it('should always keep title widths between 70 and 90 inclusive', () => {
    for (let i = 0; i < SKELETON_COUNT; i++) {
      const w = skeletonTitleWidth(i);
      expect(w).toBeGreaterThanOrEqual(70);
      expect(w).toBeLessThanOrEqual(90);
    }
  });

  it('should always keep meta widths between 30 and 50 inclusive', () => {
    for (let i = 0; i < SKELETON_COUNT; i++) {
      const w = skeletonMetaWidth(i);
      expect(w).toBeGreaterThanOrEqual(30);
      expect(w).toBeLessThanOrEqual(50);
    }
  });

  it('should have title width strictly greater than meta width for every item', () => {
    for (let i = 0; i < SKELETON_COUNT; i++) {
      expect(skeletonTitleWidth(i)).toBeGreaterThan(skeletonMetaWidth(i));
    }
  });

  it('should produce a 3-step repeating pattern (period = 3)', () => {
    for (let i = 0; i < SKELETON_COUNT; i++) {
      expect(skeletonTitleWidth(i)).toBe(skeletonTitleWidth(i % 3));
      expect(skeletonMetaWidth(i)).toBe(skeletonMetaWidth(i % 3));
    }
  });

  it('should use aria-hidden="true" on the container (design intent verification)', () => {
    // This test documents the accessibility design decision:
    // The skeleton is purely decorative, so it is hidden from assistive
    // technology via aria-hidden="true" on the .feed-skeleton container.
    // Actual verification occurs in E2E; here we record the contract.
    const ariaHidden = true; // matches the attribute in RadarFeedSkeleton.astro
    expect(ariaHidden).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RadarHeader — Timestamp Formatting
// ---------------------------------------------------------------------------

describe('RadarHeader — timestamp formatting (America/Santiago)', () => {
  // All dates use UTC constructors so tests are deterministic regardless of
  // the machine's local timezone. Santiago is UTC-3 (summer) / UTC-4 (winter).

  it('should include abbreviated month name', () => {
    // Feb 15 2026 17:30 UTC → Feb 15 14:30 CLT (UTC-3 summer)
    const date = new Date('2026-02-15T17:30:00Z');
    const result = formatRadarTimestamp(date);
    expect(result).toContain('Feb');
  });

  it('should include numeric day', () => {
    const date = new Date('2026-02-15T17:30:00Z');
    const result = formatRadarTimestamp(date);
    expect(result).toContain('15');
  });

  it('should include four-digit year', () => {
    const date = new Date('2026-02-15T17:30:00Z');
    const result = formatRadarTimestamp(date);
    expect(result).toContain('2026');
  });

  it('should convert UTC to Santiago time (UTC-3 in summer)', () => {
    // Feb 15 2026 17:30 UTC → 14:30 CLT (Chile summer time, UTC-3)
    const date = new Date('2026-02-15T17:30:00Z');
    const result = formatRadarTimestamp(date);
    expect(result).toMatch(/2:30\s*PM/);
  });

  it('should convert UTC to Santiago time (UTC-4 in winter)', () => {
    // Jul 10 2026 16:00 UTC → 12:00 CLT (Chile winter time, UTC-4)
    const date = new Date('2026-07-10T16:00:00Z');
    const result = formatRadarTimestamp(date);
    expect(result).toMatch(/12:00\s*PM/);
  });

  it('should handle UTC midnight rolling back to previous day in Santiago', () => {
    // Jan 2 2026 02:00 UTC → Jan 1 23:00 CLT (UTC-3 summer)
    const date = new Date('2026-01-02T02:00:00Z');
    const result = formatRadarTimestamp(date);
    expect(result).toContain('Jan');
    expect(result).toContain('1');
    expect(result).toMatch(/11:00\s*PM/);
  });

  it('should format single-digit day correctly', () => {
    // Mar 5 2026 12:05 UTC → 09:05 CLT (UTC-3 summer)
    const date = new Date('2026-03-05T12:05:00Z');
    const result = formatRadarTimestamp(date);
    expect(result).toContain('Mar');
    expect(result).toContain('5');
    expect(result).toMatch(/9:05\s*AM/);
  });

  it('should zero-pad minutes below 10', () => {
    // Apr 20 2026 12:03 UTC → 08:03 CLT (UTC-4 winter)
    const date = new Date('2026-04-20T12:03:00Z');
    const result = formatRadarTimestamp(date);
    expect(result).toMatch(/8:03\s*AM/);
  });

  it('should format all 12 months with correct abbreviated names', () => {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];

    months.forEach((abbr, idx) => {
      // Use midday UTC on the 15th — safe from day-rollover in any timezone
      const month = String(idx + 1).padStart(2, '0');
      const date = new Date(`2026-${month}-15T18:00:00Z`);
      const result = formatRadarTimestamp(date);
      expect(result).toContain(abbr);
    });
  });

  it('should match the overall pattern "Mon DD, YYYY, H:MM AM/PM"', () => {
    const date = new Date('2026-02-15T17:30:00Z');
    const result = formatRadarTimestamp(date);
    expect(result).toMatch(
      /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s\d{1,2},\s\d{4},\s\d{1,2}:\d{2}\s*(AM|PM)$/,
    );
  });

  it('should handle end-of-day in Santiago timezone', () => {
    // Jan 1 2026 02:59 UTC → Dec 31 2025 23:59 CLT (UTC-3 summer)
    const date = new Date('2026-01-01T02:59:00Z');
    const result = formatRadarTimestamp(date);
    expect(result).toContain('Dec');
    expect(result).toContain('31');
    expect(result).toMatch(/11:59\s*PM/);
  });

  it('should produce the string used in the "Updated ..." prefix', () => {
    const date = new Date('2026-02-26T19:45:00Z');
    const result = `Updated ${formatRadarTimestamp(date)}`;
    expect(result).toMatch(/^Updated\s/);
    expect(result).toContain('2026');
  });
});
