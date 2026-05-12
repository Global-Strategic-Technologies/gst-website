/**
 * Runtime configuration for the GST MCP server.
 *
 * `HUB_BASE` is the absolute origin where the website is reachable. Used
 * by Tool wrappers to build deep-links back to populated Hub-tool pages
 * (Tech Debt, ICG, Regulatory Map). Defaults to the production origin;
 * override with `GST_HUB_BASE=http://localhost:4321` (or similar) when
 * exercising deep-links against a dev server.
 */

export const HUB_BASE: string = process.env.GST_HUB_BASE ?? 'https://globalstrategic.tech';
