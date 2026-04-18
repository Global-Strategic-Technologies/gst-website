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

  return projects.filter((project) => {
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
