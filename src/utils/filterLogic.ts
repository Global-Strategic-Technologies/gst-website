import type { Project, EngagementType } from '../types/portfolio';

/**
 * Engagement type categorization constants
 */
export const ENGAGEMENT_CATEGORIES = {
  valueCreation: ['Value Creation'],
  technicalDiligence: ['Technical Assessment', 'Technical Diligence'],
} as const;

/**
 * Growth stage categorization keywords
 */
export const GROWTH_KEYWORDS = [
  'growth',
  'expansion',
  'small',
  'scaling',
  'scale-up',
  'startup',
  'early',
];

/**
 * Mature stage categorization keywords
 */
export const MATURE_KEYWORDS = [
  'mature',
  'maturity',
  'established',
  'developed',
  'legacy',
  'modernizing',
  'enterprise',
];

/**
 * Canonical maturity-progression order for the dataset's growth-stage strings.
 *
 * Used by `getUniqueGrowthStages` to produce a deal-team-meaningful sort.
 * Plain alphabetical ordering doesn't reflect maturity progression — for
 * example, `'Established Market Leader'` would land between `'Early-Stage'`
 * and `'Expansion Stage'`, which violates the natural growth → mature
 * sequence consultants expect when scanning a filter dropdown or facet list.
 *
 * Stages absent from this list fall back to alphabetical ordering AFTER the
 * known progression, so the contract degrades gracefully when new stage
 * values are added to `projects.json` before the constant is updated.
 */
export const GROWTH_STAGE_PROGRESSION_ORDER = [
  'Early-Stage Growth',
  'Scaling Growth',
  'Expansion Stage',
  'Mature Enterprise',
  'Established Market Leader',
  'Legacy System',
] as const;

/**
 * Filter criteria interface
 */
export interface FilterCriteria {
  search: string;
  theme: string; // 'all' | specific theme name
  engagement: string; // 'all' | specific engagementCategory value
}

/**
 * Categorizes a growth stage string into growth, mature, or other categories
 * Uses keyword matching to identify company maturity level
 * @param stage - The growth stage string to categorize
 * @returns 'growth' for early-stage companies, 'mature' for established companies, 'other' for unknown
 * @example
 * categorizeGrowthStage('Early-Stage Growth') // returns 'growth'
 * categorizeGrowthStage('Mature Enterprise') // returns 'mature'
 */
export function categorizeGrowthStage(stage: string): 'growth' | 'mature' | 'other' {
  const stageLower = stage.toLowerCase();

  // Check for growth stage indicators
  if (GROWTH_KEYWORDS.some((keyword) => stageLower.includes(keyword))) {
    return 'growth';
  }

  // Check for mature stage indicators
  if (MATURE_KEYWORDS.some((keyword) => stageLower.includes(keyword))) {
    return 'mature';
  }

  // Unknown or unclassified stage
  return 'other';
}

/**
 * Returns true if the engagement type belongs to the value-creation category.
 * Centralizes the readonly-array membership check so call sites don't repeat
 * the cast pattern.
 */
export function isValueCreationEngagement(engagementType: string | undefined): boolean {
  if (!engagementType) return false;
  return (ENGAGEMENT_CATEGORIES.valueCreation as readonly string[]).includes(engagementType);
}

/**
 * Returns true if the engagement type belongs to the technical-diligence category.
 */
export function isTechnicalDiligenceEngagement(engagementType: string | undefined): boolean {
  if (!engagementType) return false;
  return (ENGAGEMENT_CATEGORIES.technicalDiligence as readonly string[]).includes(engagementType);
}

/**
 * Categorizes an engagement type into predefined categories
 * Maps specific engagement types to broader categories for filtering
 * @param engagementType - The engagement type to categorize (may be undefined)
 * @returns 'value-creation' for growth engagements, 'technical-diligence' for assessment engagements, 'other' for unknown
 * @example
 * categorizeEngagementType('Value Creation') // returns 'value-creation'
 * categorizeEngagementType('Technical Diligence') // returns 'technical-diligence'
 */
export function categorizeEngagementType(
  engagementType: string | undefined
): 'value-creation' | 'technical-diligence' | 'other' {
  if (isValueCreationEngagement(engagementType)) return 'value-creation';
  if (isTechnicalDiligenceEngagement(engagementType)) return 'technical-diligence';
  return 'other';
}

/**
 * Gets all unique growth stages from a list of projects, sorted by the
 * canonical maturity progression in `GROWTH_STAGE_PROGRESSION_ORDER`.
 * Stages not present in that constant are appended alphabetically after
 * the known progression.
 * @param projects - Array of projects to analyze
 * @returns Deduplicated, progression-ordered array of growth stages
 */
export function getUniqueGrowthStages(projects: Project[]): string[] {
  const unique = [...new Set(projects.map((p) => p.growthStage))];
  return unique.sort((a, b) => {
    const ai = (GROWTH_STAGE_PROGRESSION_ORDER as readonly string[]).indexOf(a);
    const bi = (GROWTH_STAGE_PROGRESSION_ORDER as readonly string[]).indexOf(b);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.localeCompare(b);
  });
}

/**
 * Gets all growth stage projects from a list of projects
 * @param projects - Array of projects to analyze
 * @returns Array of growth stage projects
 */
export function getGrowthStageProjects(projects: Project[]): string[] {
  const uniqueStages = getUniqueGrowthStages(projects);
  return uniqueStages.filter((stage) => categorizeGrowthStage(stage) === 'growth').sort();
}

/**
 * Gets all mature stage projects from a list of projects
 * @param projects - Array of projects to analyze
 * @returns Array of mature stage projects
 */
export function getMatureStageProjects(projects: Project[]): string[] {
  const uniqueStages = getUniqueGrowthStages(projects);
  return uniqueStages.filter((stage) => categorizeGrowthStage(stage) === 'mature').sort();
}

/**
 * Gets all unique themes from a list of projects
 * @param projects - Array of projects to analyze
 * @returns Sorted array of unique themes
 */
export function getUniqueThemes(projects: Project[]): string[] {
  return [...new Set(projects.map((p) => p.theme))].sort();
}

/**
 * Gets all unique years from a list of projects
 * @param projects - Array of projects to analyze
 * @returns Array of unique years sorted in descending order
 */
export function getUniqueYears(projects: Project[]): number[] {
  return [...new Set(projects.map((p) => p.year))].sort((a, b) => b - a);
}

/**
 * Gets all unique engagement types from a list of projects
 * @param projects - Array of projects to analyze
 * @returns Sorted array of unique engagement types
 */
export function getUniqueEngagementTypes(projects: Project[]): EngagementType[] {
  return [
    ...new Set(
      projects.map((p) => p.engagementType).filter((e): e is EngagementType => e !== undefined)
    ),
  ].sort();
}

/**
 * Gets all unique engagement categories from a list of projects
 * @param projects - Array of projects to analyze
 * @returns Sorted array of unique engagement category strings
 */
export function getUniqueEngagementCategories(projects: Project[]): string[] {
  return [
    ...new Set(
      projects
        .map((p) => p.engagementCategory)
        .filter((c): c is NonNullable<typeof c> => c !== undefined && c !== null)
    ),
  ].sort();
}

/**
 * Extracts searchable text from a project
 * @param project - Project to extract text from
 * @returns Combined searchable text
 */
export function createSearchableText(project: Project): string {
  return [project.codeName, project.industry, project.summary, ...project.technologies]
    .join(' ')
    .toLowerCase();
}

/**
 * Filters projects based on provided criteria
 * @param projects - Array of projects to filter
 * @param criteria - Filter criteria to apply
 * @returns Filtered array of projects
 */
export function filterProjects(projects: Project[], criteria: FilterCriteria): Project[] {
  return projects.filter((project) => {
    // Search filter
    if (criteria.search) {
      const searchLower = criteria.search.toLowerCase();
      const searchableText = createSearchableText(project);

      if (!searchableText.includes(searchLower)) return false;
    }

    // Theme filter
    if (criteria.theme !== 'all' && project.theme !== criteria.theme) {
      return false;
    }

    // Engagement category filter (engagementCategory field)
    if (criteria.engagement !== 'all') {
      if (project.engagementCategory !== criteria.engagement) return false;
    }

    return true;
  });
}

/**
 * Compute which filter chip values remain available given current filters.
 * For each filter dimension, determines which values still have matching
 * projects when all OTHER active filters are applied. This prevents users
 * from selecting combinations that yield zero results.
 *
 * @param projects - All projects (unfiltered)
 * @param criteria - Current active filter state
 * @returns Sets of available values for each filter dimension
 */
export function computeAvailableChips(
  projects: Project[],
  criteria: FilterCriteria
): { engagement: Set<string>; theme: Set<string> } {
  const available = { engagement: new Set<string>(), theme: new Set<string>() };

  for (const project of projects) {
    // Apply search filter
    if (criteria.search) {
      const searchLower = criteria.search.toLowerCase();
      const searchableText = createSearchableText(project);
      if (!searchableText.includes(searchLower)) continue;
    }

    const matchesEngagement =
      criteria.engagement === 'all' || project.engagementCategory === criteria.engagement;
    const matchesTheme = criteria.theme === 'all' || project.theme === criteria.theme;

    // Cross-dimensional availability: each dimension shows values available
    // given the OTHER dimension's active filter
    if (matchesTheme) available.engagement.add(project.engagementCategory ?? '');
    if (matchesEngagement) available.theme.add(project.theme);
  }

  return available;
}
