import { BREADCRUMB_NAMES, slugToName } from '@/utils/breadcrumbs';

describe('BREADCRUMB_NAMES', () => {
  it('should contain all expected route slugs', () => {
    const expectedSlugs = [
      'services',
      'about',
      'ma-portfolio',
      'privacy',
      'terms',
      'hub',
      'tools',
      'diligence-machine',
      'library',
      'business-architectures',
      'vdr-structure',
      'radar',
      'techpar',
      'regulatory-map',
      'tech-debt-calculator',
      'infrastructure-cost-governance',
    ];

    for (const slug of expectedSlugs) {
      expect(BREADCRUMB_NAMES).toHaveProperty(slug);
    }
  });

  it('should have no empty display names', () => {
    Object.entries(BREADCRUMB_NAMES).forEach(([_slug, name]) => {
      expect(name.trim().length).toBeGreaterThan(0);
    });
  });

  it('should map known slugs to expected display names', () => {
    expect(BREADCRUMB_NAMES['ma-portfolio']).toBe('M&A Portfolio');
    expect(BREADCRUMB_NAMES['hub']).toBe('The GST Hub');
    expect(BREADCRUMB_NAMES['diligence-machine']).toBe('Diligence Machine');
    expect(BREADCRUMB_NAMES['regulatory-map']).toBe('Regulatory Map');
    expect(BREADCRUMB_NAMES['infrastructure-cost-governance']).toBe(
      'Infrastructure Cost Governance'
    );
  });
});

describe('slugToName', () => {
  it('should return canonical name for known slugs', () => {
    expect(slugToName('hub')).toBe('The GST Hub');
    expect(slugToName('ma-portfolio')).toBe('M&A Portfolio');
    expect(slugToName('techpar')).toBe('TechPar');
  });

  it('should title-case unknown slugs as fallback', () => {
    expect(slugToName('unknown-slug')).toBe('Unknown Slug');
    expect(slugToName('my-new-page')).toBe('My New Page');
  });

  it('should handle single-word unknown slugs', () => {
    expect(slugToName('dashboard')).toBe('Dashboard');
  });
});
