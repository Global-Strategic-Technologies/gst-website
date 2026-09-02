# Hub Tool Documentation

Technical documentation for GST Hub interactive tools.

## Tools

| Tool                     | Doc                                                                                              | Purpose                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Diligence Machine        | [DILIGENCE_MACHINE.md](DILIGENCE_MACHINE.md)                                                     | Wizard-based due diligence agenda generator             |
| Radar                    | [RADAR.md](RADAR.md)                                                                             | SSR news feed via Inoreader API with ISR caching        |
| Regulatory Map           | [REGULATORY_MAP.md](REGULATORY_MAP.md)                                                           | Interactive global regulation browser (123 regulations) |
| Regulatory Map Expansion | [REGULATORY_MAP_FINANCIAL_SERVICES_EXPANSION.md](REGULATORY_MAP_FINANCIAL_SERVICES_EXPANSION.md) | Planned financial services regulation additions         |

## MCP Onboarding Pages

Not tools — the practitioner guides and the capability reference under `/hub/mcp/`:

| Doc                                              | Purpose                                                                                                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [MCP_ONBOARDING.md](MCP_ONBOARDING.md)           | The onboarding guides' clip-player pattern, per-clip constraints, reduced-motion rule, re-record trigger, and re-encode recipes                 |
| [MCP_CAPABILITY_DOCS.md](MCP_CAPABILITY_DOCS.md) | `/hub/mcp/docs/`: the capability registry, how to add or change a capability, the machine-checked copy rules, and the `docs.mcp.…` Worker alias |

## Architecture Notes

- All tools live under `src/pages/hub/tools/<tool>/index.astro`
- TechPar, ICG, and Tech Debt Calculator use engine modules in `src/utils/`
- Radar is the only SSR page (ISR via Vercel adapter); all others are prerendered
- Analytics events follow the `<prefix>_<action>` convention (see [GOOGLE_ANALYTICS.md](../analytics/GOOGLE_ANALYTICS.md#9-hub-tool-events))

---

← Back to [Master Documentation Index](../README.md)
