module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npm run dev',
      startServerReadyPattern: 'localhost',
      startServerReadyTimeout: 30000,
      url: [
        'http://localhost:4321/',
        'http://localhost:4321/about',
        'http://localhost:4321/services',
        'http://localhost:4321/ma-portfolio',
        'http://localhost:4321/brand',
        'http://localhost:4321/hub',
        'http://localhost:4321/hub/tools/tech-debt-calculator',
        'http://localhost:4321/hub/tools/diligence-machine',
        'http://localhost:4321/hub/tools/regulatory-map',
        'http://localhost:4321/hub/tools/techpar',
        'http://localhost:4321/hub/radar',
        'http://localhost:4321/hub/library',
      ],
      numberOfRuns: 1,
      settings: {
        preset: 'desktop',
        onlyCategories: ['performance'],
      },
    },
    assert: {
      assertions: {
        'first-contentful-paint': ['warn', { maxNumericValue: 1800 }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['warn', { maxNumericValue: 200 }],
        interactive: ['warn', { maxNumericValue: 3500 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
