/**
 * Domain types for the Interactive Regulatory Map feature.
 * Used by build-time data validation (Zod) and client-side rendering (D3).
 */

export interface Regulation {
  id: string;
  name: string;
  regions: string[];
  effectiveDate: string;
  summary: string;
  keyRequirements?: string[];
  penalties?: string;
}

export interface RegionSelectedDetail {
  regionId: string;
}

declare global {
  interface WindowEventMap {
    regionSelected: CustomEvent<RegionSelectedDetail>;
  }
}
