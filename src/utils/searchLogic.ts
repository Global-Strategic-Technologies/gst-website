import type { Project } from '../types/portfolio';
import { createSearchableText } from './filterLogic';

/**
 * Performs case-insensitive search across project data
 * Searches across code name, industry, summary, and technologies
 * Returns all projects if search term is empty or whitespace
 * @param projects - Array of projects to search
 * @param searchTerm - The search term to look for (case-insensitive)
 * @returns Filtered array of projects matching the search term
 * @example
 * performSearch(projects, 'React') // returns projects using React
 * performSearch(projects, '') // returns all projects
 */
export function performSearch(projects: Project[], searchTerm: string): Project[] {
  // Return all projects if search term is empty or only whitespace
  if (!searchTerm.trim()) {
    return projects;
  }

  const searchLower = searchTerm.toLowerCase();

  return projects.filter(project => {
    const searchableText = createSearchableText(project);
    return searchableText.includes(searchLower);
  });
}

/**
 * Debounces a function to delay its execution.
 * Uses split generics (A for args, R for return) so callers with any
 * argument shape can bind cleanly — a `(...args: unknown[]) => unknown`
 * constraint is too strict for concrete callers like `(term: string) => void`.
 *
 * @param func - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function
 */
export function debounce<A extends unknown[], R>(
  func: (...args: A) => R,
  delay: number
): (...args: A) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function debounced(...args: A) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Creates a debounced search function
 * @param callback - Function to call with search results
 * @param delay - Delay in milliseconds (default: 300ms)
 * @returns Debounced search function
 */
export function createDebouncedSearch(
  callback: (term: string) => void,
  delay: number = 300
): (term: string) => void {
  return debounce(callback, delay);
}

/**
 * Highlights search term matches in text (for UI enhancement)
 * @param text - Text to highlight matches in
 * @param searchTerm - Term to highlight
 * @returns HTML string with highlights (if needed for rendering)
 */
export function highlightSearchTerm(text: string, searchTerm: string): string {
  if (!searchTerm.trim()) {
    return text;
  }

  const regex = new RegExp(`(${searchTerm})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

/**
 * Calculates relevance score for a project based on search term matches
 * Scoring hierarchy: exact name match (100) > partial name (50) > industry (30) > technology (25) > summary (10)
 * Returns 0 for empty search terms
 * @param project - Project to score
 * @param searchTerm - Search term to match against
 * @returns Relevance score where higher values indicate better matches (0 = no match)
 * @example
 * getSearchRelevance(project, 'Tech Corp') // returns 100 if exact name match
 * getSearchRelevance(project, 'Tech') // returns 50 if partial name match
 */
export function getSearchRelevance(project: Project, searchTerm: string): number {
  // Return 0 for empty search terms
  if (!searchTerm.trim()) {
    return 0;
  }

  const searchLower = searchTerm.toLowerCase();
  let score = 0;

  // Exact match in code name - highest priority (100 points)
  if (project.codeName.toLowerCase() === searchLower) {
    score += 100;
  }
  // Partial match in code name - high priority (50 points)
  else if (project.codeName.toLowerCase().includes(searchLower)) {
    score += 50;
  }

  // Match in industry - medium priority (30 points)
  if (project.industry.toLowerCase().includes(searchLower)) {
    score += 30;
  }

  // Match in technologies - medium-low priority (25 points)
  if (Array.isArray(project.technologies)) {
    if (
      project.technologies.some(t =>
        t.toLowerCase().includes(searchLower)
      )
    ) {
      score += 25;
    }
  }

  // Match in summary - lowest priority (10 points)
  if (project.summary.toLowerCase().includes(searchLower)) {
    score += 10;
  }

  return score;
}

/**
 * Sorts projects by search relevance
 * @param projects - Projects to sort
 * @param searchTerm - Search term for relevance calculation
 * @returns Projects sorted by relevance (highest first)
 */
export function sortBySearchRelevance(
  projects: Project[],
  searchTerm: string
): Project[] {
  if (!searchTerm.trim()) {
    return projects;
  }

  return [...projects].sort(
    (a, b) => getSearchRelevance(b, searchTerm) - getSearchRelevance(a, searchTerm)
  );
}
