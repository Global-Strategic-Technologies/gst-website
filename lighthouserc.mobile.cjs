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
      ],
      numberOfRuns: 1,
      settings: {
        // No preset — Lighthouse defaults to mobile emulation
        // (Moto G Power, 4x CPU slowdown, simulated slow 4G)
        onlyCategories: ['performance'],
      },
    },
    assert: {
      assertions: {
        // Mobile thresholds — more lenient than desktop
        'first-contentful-paint': ['warn', { maxNumericValue: 3000 }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 4000 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['warn', { maxNumericValue: 400 }],
        interactive: ['warn', { maxNumericValue: 5000 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
