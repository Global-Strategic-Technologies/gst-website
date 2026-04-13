# Hub Tool Documentation

Technical documentation for GST Hub interactive tools.

## Tools

| Tool                     | Doc                                                                                              | Purpose                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Diligence Machine        | [DILIGENCE_MACHINE.md](DILIGENCE_MACHINE.md)                                                     | Wizard-based due diligence agenda generator             |
| Radar                    | [RADAR.md](RADAR.md)                                                                             | SSR news feed via Inoreader API with ISR caching        |
| Regulatory Map           | [REGULATORY_MAP.md](REGULATORY_MAP.md)                                                           | Interactive global regulation browser (120 regulations) |
| Regulatory Map Expansion | [REGULATORY_MAP_FINANCIAL_SERVICES_EXPANSION.md](REGULATORY_MAP_FINANCIAL_SERVICES_EXPANSION.md) | Planned financial services regulation additions         |

## Architecture Notes

- All tools live under `src/pages/hub/tools/<tool>/index.astro`
- TechPar, ICG, and Tech Debt Calculator use engine modules in `src/utils/`
- Radar is the only SSR page (ISR via Vercel adapter); all others are prerendered
- Analytics events follow the `<prefix>_<action>` convention (see [GOOGLE_ANALYTICS.md](../analytics/GOOGLE_ANALYTICS.md#8-hub-tool-events))
