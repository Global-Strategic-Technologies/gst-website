/**
 * Portfolio types.
 *
 * Data-shape types (Project, Currency, GrowthStage, EngagementType,
 * SortableColumn, SortDirection) and their value constants are re-exported
 * from `src/schemas/portfolio.ts` (single source of truth via Zod).
 *
 * Client-side types (Stat, FilterState, SortState) live here because they
 * don't describe data on disk — they describe runtime UI state.
 */

export {
  SUPPORTED_CURRENCIES,
  GROWTH_STAGE_VALUES,
  ENGAGEMENT_TYPE_VALUES,
  ENGAGEMENT_CATEGORY_VALUES,
  SORTABLE_COLUMNS,
  SORT_DIRECTIONS,
} from '../schemas/portfolio';

export type {
  Currency,
  GrowthStage,
  EngagementType,
  EngagementCategory,
  SortableColumn,
  SortDirection,
  Project,
} from '../schemas/portfolio';

import type { SortableColumn, SortDirection } from '../schemas/portfolio';

/**
 * Statistics display interface
 */
export interface Stat {
  value: string;
  label: string;
}

/**
 * Filter state interface
 */
export interface FilterState {
  search: string;
  theme: string;
  year: string;
  engagement: string;
  type: string;
}

/**
 * Sort state interface
 */
export interface SortState {
  column: SortableColumn | null;
  direction: SortDirection;
}
