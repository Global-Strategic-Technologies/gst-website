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
 * Filter criteria interface
 */
export interface FilterCriteria {
  search: string;
  theme: string; // 'all' | specific theme name
  year: string; // 'all' | year as string
  engagement: string; // 'all' | specific engagementCategory value
  type: string; // 'all' | specific engagementType value
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
 * Gets all unique growth stages from a list of projects
 * @param projects - Array of projects to analyze
 * @returns Array of unique growth stages
 */
export function getUniqueGrowthStages(projects: Project[]): string[] {
  return [...new Set(projects.map((p) => p.growthStage))];
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

    // Year filter
    if (criteria.year !== 'all' && project.year.toString() !== criteria.year) {
      return false;
    }

    // Engagement category filter (engagementCategory field)
    if (criteria.engagement !== 'all') {
      if (project.engagementCategory !== criteria.engagement) return false;
    }

    // Engagement type filter (engagementType field)
    if (criteria.type !== 'all') {
      if (project.engagementType !== criteria.type) return false;
    }

    return true;
  });
}
